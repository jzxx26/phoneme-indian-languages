/**
 * Client-side audio normalisation.
 *
 * MediaRecorder gives us WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari).
 * The Azure short-audio REST endpoint is only guaranteed to accept 16 kHz,
 * 16-bit, mono PCM WAV, so we decode whatever the browser produced, resample it
 * with an OfflineAudioContext and re-encode it as WAV before upload. Doing the
 * conversion in the browser keeps the server dependency-free (no ffmpeg).
 */

export const TARGET_SAMPLE_RATE = 16_000;

/** Exact Content-Type Azure expects for the normalised audio. */
export const WAV_CONTENT_TYPE = `audio/wav; codecs=audio/pcm; samplerate=${TARGET_SAMPLE_RATE}`;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor {
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!ctor) {
    throw new Error('Web Audio API is not available in this browser.');
  }
  return ctor;
}

function getOfflineAudioContextCtor(): typeof OfflineAudioContext {
  const ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!ctor) {
    throw new Error('OfflineAudioContext is not available in this browser.');
  }
  return ctor;
}

/** Downmix to mono and resample to 16 kHz. */
async function toMono16k(buffer: AudioBuffer): Promise<AudioBuffer> {
  const frameCount = Math.max(
    1,
    Math.ceil((buffer.duration || buffer.length / buffer.sampleRate) * TARGET_SAMPLE_RATE),
  );

  const OfflineCtx = getOfflineAudioContextCtor();
  const offline = new OfflineCtx(1, frameCount, TARGET_SAMPLE_RATE);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);

  return offline.startRendering();
}

/** Encode a mono AudioBuffer as a 16-bit PCM WAV file. */
function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;

  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([wav], { type: 'audio/wav' });
}

export interface NormalisedAudio {
  blob: Blob;
  durationSeconds: number;
}

/** Convert a recorded blob into 16 kHz mono 16-bit PCM WAV. */
export async function normaliseRecording(input: Blob): Promise<NormalisedAudio> {
  const arrayBuffer = await input.arrayBuffer();

  const AudioCtx = getAudioContextCtor();
  const context = new AudioCtx();

  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const resampled = await toMono16k(decoded);
    return {
      blob: encodeWav(resampled),
      durationSeconds: resampled.duration,
    };
  } finally {
    // Free the hardware audio graph; ignore browsers that reject double-close.
    void context.close().catch(() => undefined);
  }
}
