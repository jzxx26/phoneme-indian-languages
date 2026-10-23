/**
 * POST /api/assess/spelling
 *
 * Dedicated trust boundary for spoken spelling assessment.
 *
 * Receives the learner's spoken spelling audio and evaluates the sequence
 * of spoken letter names against the reference word's expected letter sequence.
 *
 * Multilingual rules: whether a language supports spoken spelling is a flag
 * in the language registry (`spokenSpelling`). Languages without it get a
 * typed HTTP 400 - the route never fakes a successful assessment. For
 * languages with it, spoken letter names (e.g. "teeth" -> "T E E T H") are
 * scored letter by letter with actionable feedback.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assessSpelling } from '@/lib/assessment/spelling';
import { AssessmentError } from '@/lib/assessment/types';
import { getLanguage, isLanguageEnabled } from '@/lib/languages';
import type { SentenceRow } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1024;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail(401, 'unauthenticated', 'Please sign in before submitting a recording.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'bad_request', 'Expected a multipart/form-data request.');
  }

  const sentenceId = form.get('sentenceId');
  const audio = form.get('audio');

  if (typeof sentenceId !== 'string' || sentenceId.trim() === '') {
    return fail(400, 'bad_request', 'A sentenceId is required.');
  }
  if (!(audio instanceof Blob)) {
    return fail(400, 'bad_request', 'An audio file is required.');
  }
  if (audio.size < MIN_AUDIO_BYTES) {
    return fail(400, 'audio_too_short', 'The recording is too short to assess. Please spell aloud clearly.');
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail(413, 'audio_too_large', 'The recording is too long. Keep it under 30 seconds.');
  }

  // Reference text + locale come from the database, never from the client.
  const { data: sentence, error: sentenceError } = await supabase
    .from('sentences')
    .select('id, language_code, text, is_active')
    .eq('id', sentenceId)
    .maybeSingle<Pick<SentenceRow, 'id' | 'language_code' | 'text' | 'is_active'>>();

  if (sentenceError) {
    return fail(500, 'database_error', 'Could not load the practice item.');
  }
  if (!sentence || !sentence.is_active) {
    return fail(404, 'sentence_not_found', 'That practice item was not found.');
  }
  if (!isLanguageEnabled(sentence.language_code)) {
    return fail(
      400,
      'locale_unsupported',
      `Practice for locale ${sentence.language_code} is not enabled in this release.`,
    );
  }

  const language = getLanguage(sentence.language_code);
  if (!language?.spokenSpelling) {
    return fail(
      400,
      'locale_unsupported_for_spelling',
      `Spoken spelling check is not available for ${language?.name ?? sentence.language_code}. Practise the word pronunciation instead.`,
    );
  }

  try {
    const result = await assessSpelling({
      audio: await audio.arrayBuffer(),
      contentType: audio.type || 'audio/wav; codecs=audio/pcm; samplerate=16000',
      expectedWord: sentence.text,
      locale: sentence.language_code,
    });

    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof AssessmentError) {
      return fail(error.status, error.code, error.message);
    }
    console.error('[assess-spelling] provider error', error);
    return fail(500, 'unknown', 'Spelling assessment failed. Please try again.');
  }
}
