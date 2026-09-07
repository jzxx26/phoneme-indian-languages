'use client';

import { MAX_RECORDING_SECONDS } from '@/lib/audio/useRecorder';

function formatClock(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function RecordButton({
  isRecording,
  elapsedSeconds,
  busy,
  busyLabel,
  onStart,
  onStop,
}: {
  isRecording: boolean;
  elapsedSeconds: number;
  busy: boolean;
  busyLabel: string;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
}) {
  if (busy) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
        />
        <span role="status" className="text-base font-medium text-slate-700">
          {busyLabel}
        </span>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={onStop}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-rose-600 px-5 py-4 text-lg font-semibold text-white hover:bg-rose-700"
        >
          <span aria-hidden className="h-3.5 w-3.5 rounded-sm bg-white" />
          Stop Recording
          <span className="tabular-nums text-base font-medium text-rose-100">
            {formatClock(elapsedSeconds)}
          </span>
        </button>
        <p role="status" className="text-center text-sm text-slate-500">
          Recording… speak the target out loud. Stops automatically after {MAX_RECORDING_SECONDS}s.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white hover:bg-slate-800"
    >
      <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-rose-400" />
      Start Recording
    </button>
  );
}
