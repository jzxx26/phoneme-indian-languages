import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(
  fs.readFileSync(fileURLToPath(new URL('../src/lib/audio/speech.ts', import.meta.url)), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup({ failAudio = false, holdAudio = false, voices = [] } = {}) {
  const requests = [];
  const spoken = [];
  const audioInstances = [];
  const exports = {};
  const synth = {
    cancel() {},
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(utterance) {
      spoken.push(utterance.text);
      queueMicrotask(() => utterance.onend?.());
    },
  };
  class Audio {
    constructor(url) {
      this.text = new URL(url, 'https://example.test').searchParams.get('text');
      audioInstances.push(this);
    }
    play() {
      requests.push(this.text);
      if (!holdAudio) queueMicrotask(() => failAudio ? this.onerror?.() : this.onended?.());
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  vm.runInNewContext(source, {
    exports, window: { speechSynthesis: synth }, Audio,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    URLSearchParams, setTimeout, clearTimeout, Intl,
  });
  return { ...exports, requests, spoken, audioInstances };
}

test('splits multilingual poem lines without breaking combining marks or contractions', () => {
  const speech = setup();
  for (const [text, expected] of [
    ['“Twinkle, little star!”\n Don’t stop. —', ['Twinkle', 'little', 'star', 'Don’t', 'stop']],
    ['அகர முதல எழுத்தெல்லாம்\nஆதி பகவன்', ['அகர', 'முதல', 'எழுத்தெல்லாம்', 'ஆதி', 'பகவன்']],
    ['चंदा मामा दूर के।', ['चंदा', 'मामा', 'दूर', 'के']],
    ['ಮಳೆ ಬಂತು!', ['ಮಳೆ', 'ಬಂತು']],
    ['ਚੰਦਾ ਮਾਮਾ!', ['ਚੰਦਾ', 'ਮਾਮਾ']],
    ['  … — \n', []],
  ]) assert.deepEqual(Array.from(speech.getSpokenWords(text)), expected);
});

test('requests each word separately and resets the active word at completion', async () => {
  const speech = setup();
  const indices = [];
  const outcome = await speech.speakWordSequence(['little', 'star'], 'en-IN', {
    signal: new AbortController().signal, onActiveIndex: (index) => indices.push(index),
  });
  assert.equal(outcome, 'spoken');
  assert.deepEqual(speech.requests, ['little', 'star']);
  assert.deepEqual(indices, [0, 1, -1]);
});

test('stopping during neural audio pauses it and never requests the next word', async () => {
  const speech = setup({ holdAudio: true });
  const controller = new AbortController();
  const playing = speech.speakWordSequence(['first', 'second'], 'en-IN', { signal: controller.signal });
  controller.abort();
  assert.equal(await playing, 'cancelled');
  assert.equal(speech.audioInstances[0].paused, true);
  assert.deepEqual(speech.requests, ['first']);
  assert.deepEqual(speech.spoken, []);
});

test('stopping during the pause prevents the next word', async () => {
  const speech = setup();
  const controller = new AbortController();
  const playing = speech.speakWordSequence(['first', 'second'], 'en-IN', { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  assert.equal(await playing, 'cancelled');
  assert.deepEqual(speech.requests, ['first']);
});

test('browser fallback still speaks separate words in the requested language', async () => {
  const speech = setup({ failAudio: true, voices: [{ lang: 'ta-IN' }] });
  assert.equal(await speech.speakWordSequence(['அகர', 'முதல'], 'ta-IN', {
    signal: new AbortController().signal,
  }), 'spoken');
  assert.deepEqual(speech.spoken, ['அகர', 'முதல']);
});

test('missing matching voice stops the sequence instead of using another language', async () => {
  const speech = setup({ failAudio: true, voices: [{ lang: 'en-US' }] });
  assert.equal(await speech.speakWordSequence(['அகர', 'முதல'], 'ta-IN', {
    signal: new AbortController().signal,
  }), 'no-voice');
  assert.deepEqual(speech.requests, ['அகர']);
  assert.deepEqual(speech.spoken, []);
});

test('an already stopped or empty sequence never requests audio', async () => {
  const speech = setup();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await speech.speakWordSequence(['first'], 'en-IN', { signal: controller.signal }), 'cancelled');
  assert.equal(await speech.speakWordSequence([], 'en-IN', { signal: new AbortController().signal }), 'unsupported');
  assert.deepEqual(speech.requests, []);
});
