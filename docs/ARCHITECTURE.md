# Architecture — Multilingual Pronunciation Learning and Assessment System

Review 1: base platform + Tamil (`ta-IN`). Review 2: English (`en-IN`) with a Spelling Lab, Hindi
(`hi-IN`), picture clues and teach-aloud, and a free open-source assessment engine.

---

## 1. Requirements analysis

| Requirement | How it is met |
| --- | --- |
| Practise pronunciation of a shown word/sentence | `sentences` table + `/practice` page |
| Record from the browser microphone | `MediaRecorder` via `useRecorder`, normalised to WAV client-side |
| Assess pronunciation | Azure Speech Pronunciation Assessment, or the self-hosted open-source engine (`services/speech`), called server-side only |
| Never expose Azure credentials | Credentials read in a Node.js route handler; no `NEXT_PUBLIC_` Azure vars exist |
| Store attempts, show improvement | `attempts` table + two SQL views (`user_language_stats`, `sentence_progress`) |
| Multilingual from the start, Tamil only for now | Every content and attempt row is keyed by a BCP-47 `language_code`; the app reads locales from one registry (`src/lib/languages.ts`) |
| No custom ML training | No model is trained here. Azure, or a pretrained public model (Meta MMS) with a documented scoring heuristic on top — see `services/speech/README.md` |

**The one rule that keeps this multilingual:** no file outside `src/lib/languages.ts` and
`supabase/seed/*` contains a locale or language name. Pages take a `?lang=` parameter, the API
route reads the locale off the sentence row, and providers take `locale` as an argument.
Language-specific behaviour is expressed as `LanguageConfig` capability flags (`spokenSpelling`,
`segmentation`, `unitsLabel`, `spellingNote`), never as `if (locale === …)`. Hindi was added in
Review 2 as one registry entry plus a seed file.

---

## 2. Folder structure

```
.
├── docs/ARCHITECTURE.md            # this document
├── services/speech/                # open-source engine (Python, FastAPI, Meta MMS)
│   ├── app.py  model.py            #   HTTP API; model + per-language adapters
│   ├── scoring.py                  #   forced alignment + scoring (pure numpy)
│   └── tests/test_scoring.py
├── supabase/
│   ├── migrations/0001_init.sql    # tables, RLS, trigger, progress views
│   └── seed/0002_seed_tamil.sql    # ta-IN language row + 20 practice items
│       0003_seed_english.sql  0004_seed_hindi.sql
└── src/
    ├── middleware.ts               # refreshes auth cookies, guards routes
    ├── app/
    │   ├── layout.tsx  globals.css  page.tsx
    │   ├── login/page.tsx
    │   ├── dashboard/page.tsx      # name, language, counts, average, recent
    │   ├── practice/page.tsx       # loads content server-side
    │   ├── history/page.tsx        # attempts + per-item improvement table
    │   ├── auth/callback/route.ts  # email confirmation -> session
    │   ├── api/assess/route.ts     # * the only place an assessment engine is called
    │   └── api/assess/spelling/route.ts  # spoken letter-name check (Azure only)
    ├── components/                 # AuthForm, NavBar, LanguageSwitcher, PracticeSession,
    │   └── ui/                     #   SpellingPractice, WordImage, RecordButton, WordFeedback...
    ├── lib/
    │   ├── languages.ts            # * the language registry
    │   ├── env.ts                  # browser-safe env
    │   ├── env.server.ts           # `server-only` — Azure secrets live here
    │   ├── session.ts  scoring.ts
    │   ├── audio/{useRecorder.ts,wav.ts,speech.ts}   # speech.ts: teach-aloud + segmentation
    │   ├── images.ts               # offline SVG picture clues, keyed by English meaning
    │   ├── supabase/{client,server,middleware}.ts
    │   └── assessment/
    │       ├── types.ts            # provider-neutral contract
    │       ├── provider.ts         # picks azure | mms | mock
    │       ├── azure.ts            # Azure REST implementation
    │       ├── mms.ts              # calls services/speech
    │       ├── spelling.ts         # letter-name parsing + alignment for the Spelling Lab
    │       └── mock.ts             # dev-only, blocked in production
    └── types/database.ts
```

---

## 3. Database schema

