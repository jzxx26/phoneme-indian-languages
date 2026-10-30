-- =============================================================================
-- Migration 0005 - seed data: Kannada (kn-IN)
--
-- Adds Kannada as a data-only change: one languages row plus practice items.
-- Translations reuse the English meanings in src/lib/images.ts so word items
-- get a picture clue without any code change.
-- =============================================================================

insert into public.languages (code, name, native_name, is_active, sort_order)
values ('kn-IN', 'Kannada', 'ಕನ್ನಡ', true, 4)
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
  ('kn-IN', 'ಅಮ್ಮ', 'amma', 'mother', 'word', 'beginner'),
  ('kn-IN', 'ಅಪ್ಪ', 'appa', 'father', 'word', 'beginner'),
  ('kn-IN', 'ನೀರು', 'neeru', 'water', 'word', 'beginner'),
  ('kn-IN', 'ಮನೆ', 'mane', 'house', 'word', 'beginner'),
  ('kn-IN', 'ಹೂವು', 'hoovu', 'flower', 'word', 'beginner'),
  ('kn-IN', 'ಸ್ನೇಹಿತ', 'snehita', 'friend', 'word', 'beginner'),
  ('kn-IN', 'ಪುಸ್ತಕ', 'pustaka', 'book', 'word', 'beginner'),
  ('kn-IN', 'ಊಟ', 'oota', 'food / meal', 'word', 'beginner'),
  ('kn-IN', 'ಹಲ್ಲು', 'hallu', 'tooth / teeth', 'word', 'intermediate'),
  ('kn-IN', 'ಶಾಲೆ', 'shaale', 'school', 'word', 'intermediate'),

  -- --- common greetings and short phrases --------------------------------------
  ('kn-IN', 'ನಮಸ್ಕಾರ', 'namaskaara', 'hello / greetings', 'phrase', 'beginner'),
  ('kn-IN', 'ಧನ್ಯವಾದ', 'dhanyavaada', 'thank you', 'phrase', 'beginner'),
  ('kn-IN', 'ಶುಭೋದಯ', 'shubhodaya', 'good morning', 'phrase', 'beginner'),
  ('kn-IN', 'ಶುಭ ರಾತ್ರಿ', 'shubha raatri', 'good night', 'phrase', 'beginner'),

  -- --- short sentences ---------------------------------------------------------
  ('kn-IN', 'ನನಗೆ ಕನ್ನಡ ಇಷ್ಟ', 'nanage kannada ishta', 'I like Kannada', 'sentence', 'beginner'),
  ('kn-IN', 'ಇದು ನನ್ನ ಪುಸ್ತಕ', 'idu nanna pustaka', 'This is my book', 'sentence', 'beginner'),
  ('kn-IN', 'ನನಗೆ ನೀರು ಬೇಕು', 'nanage neeru beku', 'I want water', 'sentence', 'beginner'),
  ('kn-IN', 'ನಿಮ್ಮ ಹೆಸರೇನು', 'nimma hesarenu', 'What is your name', 'sentence', 'beginner'),
  ('kn-IN', 'ನಾನು ಚೆನ್ನಾಗಿದ್ದೇನೆ', 'naanu chennaagiddene', 'I am doing well', 'sentence', 'intermediate'),
  ('kn-IN', 'ನಾನು ಕನ್ನಡ ಕಲಿಯುತ್ತಿದ್ದೇನೆ', 'naanu kannada kaliyuttiddene', 'I am learning Kannada', 'sentence', 'intermediate')
on conflict (language_code, text) do update
  set transliteration = excluded.transliteration,
      translation     = excluded.translation,
      kind            = excluded.kind,
      difficulty      = excluded.difficulty,
      is_active       = true;
