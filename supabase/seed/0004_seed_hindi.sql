-- =============================================================================
-- Migration 0004 - Review 2 seed data: Hindi (hi-IN)
--
-- Adds Hindi as a data-only change: one languages row plus practice items.
-- Translations reuse the English meanings in src/lib/images.ts so word items
-- get a picture clue without any code change.
-- =============================================================================

insert into public.languages (code, name, native_name, is_active, sort_order)
values ('hi-IN', 'Hindi', 'हिन्दी', true, 3)
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
  ('hi-IN', 'माँ',              'maa',                       'mother',                  'word',     'beginner'),
  ('hi-IN', 'पिता',             'pitaa',                     'father',                  'word',     'beginner'),
  ('hi-IN', 'पानी',             'paani',                     'water',                   'word',     'beginner'),
  ('hi-IN', 'घर',               'ghar',                      'house',                   'word',     'beginner'),
  ('hi-IN', 'फूल',              'phool',                     'flower',                  'word',     'beginner'),
  ('hi-IN', 'दोस्त',            'dost',                      'friend',                  'word',     'beginner'),
  ('hi-IN', 'किताब',            'kitaab',                    'book',                    'word',     'beginner'),
  ('hi-IN', 'खाना',             'khaanaa',                   'food / meal',             'word',     'beginner'),
  ('hi-IN', 'दाँत',             'daant',                     'teeth',                   'word',     'intermediate'),
  ('hi-IN', 'विद्यालय',          'vidyaalay',                 'school',                  'word',     'intermediate'),

  -- --- common greetings and short phrases --------------------------------------
  ('hi-IN', 'नमस्ते',            'namaste',                   'hello / greetings',       'phrase',   'beginner'),
  ('hi-IN', 'धन्यवाद',           'dhanyavaad',                'thank you',               'phrase',   'beginner'),
  ('hi-IN', 'सुप्रभात',           'suprabhaat',                'good morning',            'phrase',   'beginner'),
  ('hi-IN', 'शुभ रात्रि',          'shubh raatri',              'good night',              'phrase',   'beginner'),

  -- --- short sentences ---------------------------------------------------------
  ('hi-IN', 'मुझे हिन्दी पसंद है',         'mujhe hindi pasand hai',         'I like Hindi',                'sentence', 'beginner'),
  ('hi-IN', 'यह मेरी किताब है',           'yah meri kitaab hai',            'This is my book',             'sentence', 'beginner'),
  ('hi-IN', 'मुझे पानी चाहिए',            'mujhe paani chaahiye',           'I want water',                'sentence', 'beginner'),
  ('hi-IN', 'आपका नाम क्या है',           'aapkaa naam kyaa hai',           'What is your name',           'sentence', 'beginner'),
  ('hi-IN', 'मैं ठीक हूँ',                'main theek hoon',                'I am doing well',             'sentence', 'intermediate'),
  ('hi-IN', 'मैं हिन्दी सीख रहा हूँ',       'main hindi seekh rahaa hoon',    'I am learning Hindi',         'sentence', 'intermediate')
on conflict (language_code, text) do update
  set transliteration = excluded.transliteration,
      translation     = excluded.translation,
      kind            = excluded.kind,
      difficulty      = excluded.difficulty,
      is_active       = true;
