-- =============================================================================
-- Seed 0008 - Verses for hear-and-repeat recitation
--
-- Requires migration 0007_verses.sql and the ta-IN / hi-IN language rows
-- (seeds 0002, 0004). Each verse is inserted (or updated) and its lines are
-- upserted into `sentences` with verse_id + verse_line. Safe to re-run.
-- =============================================================================

create or replace function pg_temp.seed_verse(
  p_language   text,
  p_collection text,
  p_number     int,
  p_title      text,
  p_author     text,
  p_meaning    text,
  p_difficulty public.difficulty_level,
  p_lines      text[],
  p_translit   text[]
) returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.verses (language_code, collection, number, title, author, meaning, difficulty)
  values (p_language, p_collection, p_number, p_title, p_author, p_meaning, p_difficulty)
  on conflict (language_code, collection, number) do update
    set title      = excluded.title,
        author     = excluded.author,
        meaning    = excluded.meaning,
        difficulty = excluded.difficulty,
        is_active  = true
  returning id into v_id;

  for i in 1 .. array_length(p_lines, 1) loop
    insert into public.sentences
      (language_code, text, transliteration, translation, kind, difficulty, verse_id, verse_line)
    values
      (p_language, p_lines[i], p_translit[i], null, 'sentence', p_difficulty, v_id, i)
    on conflict (language_code, text) do update
      set transliteration = excluded.transliteration,
          difficulty      = excluded.difficulty,
          verse_id        = excluded.verse_id,
          verse_line      = excluded.verse_line,
          is_active       = true;
  end loop;
end;
$$;

-- --- Tamil: Thirukkural (Thiruvalluvar) ----------------------------------------

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 1, 'குறள் 1 · The first letter',
  'திருவள்ளுவர் · Thiruvalluvar',
  'As the letter "a" is the first of all letters, so the eternal God is first in the world.',
  'intermediate',
  array['அகர முதல எழுத்தெல்லாம் ஆதி', 'பகவன் முதற்றே உலகு'],
  array['agara mudhala ezhuthellaam aadhi', 'bagavan mudhatre ulagu']);

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 100, 'குறள் 100 · Sweet words',
  'திருவள்ளுவர் · Thiruvalluvar',
  'Speaking harsh words when sweet ones are at hand is like picking unripe fruit when ripe fruit is there.',
  'intermediate',
  array['இனிய உளவாக இன்னாத கூறல்', 'கனியிருப்பக் காய்கவர்ந் தற்று'],
  array['iniya ulavaaga innaadha kooral', 'kaniyiruppak kaaikavarn thatru']);

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 391, 'குறள் 391 · Learning',
  'திருவள்ளுவர் · Thiruvalluvar',
  'Learn thoroughly what is worth learning, and then live by what you have learnt.',
  'intermediate',
  array['கற்க கசடறக் கற்பவை கற்றபின்', 'நிற்க அதற்குத் தக'],
  array['karka kasadarak karpavai katrapin', 'nirka adharkuth thaga']);

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 396, 'குறள் 396 · The well in the sand',
  'திருவள்ளுவர் · Thiruvalluvar',
  'The deeper you dig a well in sand, the more water springs up; the more you learn, the more knowledge flows.',
  'intermediate',
  array['தொட்டனைத் தூறும் மணற்கேணி மாந்தர்க்குக்', 'கற்றனைத் தூறும் அறிவு'],
  array['thottanaith thoorum manarkeni maandharkkuk', 'katranaith thoorum arivu']);

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 423, 'குறள் 423 · Finding the truth',
  'திருவள்ளுவர் · Thiruvalluvar',
  'Whatever you hear, and from whomever, wisdom is finding the truth in it.',
  'intermediate',
  array['எப்பொருள் யார்யார்வாய்க் கேட்பினும் அப்பொருள்', 'மெய்ப்பொருள் காண்பது அறிவு'],
  array['epporul yaaryaarvaaik ketpinum apporul', 'meipporul kaanbadhu arivu']);

select pg_temp.seed_verse('ta-IN', 'திருக்குறள் · Thirukkural', 664, 'குறள் 664 · Saying and doing',
  'திருவள்ளுவர் · Thiruvalluvar',
  'Saying is easy for anyone; doing what one said is hard.',
  'intermediate',
  array['சொல்லுதல் யார்க்கும் எளிய அரியவாம்', 'சொல்லிய வண்ணம் செயல்'],
  array['solludhal yaarkkum eliya ariyavaam', 'solliya vannam seyal']);

-- --- Hindi: Dohe (Kabir, Rahim) -------------------------------------------------

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 1, 'बुरा जो देखन मैं चला · Looking for the bad',
  'कबीर · Kabir',
  'I went looking for a bad person and found none; when I searched my own heart, I found no one worse than me.',
  'intermediate',
  array['बुरा जो देखन मैं चला, बुरा न मिलिया कोय।', 'जो दिल खोजा आपना, मुझसा बुरा न कोय॥'],
  array['bura jo dekhan main chala, bura na miliya koy', 'jo dil khoja aapna, mujhsa bura na koy']);

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 2, 'ऐसी वाणी बोलिए · Gentle words',
  'कबीर · Kabir',
  'Speak words free of pride, that comfort others and bring you peace as well.',
  'intermediate',
  array['ऐसी वाणी बोलिए, मन का आपा खोय।', 'औरन को शीतल करे, आपहुं शीतल होय॥'],
  array['aisi vaani boliye, man ka aapa khoy', 'auran ko sheetal kare, aapahun sheetal hoy']);

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 3, 'धीरे-धीरे रे मना · Patience',
  'कबीर · Kabir',
  'Slowly, O mind, everything happens in its own time: the gardener may pour a hundred pots of water, but fruit comes only in its season.',
  'intermediate',
  array['धीरे-धीरे रे मना, धीरे सब कुछ होय।', 'माली सींचे सौ घड़ा, ऋतु आए फल होय॥'],
  array['dheere-dheere re mana, dheere sab kuchh hoy', 'maali seenche sau ghada, ritu aaye phal hoy']);

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 4, 'काल करे सो आज कर · Do it now',
  'कबीर · Kabir',
  'Do today what you meant to do tomorrow, and now what you meant to do today; who knows what the next moment brings?',
  'intermediate',
  array['काल करे सो आज कर, आज करे सो अब।', 'पल में प्रलय होएगी, बहुरि करेगा कब॥'],
  array['kaal kare so aaj kar, aaj kare so ab', 'pal mein pralay hoegi, bahuri karega kab']);

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 5, 'साईं इतना दीजिए · Just enough',
  'कबीर · Kabir',
  'Lord, give me just enough for my family, so that I do not go hungry and no guest leaves my door hungry.',
  'intermediate',
  array['साईं इतना दीजिए, जा में कुटुम समाय।', 'मैं भी भूखा न रहूँ, साधु न भूखा जाय॥'],
  array['saain itna deejiye, ja mein kutum samaay', 'main bhi bhookha na rahoon, saadhu na bhookha jaay']);

select pg_temp.seed_verse('hi-IN', 'दोहे · Dohe', 6, 'रहिमन धागा प्रेम का · The thread of love',
  'रहीम · Rahim',
  'Do not snap the thread of love: once broken it does not join again, and if it does, a knot remains.',
  'intermediate',
  array['रहिमन धागा प्रेम का, मत तोड़ो चटकाय।', 'टूटे से फिर ना मिले, मिले गाँठ परि जाय॥'],
  array['rahiman dhaaga prem ka, mat todo chatkaay', 'toote se phir na mile, mile gaanth pari jaay']);
