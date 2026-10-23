/**
 * POST /api/assess
 *
 * The single trust boundary for pronunciation assessment.
 *
 *   browser (audio + sentenceId)
 *        -> this route: authenticate, load reference text from Supabase
 *        -> assessment provider (Azure Speech, locale from the sentence row)
 *        -> normalise the response
 *        -> persist the attempt under the caller's RLS context
 *        -> normalised JSON back to the browser
 *
 * Azure credentials are read here (server-side) and never reach the client.
 * The reference text is read from the database rather than trusted from the
 * request body, so a user cannot submit an easier sentence than the one shown.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAssessmentProvider } from '@/lib/assessment/provider';
import { AssessmentError } from '@/lib/assessment/types';
import { isLanguageEnabled } from '@/lib/languages';
import { findDemoSentence } from '@/lib/demo-sentences';
import type { SentenceRow } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 30 s of 16 kHz mono 16-bit PCM is ~960 KB; allow headroom, reject abuse. */
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
    return fail(400, 'audio_too_short', 'The recording is too short to assess. Please try again.');
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail(413, 'audio_too_large', 'The recording is too long. Keep it under 30 seconds.');
  }

  // Reference text + locale come from the database, never from the client.
  const { data: dbSentence, error: sentenceError } = await supabase
    .from('sentences')
    .select('id, language_code, text, is_active')
    .eq('id', sentenceId)
    .maybeSingle<Pick<SentenceRow, 'id' | 'language_code' | 'text' | 'is_active'>>();

  if (sentenceError) {
    return fail(500, 'database_error', 'Could not load the practice sentence.');
  }

  let sentence = dbSentence;
  if (!sentence || !sentence.is_active) {
    const demo = findDemoSentence(sentenceId);
    if (demo) {
      sentence = {
        id: demo.id,
        language_code: demo.language_code,
        text: demo.text,
        is_active: true,
      };
    }
  }

  if (!sentence || !sentence.is_active) {
    return fail(404, 'sentence_not_found', 'That practice sentence is no longer available.');
  }
  if (!isLanguageEnabled(sentence.language_code)) {
    return fail(
      400,
      'locale_unsupported',
      `Practice for locale ${sentence.language_code} is not enabled in this release.`,
    );
  }

  let result;
  try {
    const provider = getAssessmentProvider();
    result = await provider.assess({
      audio: await audio.arrayBuffer(),
      contentType: audio.type || 'audio/wav; codecs=audio/pcm; samplerate=16000',
      referenceText: sentence.text,
      locale: sentence.language_code,
    });
  } catch (error) {
    if (error instanceof AssessmentError) {
      return fail(error.status, error.code, error.message);
    }
    console.error('[assess] unexpected provider failure', error);
    return fail(500, 'unknown', 'Pronunciation assessment failed. Please try again.');
  }

  // Persist under the caller's session, so RLS enforces user_id = auth.uid().
  const { data: attempt, error: insertError } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      sentence_id: sentence.id,
      language_code: sentence.language_code,
      reference_text: sentence.text,
      recognized_text: result.recognizedText,
      pronunciation_score: result.pronunciationScore,
      accuracy_score: result.accuracyScore,
      fluency_score: result.fluencyScore,
      completeness_score: result.completenessScore,
      prosody_score: result.prosodyScore,
      word_results: result.words,
      provider: result.provider,
    })
    .select('id, created_at')
    .single();

  if (insertError) {
    console.error('[assess] could not store attempt', insertError);
    // The assessment itself succeeded - show the learner their scores anyway.
    return NextResponse.json({ attemptId: null, saved: false, result }, { status: 200 });
  }

  return NextResponse.json({
    attemptId: attempt.id,
    createdAt: attempt.created_at,
    saved: true,
    result,
  });
}
