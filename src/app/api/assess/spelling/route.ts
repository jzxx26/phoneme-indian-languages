/**
 * POST /api/assess/spelling
 *
 * Dedicated trust boundary for spoken spelling assessment.
 *
 * Receives the learner's spoken spelling audio and evaluates the sequence
 * of spoken letter names against the reference word's expected letter sequence.
 *
 * Multilingual rules:
 * - For Tamil (ta-IN): returns HTTP 400 with a typed error explaining that
 *   spoken letter-name assessment is unsupported for Tamil in Azure Speech.
 *   (Never fakes successful assessment).
 * - For English: evaluates spoken letter names (e.g. "teeth" -> "T E E T H"),
 *   scores each letter individually, and returns actionable feedback.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assessSpelling } from '@/lib/assessment/spelling';
import { AssessmentError } from '@/lib/assessment/types';
import { findDemoSentence } from '@/lib/demo-sentences';
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

  // Look up sentence row: first check Supabase sentences table, then demo sentences
  let sentenceText: string | null = null;
  let languageCode: string | null = null;

  const { data: dbSentence } = await supabase
    .from('sentences')
    .select('id, language_code, text, is_active')
    .eq('id', sentenceId)
    .maybeSingle<Pick<SentenceRow, 'id' | 'language_code' | 'text' | 'is_active'>>();

  if (dbSentence && dbSentence.is_active) {
    sentenceText = dbSentence.text;
    languageCode = dbSentence.language_code;
  } else {
    const demo = findDemoSentence(sentenceId);
    if (demo) {
      sentenceText = demo.text;
      languageCode = demo.language_code;
    }
  }

  if (!sentenceText || !languageCode) {
    return fail(404, 'sentence_not_found', 'That practice item was not found.');
  }

  // Multilingual check: Tamil letter-name spelling check is unsupported by Azure
  if (languageCode.toLowerCase().startsWith('ta')) {
    return fail(
      400,
      'locale_unsupported_for_spelling',
      'Spoken letter-by-letter spelling assessment is not supported for Tamil (ta-IN). Azure Speech does not provide Tamil letter-name acoustic models. Please practice word pronunciation instead.',
    );
  }

  try {
    const result = await assessSpelling({
      audio: await audio.arrayBuffer(),
      contentType: audio.type || 'audio/wav; codecs=audio/pcm; samplerate=16000',
      expectedWord: sentenceText,
      locale: languageCode,
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
