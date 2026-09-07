-- =============================================================================
-- Migration 0002 - Review 1 seed data: Tamil (ta-IN)
--
-- Only Tamil is activated in this review. Additional locales are added in later
-- reviews by inserting rows here and in src/lib/languages.ts - no schema change.
-- =============================================================================

insert into public.languages (code, name, native_name, is_active, sort_order)
values ('ta-IN', 'Tamil', 'தமிழ்', true, 1)
on conflict (code) do update
  set name        = excluded.name,
      native_name = excluded.native_name,
      is_active   = excluded.is_active,
      sort_order  = excluded.sort_order;

-- 20 beginner-friendly practice items: 10 single words, 4 short phrases,
-- 6 short sentences.
insert into public.sentences (language_code, text, transliteration, translation, kind, difficulty)
values
  -- --- simple / everyday words -------------------------------------------------
  ('ta-IN', 'அம்மா',            'ammaa',                     'mother',                  'word',     'beginner'),
  ('ta-IN', 'அப்பா',            'appaa',                     'father',                  'word',     'beginner'),
  ('ta-IN', 'நீர்',              'neer',                      'water',                   'word',     'beginner'),
  ('ta-IN', 'வீடு',             'veedu',                     'house',                   'word',     'beginner'),
  ('ta-IN', 'பூ',               'poo',                       'flower',                  'word',     'beginner'),
  ('ta-IN', 'நண்பன்',           'nanban',                    'friend',                  'word',     'beginner'),
  ('ta-IN', 'புத்தகம்',          'puthagam',                  'book',                    'word',     'beginner'),
  ('ta-IN', 'சாப்பாடு',          'saappaadu',                 'food / meal',             'word',     'beginner'),
  ('ta-IN', 'பள்ளிக்கூடம்',       'pallikkoodam',              'school',                  'word',     'intermediate'),
  ('ta-IN', 'தண்ணீர்',           'thanneer',                  'drinking water',          'word',     'intermediate'),

  -- --- common greetings and short phrases --------------------------------------
  ('ta-IN', 'வணக்கம்',           'vanakkam',                  'hello / greetings',       'phrase',   'beginner'),
  ('ta-IN', 'நன்றி',             'nandri',                    'thank you',               'phrase',   'beginner'),
  ('ta-IN', 'காலை வணக்கம்',      'kaalai vanakkam',           'good morning',            'phrase',   'beginner'),
  ('ta-IN', 'நல்ல இரவு',         'nalla iravu',               'good night',              'phrase',   'beginner'),

  -- --- short sentences ---------------------------------------------------------
  ('ta-IN', 'எனக்கு தமிழ் பிடிக்கும்',           'enakku thamizh pidikkum',        'I like Tamil',                'sentence', 'beginner'),
  ('ta-IN', 'இது என் புத்தகம்',                 'idhu en puthagam',               'This is my book',             'sentence', 'beginner'),
  ('ta-IN', 'எனக்கு தண்ணீர் வேண்டும்',           'enakku thanneer vendum',         'I want water',                'sentence', 'beginner'),
  ('ta-IN', 'உங்கள் பெயர் என்ன',                'ungal peyar enna',               'What is your name',           'sentence', 'beginner'),
  ('ta-IN', 'நான் நன்றாக இருக்கிறேன்',           'naan nandraaga irukkiren',       'I am doing well',             'sentence', 'intermediate'),
  ('ta-IN', 'நான் தமிழ் கற்றுக் கொண்டு இருக்கிறேன்', 'naan thamizh katruk kondu irukkiren', 'I am learning Tamil',    'sentence', 'intermediate')
on conflict (language_code, text) do update
  set transliteration = excluded.transliteration,
      translation     = excluded.translation,
      kind            = excluded.kind,
      difficulty      = excluded.difficulty,
      is_active       = true;
