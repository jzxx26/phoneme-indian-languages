# Architecture — Multilingual Pronunciation Learning and Assessment System

Review 1 scope: base platform + Tamil (`ta-IN`).

---

## 1. Requirements analysis

| Requirement | How it is met |
| --- | --- |
| Practise pronunciation of a shown word/sentence | `sentences` table + `/practice` page |
| Record from the browser microphone | `MediaRecorder` via `useRecorder`, normalised to WAV client-side |
| Assess pronunciation | Azure Speech Pronunciation Assessment, called server-side only |
| Never expose Azure credentials | Credentials read in a Node.js route handler; no `NEXT_PUBLIC_` Azure vars exist |
| Store attempts, show improvement | `attempts` table + two SQL views (`user_language_stats`, `sentence_progress`) |
| Multilingual from the start, Tamil only for now | Every content and attempt row is keyed by a BCP-47 `language_code`; the app reads locales from one registry (`src/lib/languages.ts`) |
| No custom ML | Nothing beyond calling Azure — no ASR, no fuzzy matching, no clustering |

**The one rule that keeps this multilingual:** no file outside `src/lib/languages.ts` and
`supabase/seed/*` contains the string `"ta-IN"` or `"Tamil"`. Pages take a `?lang=` parameter,
the API route reads the locale off the sentence row, and the Azure provider takes `locale` as an
argument. Adding Kannada or Hindi in Review 2 is one registry entry plus a seed file.

---

## 2. Folder structure

```
.
├── docs/ARCHITECTURE.md            # this document
├── supabase/
│   ├── migrations/0001_init.sql    # tables, RLS, trigger, progress views
│   └── seed/0002_seed_tamil.sql    # ta-IN language row + 20 practice items
└── src/
    ├── middleware.ts               # refreshes auth cookies, guards routes
    ├── app/
    │   ├── layout.tsx  globals.css  page.tsx
    │   ├── login/page.tsx
    │   ├── dashboard/page.tsx      # name, language, counts, average, recent
    │   ├── practice/page.tsx       # loads content server-side
    │   ├── history/page.tsx        # attempts + per-item improvement table
    │   ├── auth/callback/route.ts  # email confirmation -> session
    │   └── api/assess/route.ts     # * the only place Azure is called
    ├── components/                 # AuthForm, NavBar, PracticeSession,
    │   └── ui/                     #   RecordButton, WordFeedback, AttemptRow...
    ├── lib/
    │   ├── languages.ts            # * the language registry
    │   ├── env.ts                  # browser-safe env
    │   ├── env.server.ts           # `server-only` — Azure secrets live here
    │   ├── session.ts  scoring.ts
    │   ├── audio/{useRecorder.ts,wav.ts}
    │   ├── supabase/{client,server,middleware}.ts
    │   └── assessment/
    │       ├── types.ts            # provider-neutral contract
    │       ├── provider.ts         # picks azure | mock
    │       ├── azure.ts            # Azure REST implementation
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
| `ASSESSMENT_PROVIDER` | server only | no | `azure` (default) or `mock` (development only) |

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

Out of scope for Review 1 and deliberately not built: additional languages, phoneme-level
drill-down, charts/analytics, spaced repetition, audio playback storage.
