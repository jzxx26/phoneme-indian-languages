# Multilingual Pronunciation Learning and Assessment System

A web application for practising pronunciation: you are shown a word or short sentence, you record
yourself saying it, and a pronunciation assessment engine scores your attempt: Microsoft Azure's
Pronunciation Assessment, or a free self-hosted open-source engine (Meta MMS) when Azure is not
available. Every attempt is stored so you can see whether you are improving.

**Languages:** Tamil (`ta-IN`, Review 1), English (`en-IN`), Hindi (`hi-IN`), Kannada (`kn-IN`) and
Punjabi (`pa-IN`, Gurmukhi). **Poems:** hear-and-repeat recitation of Thirukkural couplets (Tamil) and
Kabir/Rahim dohe (Hindi), scored line by line. The
schema, the API and the UI are all locale-parameterised, so new languages are added as data rather
than as code changes.

| | |
| --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Backend | Supabase — Auth, PostgreSQL with Row Level Security |
| Assessment | Azure Speech Pronunciation Assessment, **or** the open-source engine in [`services/speech`](services/speech/README.md) (Python, Meta MMS), both called from a server-side route handler |

Design decisions and the full data flow: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Pages

| Route | What it shows |
| --- | --- |
| `/login` | Sign in / create account (Supabase email + password) |
| `/dashboard` | Your name, current language, attempt count, average score, best score, recent attempts |
| `/practice` | The target text, the recorder, and the four scores plus word-level feedback. Word items first show a picture clue, then teach the word aloud (browser voice) before recording, and offer a **Spelling Lab** (letter-by-letter teaching; spoken-spelling check for English) |
| `/recite` | **Poems.** Pick a verse, listen to the whole poem, then hear each line and say it back. Each line is scored with word feedback; the poem earns up to three stars |
| `/history` | Every attempt, and a first-vs-latest improvement table per practice item |

Every page has a language switcher; the current language travels in `?lang=`.

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

Create a project at [supabase.com](https://supabase.com), then in the SQL editor run, in order:

1. `supabase/migrations/0001_init.sql` — tables, RLS policies, sign-up trigger, progress views
2. `supabase/seed/0002_seed_tamil.sql` — the `ta-IN` language row and 20 Tamil practice items
3. `supabase/seed/0003_seed_english.sql` — `en-IN` items (Review 2, used by the Spelling Lab)
4. `supabase/seed/0004_seed_hindi.sql` — the `hi-IN` language row and 20 Hindi practice items
5. `supabase/seed/0005_seed_kannada.sql` — the `kn-IN` language row and 20 Kannada practice items
6. `supabase/seed/0006_seed_punjabi.sql` — the `pa-IN` language row and 20 Punjabi practice items
7. `supabase/migrations/0007_verses.sql` — the `verses` table and verse-line columns on `sentences`
8. `supabase/seed/0008_seed_verses.sql` — 6 Thirukkural couplets and 6 Hindi dohe

Free Supabase projects pause after about a week without activity. If the app suddenly cannot load
anything, open the Supabase dashboard and press **Restore project**.

Copy the project URL and the **anon** key from *Project Settings → API* into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For a quick demo, turn off *Authentication → Sign In / Providers → Confirm email* so sign-up gives
you a session immediately. Leave it on and the app will ask you to confirm by email first —
`/auth/callback` handles the confirmation link.

### 3. Assessment engine — Azure **or** open-source

**Option A — open-source engine (free, no cloud account).** Start the Python service, then select it:

```bash
cd services/speech && uv sync && uv run uvicorn app:app --host 127.0.0.1 --port 8765
```

```bash
# .env.local
ASSESSMENT_PROVIDER=mms
```

How it scores, hardware needs and limitations: [`services/speech/README.md`](services/speech/README.md).
In short: Meta's MMS speech model plus forced alignment of the reference text gives per-word
accuracy, missed/extra words, completeness and pause-based fluency in the same shape as Azure's
result. It has no prosody score and cannot check spoken letter-by-letter spelling.

**Option B — Azure Speech.** Create a **Speech service** resource in the Azure portal, then add the
key and region to `.env.local`:

```bash
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=centralindia
```

These are **server-only**. They are read through `src/lib/env.server.ts`, which begins with
`import 'server-only'` — so importing them into a client component fails the build rather than
silently leaking. They are never prefixed with `NEXT_PUBLIC_`, and the compiled client bundles
contain no reference to Azure at all.

### 4. Run

```bash
npm run dev        # http://localhost:3000
```

Microphone access requires a secure context: `localhost` works, any other host needs HTTPS.

---

## Developing without any engine

The recording UI can be built and demonstrated without Azure or the open-source service:

```bash
# .env.local
ASSESSMENT_PROVIDER=mock
```

`src/lib/assessment/mock.ts` returns deterministic scores derived from the reference text, and any
attempt it produces is tagged `provider = 'mock'` in the database and labelled in the UI.
`src/lib/assessment/provider.ts` **throws** if `mock` is selected in a production build, so a stray
environment variable cannot cause fake scores to be stored in a deployed system. Delete
`mock.ts` once Azure credentials are permanent — nothing else imports it.

---

## Adding a language (Review 2 and beyond)

No business logic changes. Two steps:

1. Add an entry to `LANGUAGES` in `src/lib/languages.ts`:

   ```ts
   { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', enabled: true, scriptClassName: 'font-indic' }
   ```

2. Add a seed file inserting the `languages` row and its `sentences`, following
   `supabase/seed/0002_seed_tamil.sql`.

Pages already accept `?lang=<code>`, `/api/assess` reads the locale from the sentence row, and the
providers take `locale` as an argument — so the new language works everywhere at once.

Language-specific behaviour lives in the registry entry, not in code:

| Field | Meaning |
| --- | --- |
| `spokenSpelling` | Whether the Spelling Lab offers a spoken letter-name check (English only today) |
| `segmentation` | `'latin-letters'` or `'graphemes'` — how the Spelling Lab splits a word into units |
| `unitsLabel`, `spellingNote` | Heading and learner explanation for the Spelling Lab breakdown |

Also: use English meanings that match the keys in `src/lib/images.ts` to get picture clues, add the
script's font to `--font-indic` in `globals.css`, and, for the open-source engine, map the locale to
its MMS language code in `services/speech/model.py`.

---

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # serve the production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

---

## Notes and limitations

- Audio is assessed and discarded — recordings are never uploaded to storage, only the scores are
  kept. That keeps the privacy story simple for a student project.
- Recordings are capped at 30 seconds, matching Azure's short-audio REST endpoint.
- The spoken spelling check (`/api/assess/spelling`) needs Azure Speech; on the open-source engine
  it is refused with a clear message. Spelling attempts are not stored.
- Teach-aloud plays neural voices from the speech service (Microsoft Edge voices; Punjabi uses
  Google Translate's voice because Edge has none), so it needs internet. If that fails it falls back
  to the browser's own voices.
- Without the speech service, teach-aloud uses the browser's own voices. If none is installed for a language, the app says so
  and lets you record anyway.
- The open-source engine's model weights (Meta MMS) are licensed CC-BY-NC 4.0 — fine for this
  project, not for commercial use.
- Azure Pronunciation Assessment supports a fixed set of locales. If `ta-IN` is unavailable in your
  Speech resource's region, the endpoint returns HTTP 400 and the UI surfaces it as
  "Azure Speech rejected the request… unsupported locale" rather than failing silently.
- Not implemented yet (by design): phoneme-level drill-down, charts, spaced repetition.
