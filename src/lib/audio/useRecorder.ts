'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normaliseRecording, WAV_CONTENT_TYPE, type NormalisedAudio } from './wav';

export type RecorderStatus =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'converting'
  | 'error';

export interface RecorderError {
  code: 'unsupported' | 'permission-denied' | 'no-microphone' | 'empty' | 'conversion' | 'unknown';
  message: string;
}

/** Hard stop so a forgotten recording cannot exceed Azure's short-audio limit. */
export const MAX_RECORDING_SECONDS = 30;

/** Preference order; the first supported type wins. */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  '',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    CANDIDATE_MIME_TYPES.find((type) => type === '' || MediaRecorder.isTypeSupported(type)) ?? ''
  );
}

function describeMediaError(error: unknown): RecorderError {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        code: 'permission-denied',
        message:
          'Microphone access was blocked. Allow microphone permission for this site in your browser settings and try again.',
      };
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { code: 'no-microphone', message: 'No microphone was found on this device.' };
    }
    if (error.name === 'NotReadableError') {
      return {
        code: 'unknown',
        message: 'The microphone is already in use by another application.',
      };
    }
  }
  return {
    code: 'unknown',
    message: error instanceof Error ? error.message : 'Could not start recording.',
  };
}

export interface UseRecorderResult {
  status: RecorderStatus;
  error: RecorderError | null;
  /** Seconds elapsed while recording. */
  elapsedSeconds: number;
  isRecording: boolean;
  isBusy: boolean;
  start: () => Promise<void>;
  /** Stops and resolves with normalised 16 kHz mono WAV audio. */
  stop: () => Promise<NormalisedAudio | null>;
  cancel: () => void;
  reset: () => void;
  contentType: string;
}

/**
 * Wraps the MediaRecorder API: permission handling, recording state, an
 * automatic length cap, and conversion of the result to Azure-friendly WAV.
 */
export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    clearTimers();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
  }, [clearTimers, releaseStream]);

  useEffect(() => teardown, [teardown]);

  const reset = useCallback(() => {
    setError(null);
    setElapsedSeconds(0);
    setStatus('idle');
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    stopResolverRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    teardown();
    setStatus('idle');
    setElapsedSeconds(0);
  }, [teardown]);

  const stopInternal = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(null);
    }
    return new Promise<Blob | null>((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setElapsedSeconds(0);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError({
        code: 'unsupported',
        message:
          'This browser cannot record audio. Use a recent version of Chrome, Edge, Firefox or Safari over HTTPS.',
      });
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setStatus('error');
      setError({ code: 'unsupported', message: 'MediaRecorder is not supported in this browser.' });
      return;
    }

    setStatus('requesting-permission');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (mediaError) {
      setStatus('error');
      setError(describeMediaError(mediaError));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      clearTimers();
      releaseStream();
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        : null;
      chunksRef.current = [];
      stopResolverRef.current?.(blob);
      stopResolverRef.current = null;
    };

    recorder.onerror = () => {
      clearTimers();
      releaseStream();
      setStatus('error');
      setError({ code: 'unknown', message: 'Recording stopped unexpectedly.' });
      stopResolverRef.current?.(null);
      stopResolverRef.current = null;
    };

    recorder.start();
    setStatus('recording');

    timerRef.current = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, MAX_RECORDING_SECONDS * 1000);
  }, [clearTimers, releaseStream]);

  const stop = useCallback(async (): Promise<NormalisedAudio | null> => {
    const raw = await stopInternal();

    if (!raw || raw.size === 0) {
      setStatus('error');
      setError({ code: 'empty', message: 'Nothing was recorded. Please try again.' });
      return null;
    }

    setStatus('converting');
    try {
      const normalised = await normaliseRecording(raw);
      if (normalised.durationSeconds < 0.3) {
        setStatus('error');
        setError({ code: 'empty', message: 'That recording was too short. Hold the sentence a little longer.' });
        return null;
      }
      setStatus('idle');
      return normalised;
    } catch (conversionError) {
      setStatus('error');
      setError({
        code: 'conversion',
        message:
          conversionError instanceof Error
            ? `Could not process the recording: ${conversionError.message}`
            : 'Could not process the recording.',
      });
      return null;
    }
  }, [stopInternal]);

  return {
    status,
    error,
    elapsedSeconds,
    isRecording: status === 'recording',
    isBusy: status === 'requesting-permission' || status === 'converting',
    start,
    stop,
    cancel,
    reset,
    contentType: WAV_CONTENT_TYPE,
  };
}
