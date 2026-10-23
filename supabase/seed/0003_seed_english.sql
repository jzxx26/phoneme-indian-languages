-- =============================================================================
-- Migration 0003 - Review 2 seed data: English (en-IN)
--
-- Enables English content for Review 2 spelling teaching & spoken spelling check.
-- =============================================================================

insert into public.languages (code, name, native_name, is_active, sort_order)
values ('en-IN', 'English', 'English', true, 2)
on conflict (code) do update
  set name        = excluded.name,
      native_name = excluded.native_name,
      is_active   = excluded.is_active,
      sort_order  = excluded.sort_order;

-- Practice items including single words with spelling practice, phrases, sentences
insert into public.sentences (language_code, text, transliteration, translation, kind, difficulty)
values
  -- --- simple words (used for spelling teaching & check) ----------------------
  ('en-IN', 'teeth',            null,  'teeth (plural of tooth)',       'word',     'beginner'),
  ('en-IN', 'water',            null,  'drinking water',                'word',     'beginner'),
  ('en-IN', 'house',            null,  'home / dwelling',               'word',     'beginner'),
  ('en-IN', 'flower',           null,  'blossom / plant flower',        'word',     'beginner'),
  ('en-IN', 'friend',           null,  'companion / friend',            'word',     'beginner'),
  ('en-IN', 'book',             null,  'reading book',                  'word',     'beginner'),
  ('en-IN', 'school',           null,  'place of education',            'word',     'intermediate'),
  ('en-IN', 'mother',           null,  'parent / mother',               'word',     'beginner'),
  ('en-IN', 'father',           null,  'parent / father',               'word',     'beginner'),

  -- --- phrases ----------------------------------------------------------------
  ('en-IN', 'Good morning',     null,  'Standard morning greeting',     'phrase',   'beginner'),
  ('en-IN', 'Thank you',        null,  'Expression of gratitude',       'phrase',   'beginner'),

  -- --- short sentences --------------------------------------------------------
  ('en-IN', 'I am learning to speak clearly', null, 'Practice sentence', 'sentence', 'intermediate'),
  ('en-IN', 'This is my favourite book',      null, 'Practice sentence', 'sentence', 'intermediate')
on conflict (language_code, text) do update
  set transliteration = excluded.transliteration,
      translation     = excluded.translation,
      kind            = excluded.kind,
      difficulty      = excluded.difficulty,
      is_active       = true;
