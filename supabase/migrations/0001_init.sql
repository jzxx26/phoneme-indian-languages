-- =============================================================================
-- Multilingual Pronunciation Learning and Assessment System
-- Migration 0001 - core schema
--
-- The schema is multilingual from day one: every piece of practice content and
-- every recorded attempt is keyed by a BCP-47 locale code. Review 1 only seeds
-- Tamil (ta-IN); adding a language later is a data change, not a schema change.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data for an authenticated user.';

-- -----------------------------------------------------------------------------
-- languages
--
-- Registry of locales the platform can serve. Mirrors src/lib/languages.ts so
-- that content can be filtered/joined in SQL without hardcoding locale strings.
-- -----------------------------------------------------------------------------
create table if not exists public.languages (
  code        text primary key,                 -- BCP-47 locale, e.g. 'ta-IN'
  name        text not null,                    -- English name, e.g. 'Tamil'
  native_name text not null,                    -- Native name, e.g. 'தமிழ்'
  is_active   boolean not null default true,    -- Available for practice
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.languages is 'Locales supported by the platform. Review 1 activates ta-IN only.';

-- -----------------------------------------------------------------------------
-- sentences (practice content: single words, phrases and short sentences)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'difficulty_level') then
    create type public.difficulty_level as enum ('beginner', 'intermediate', 'advanced');
  end if;
  if not exists (select 1 from pg_type where typname = 'content_kind') then
    create type public.content_kind as enum ('word', 'phrase', 'sentence');
  end if;
end
$$;

create table if not exists public.sentences (
  id              uuid primary key default gen_random_uuid(),
  language_code   text not null references public.languages (code) on update cascade,
  text            text not null,                -- Reference text sent to the assessment provider
  transliteration text,                         -- Latin-script hint (learner aid)
  translation     text,                         -- English meaning (learner aid)
  kind            public.content_kind not null default 'sentence',
  difficulty      public.difficulty_level not null default 'beginner',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint sentences_text_not_blank check (length(btrim(text)) > 0),
  constraint sentences_unique_per_language unique (language_code, text)
);

create index if not exists sentences_language_active_idx
  on public.sentences (language_code, is_active, difficulty);

comment on table public.sentences is 'Practice items. Reference text is always read from here server-side, never from the client.';

-- -----------------------------------------------------------------------------
-- attempts (one row per assessed recording)
-- -----------------------------------------------------------------------------
create table if not exists public.attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  sentence_id         uuid not null references public.sentences (id) on delete cascade,
  language_code       text not null references public.languages (code) on update cascade,
  reference_text      text not null,            -- Snapshot: content may be edited later
  recognized_text     text,                     -- What the provider actually heard
  pronunciation_score numeric(5, 2) check (pronunciation_score between 0 and 100),
  accuracy_score      numeric(5, 2) check (accuracy_score between 0 and 100),
  fluency_score       numeric(5, 2) check (fluency_score between 0 and 100),
  completeness_score  numeric(5, 2) check (completeness_score between 0 and 100),
  prosody_score       numeric(5, 2) check (prosody_score between 0 and 100),
  word_results        jsonb not null default '[]'::jsonb,
  provider            text not null default 'azure',
  created_at          timestamptz not null default now()
);

create index if not exists attempts_user_created_idx
  on public.attempts (user_id, created_at desc);
create index if not exists attempts_user_language_idx
  on public.attempts (user_id, language_code, created_at desc);
create index if not exists attempts_user_sentence_idx
  on public.attempts (user_id, sentence_id, created_at desc);

comment on table public.attempts is 'Normalised pronunciation assessment results, one row per recording.';
comment on column public.attempts.word_results is
  'Array of {word, accuracyScore, errorType} objects returned by the assessment provider.';

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles  enable row level security;
alter table public.languages enable row level security;
alter table public.sentences enable row level security;
alter table public.attempts  enable row level security;

-- profiles: a user may only see and edit their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- languages / sentences: shared read-only catalogue for signed-in users.
drop policy if exists "languages_select_active" on public.languages;
create policy "languages_select_active" on public.languages
  for select to authenticated using (is_active);

drop policy if exists "sentences_select_active" on public.sentences;
create policy "sentences_select_active" on public.sentences
  for select to authenticated using (is_active);

-- attempts: strictly per-user.
drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own" on public.attempts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "attempts_delete_own" on public.attempts;
create policy "attempts_delete_own" on public.attempts
  for delete to authenticated using (auth.uid() = user_id);

-- =============================================================================
-- Automatic profile creation on sign-up
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Progress views (security_invoker => the caller's RLS applies)
-- =============================================================================

-- Aggregate progress per user per language: powers the dashboard.
create or replace view public.user_language_stats
with (security_invoker = true) as
select
  a.user_id,
  a.language_code,
  count(*)::int                                    as attempt_count,
  count(distinct a.sentence_id)::int               as sentences_practiced,
  round(avg(a.pronunciation_score), 1)             as avg_pronunciation_score,
  round(avg(a.accuracy_score), 1)                  as avg_accuracy_score,
  round(avg(a.fluency_score), 1)                   as avg_fluency_score,
  round(avg(a.completeness_score), 1)              as avg_completeness_score,
  max(a.pronunciation_score)                       as best_pronunciation_score,
  max(a.created_at)                                as last_attempt_at
from public.attempts a
group by a.user_id, a.language_code;

-- First vs. latest score per practice item: powers "am I improving?".
create or replace view public.sentence_progress
with (security_invoker = true) as
select
  a.user_id,
  a.sentence_id,
  a.language_code,
  (array_agg(a.reference_text order by a.created_at desc))[1]                  as reference_text,
  count(*)::int                                                                as attempt_count,
  (array_agg(a.pronunciation_score order by a.created_at asc))[1]              as first_score,
  (array_agg(a.pronunciation_score order by a.created_at desc))[1]             as latest_score,
  max(a.pronunciation_score)                                                   as best_score,
  min(a.created_at)                                                            as first_attempt_at,
  max(a.created_at)                                                            as last_attempt_at
from public.attempts a
group by a.user_id, a.sentence_id, a.language_code;
