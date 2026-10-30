-- =============================================================================
-- Migration 0006 - seed data: Punjabi (pa-IN)
--
-- Adds Punjabi as a data-only change: one languages row plus practice items.
-- Translations reuse the English meanings in src/lib/images.ts so word items
-- get a picture clue without any code change.
-- =============================================================================

insert into public.languages (code, name, native_name, is_active, sort_order)
values ('pa-IN', 'Punjabi', 'ਪੰਜਾਬੀ', true, 5)
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
  ('pa-IN', 'ਮਾਂ', 'maan', 'mother', 'word', 'beginner'),
  ('pa-IN', 'ਪਿਤਾ', 'pitaa', 'father', 'word', 'beginner'),
  ('pa-IN', 'ਪਾਣੀ', 'paani', 'water', 'word', 'beginner'),
  ('pa-IN', 'ਘਰ', 'ghar', 'house', 'word', 'beginner'),
  ('pa-IN', 'ਫੁੱਲ', 'phull', 'flower', 'word', 'beginner'),
  ('pa-IN', 'ਦੋਸਤ', 'dost', 'friend', 'word', 'beginner'),
  ('pa-IN', 'ਕਿਤਾਬ', 'kitaab', 'book', 'word', 'beginner'),
  ('pa-IN', 'ਖਾਣਾ', 'khaanaa', 'food / meal', 'word', 'beginner'),
  ('pa-IN', 'ਦੰਦ', 'dand', 'teeth', 'word', 'intermediate'),
  ('pa-IN', 'ਸਕੂਲ', 'skool', 'school', 'word', 'intermediate'),

  -- --- common greetings and short phrases --------------------------------------
  ('pa-IN', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'sat sri akaal', 'hello / greetings', 'phrase', 'beginner'),
  ('pa-IN', 'ਧੰਨਵਾਦ', 'dhannvaad', 'thank you', 'phrase', 'beginner'),
  ('pa-IN', 'ਸ਼ੁਭ ਸਵੇਰ', 'shubh saver', 'good morning', 'phrase', 'beginner'),  -- verify: formal greeting; check it reads naturally
  ('pa-IN', 'ਸ਼ੁਭ ਰਾਤ', 'shubh raat', 'good night', 'phrase', 'beginner'),  -- verify: formal greeting; check it reads naturally

  -- --- short sentences ---------------------------------------------------------
  ('pa-IN', 'ਮੈਨੂੰ ਪੰਜਾਬੀ ਪਸੰਦ ਹੈ', 'mainu panjaabi pasand hai', 'I like Punjabi', 'sentence', 'beginner'),
  ('pa-IN', 'ਇਹ ਮੇਰੀ ਕਿਤਾਬ ਹੈ', 'ih meri kitaab hai', 'This is my book', 'sentence', 'beginner'),
  ('pa-IN', 'ਮੈਨੂੰ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ', 'mainu paani chaahida hai', 'I want water', 'sentence', 'beginner'),
  ('pa-IN', 'ਤੁਹਾਡਾ ਨਾਮ ਕੀ ਹੈ', 'tuhaada naam ki hai', 'What is your name', 'sentence', 'beginner'),
  ('pa-IN', 'ਮੈਂ ਠੀਕ ਹਾਂ', 'main theek haan', 'I am doing well', 'sentence', 'intermediate'),
  ('pa-IN', 'ਮੈਂ ਪੰਜਾਬੀ ਸਿੱਖ ਰਿਹਾ ਹਾਂ', 'main panjaabi sikh rihaa haan', 'I am learning Punjabi', 'sentence', 'intermediate')
on conflict (language_code, text) do update
  set transliteration = excluded.transliteration,
      translation     = excluded.translation,
      kind            = excluded.kind,
      difficulty      = excluded.difficulty,
      is_active       = true;