Full DDL: [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

```
languages (code PK, name, native_name, is_active, sort_order)
    |
    +--< sentences (id PK, language_code FK, text, transliteration, translation,
    |               kind, difficulty, is_active, created_at)
    |         |
auth.users    |
    |         |
    +--< profiles (id PK/FK, display_name, created_at)
    |
    +--< attempts (id PK, user_id FK, sentence_id FK, language_code FK,
                   reference_text, recognized_text,
                   pronunciation_score, accuracy_score, fluency_score,
                   completeness_score, prosody_score,
                   word_results jsonb, provider, created_at)
```

Beyond the required columns the schema adds:

- **`languages`** — a real table rather than a free-text column, so content can never reference a
  locale the platform does not know about.
- **`attempts.language_code`** — denormalised from the sentence so per-language analytics stay a
  single-index scan when Reviews 2-3 add more locales.
- **`attempts.reference_text`** — a snapshot; editing a sentence later must not rewrite history.
- **`attempts.recognized_text` / `prosody_score` / `provider`** — everything Azure returns that is
  useful for feedback and for auditing which engine produced a score.

**Row Level Security** is enabled on all four tables:

- `profiles` — read/write your own row only.
- `languages`, `sentences` — read-only catalogue for authenticated users.
- `attempts` — `select`/`insert`/`delete` restricted to `auth.uid() = user_id`. There is no
  `update` policy: an assessment result is immutable once recorded.

A `security definer` trigger on `auth.users` creates the profile row at sign-up.

**Progress views** (`security_invoker = true`, so the caller's RLS still applies):

- `user_language_stats` — attempt count, items practised, average/best scores per user per
  language. Powers the dashboard without pulling every attempt into the app.
- `sentence_progress` — first score vs. latest score vs. best score per item. Powers the
  "am I improving?" table on `/history`.

---

## 4. Azure integration architecture

```
Browser (client component)
  |  MediaRecorder -> WebM/Opus or MP4/AAC
  |  decodeAudioData -> OfflineAudioContext(1ch, 16 kHz) -> WAV encoder
  |  POST multipart/form-data { audio: WAV, sentenceId }
  v
POST /api/assess          <- runtime: nodejs, the trust boundary
  |  1. supabase.auth.getUser()          reject anonymous callers
  |  2. SELECT ... FROM sentences WHERE id = $1
  |       -> reference text and locale come from the DATABASE, not the request
  |  3. size checks (1 KB ... 4 MB)
  |  4. getAssessmentProvider()          azure | mock (dev only)
  v
Azure Speech - short-audio REST API
  POST https://{region}.stt.speech.microsoft.com
       /speech/recognition/conversation/cognitiveservices/v1
       ?language={locale}&format=detailed
  Headers: Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}
           Content-Type: audio/wav; codecs=audio/pcm; samplerate=16000
           Pronunciation-Assessment: base64({ ReferenceText, GradingSystem:
             "HundredMark", Granularity: "Word", Dimension: "Comprehensive",
             EnableMiscue: true })
  Body: raw WAV bytes
  v
Normalisation (src/lib/assessment/azure.ts)
  NBest[0].PronunciationAssessment -> { pronunciationScore, accuracyScore,
      fluencyScore, completenessScore, prosodyScore }
  NBest[0].Words[]                 -> [{ word, accuracyScore, errorType }]
  RecognitionStatus != Success     -> typed AssessmentError with a learner-facing message
  v
INSERT INTO attempts (...) under the caller's session -> RLS enforces ownership
  v
200 { attemptId, saved, result: { pronunciationScore, accuracyScore,
      fluencyScore, completenessScore, words: [...] } }
```

### Why these choices

**Credentials.** `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are read through `serverEnv()` in
`src/lib/env.server.ts`, which starts with `import 'server-only'` — pulling it into a client
component is a **build error**, not a runtime surprise. It is imported only by
`src/lib/assessment/azure.ts`, which is imported only by the Node.js route handler. There is no
`NEXT_PUBLIC_AZURE_*` variable anywhere, and `grep`ping the built client bundles for
`AZURE_SPEECH`, `stt.speech.microsoft.com` or `Ocp-Apim-Subscription-Key` returns nothing. The
browser never sees an Azure URL.

**Reference text is server-authoritative.** The client sends a `sentenceId`, not the text. This
prevents a user from submitting an easier reference string than the one displayed, and means the
locale that reaches Azure is always the one the content is actually written in.

**Audio format.** Azure's short-audio REST endpoint reliably accepts 16 kHz / 16-bit / mono PCM
WAV. Browsers produce WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari). The conversion is done in
the browser with `OfflineAudioContext` (`src/lib/audio/wav.ts`) rather than server-side with
ffmpeg — no native dependency, and the upload is a format Azure is guaranteed to understand.

**Provider abstraction.** The UI and the database only know the `AssessmentResult` shape from
`src/lib/assessment/types.ts`. `azure.ts` implements `AssessmentProvider`; so does the dev-only
`mock.ts`. `provider.ts` picks between them from `ASSESSMENT_PROVIDER` and **throws** if `mock` is
requested in a production build, so fake scores can never be stored in a deployed system.

### Open-source engine (`ASSESSMENT_PROVIDER=mms`)

Added because Azure for Students sign-up failed for the team. `src/lib/assessment/mms.ts`
implements the same `AssessmentProvider` interface and POSTs the same 16 kHz WAV, reference text
and locale to the Python service in `services/speech`, which:

1. runs Meta MMS (`facebook/mms-1b-all`, wav2vec2 + per-language adapter) to get per-frame
   character probabilities;
2. CTC-forced-aligns the reference text's characters to the audio;
3. scores each character by the model's confidence that it heard exactly that character there,
   averages per word (accuracy), compares the free transcription with the reference at word level
   (omissions / insertions → completeness), and penalises long inter-word pauses (fluency);
4. returns the provider-neutral `AssessmentResult`, so the UI and database are unchanged. Attempts
   are stored with `provider = 'mms'` and labelled in the UI.

Scores are heuristic, not calibrated against human raters; there is no prosody score, and
spoken letter-name spelling is refused (the model scores characters, not letter names).

**A Supabase Edge Function instead?** The requirement is "a backend endpoint **or** a Supabase Edge
Function". The Next.js route handler was chosen because it deploys with the app, shares the
TypeScript types and the Supabase session cookie, and needs no second secret store. Moving to an
Edge Function later means porting `azure.ts` to Deno and calling it from the same route — the
`AssessmentProvider` interface is the seam.

---

## 5. Environment variables

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | yes | Anon key; safe because RLS is on everywhere |
| `AZURE_SPEECH_KEY` | **server only** | yes (Azure mode) | Speech resource subscription key |
| `AZURE_SPEECH_REGION` | **server only** | yes (Azure mode) | e.g. `centralindia`, `eastus` |
| `AZURE_SPEECH_ENDPOINT` | **server only** | no | Override for custom/sovereign endpoints |
| `ASSESSMENT_PROVIDER` | server only | no | `azure` (default), `mms` (open-source engine) or `mock` (development only) |
| `SPEECH_SERVICE_URL` | **server only** | no | Open-source engine address, default `http://127.0.0.1:8765` |
| `SPEECH_SERVICE_TOKEN` | **server only** | no | Shared secret if the engine is reachable beyond localhost |

No service-role key is used anywhere: every database write happens through the signed-in user's
session so RLS remains the single enforcement point.

---

## 6. Implementation plan and status

| # | Step | Status |
| --- | --- | --- |
| 1 | Next.js + TypeScript + Tailwind scaffold, path aliases, lint/typecheck | done |
| 2 | SQL schema, RLS policies, sign-up trigger, progress views | done |
| 3 | Tamil seed: `ta-IN` language row + 20 beginner items | done |
| 4 | Supabase auth: browser/server clients, cookie-refresh middleware, route guards, `/login` | done |
| 5 | Language registry + locale-parameterised pages | done |
| 6 | `useRecorder` (permissions, states, 30 s cap) + WAV normalisation | done |
| 7 | `AssessmentProvider` contract, Azure implementation, gated mock | done |
| 8 | `POST /api/assess`: auth -> DB lookup -> provider -> persist -> normalised JSON | done |
| 9 | `/practice`: target, recorder, four scores, word feedback, Try Again / Next | done |
| 10 | `/dashboard`: name, language, attempt count, average, recent attempts | done |
| 11 | `/history`: attempt list + first-vs-latest improvement table | done |
| 12 | Docs, `.env.example`, README setup guide | done |
| 13 | Review 2: English + Spelling Lab, picture clues, teach-aloud (Anshu) | done |
| 14 | Review 2: language capability flags, spelling alignment fixes, language switcher | done |
| 15 | Review 2: Hindi (`hi-IN`) registry entry + 20-item seed | done |
| 16 | Open-source assessment engine (`services/speech`) + `mms` provider | done |

Not built yet: phoneme-level drill-down, charts/analytics, spaced repetition, audio playback
storage, storing spelling attempts.
