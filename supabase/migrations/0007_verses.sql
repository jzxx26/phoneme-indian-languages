-- =============================================================================
-- Migration 0007 - Verses for "hear and repeat" recitation
--
-- A verse (a Thirukkural couplet, a Kabir doha, ...) is a titled group of
-- lines. Each line is an ordinary row in `sentences` pointing at its verse, so
-- recording a line goes through the existing /api/assess route, attempts and
-- progress views unchanged. Lines are excluded from the normal practice list
-- by `verse_id is null`.
-- =============================================================================

create table if not exists public.verses (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references public.languages (code) on update cascade,
  collection    text not null,                  -- e.g. 'Thirukkural', 'Kabir ke Dohe'
  number        int not null,                   -- position within the collection, e.g. Kural 391
  title         text not null,                  -- learner-facing title
  author        text,                           -- e.g. 'Thiruvalluvar', 'Kabir'
  meaning       text,                           -- English meaning of the whole verse
  difficulty    public.difficulty_level not null default 'intermediate',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint verses_unique_per_collection unique (language_code, collection, number)
);

comment on table public.verses is 'Poems / couplets for line-by-line hear-and-repeat recitation.';

alter table public.sentences
  add column if not exists verse_id   uuid references public.verses (id) on delete cascade,
  add column if not exists verse_line int;

alter table public.sentences
  drop constraint if exists sentences_verse_line_consistent;
alter table public.sentences
  add constraint sentences_verse_line_consistent
  check ((verse_id is null) = (verse_line is null));

-- Lines of a verse, in order (also serves the foreign key).
create unique index if not exists sentences_verse_line_idx
  on public.sentences (verse_id, verse_line)
  where verse_id is not null;

-- Normal practice list: active, non-verse items per language.
create index if not exists sentences_practice_idx
  on public.sentences (language_code, difficulty, created_at)
  where is_active and verse_id is null;

create index if not exists verses_language_idx
  on public.verses (language_code, collection, number)
  where is_active;

alter table public.verses enable row level security;

drop policy if exists "verses_select_active" on public.verses;
create policy "verses_select_active" on public.verses
  for select to authenticated using (is_active);
