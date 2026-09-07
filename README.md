# Multilingual Pronunciation Learning and Assessment System

A web application for practising pronunciation: you are shown a word or short sentence, you record
yourself saying it, and Microsoft Azure's Pronunciation Assessment service scores your attempt.
Every attempt is stored so you can see whether you are improving.

**Review 1 supports Tamil (`ta-IN`) only.** The schema, the API and the UI are all
locale-parameterised, so later reviews add languages as data rather than as code changes.

| | |
| --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Backend | Supabase — Auth, PostgreSQL with Row Level Security |
| Assessment | Azure Speech Pronunciation Assessment, via a server-side route handler |

Design decisions and the full data flow: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Pages

| Route | What it shows |
| --- | --- |
| `/login` | Sign in / create account (Supabase email + password) |
| `/dashboard` | Your name, current language, attempt count, average score, best score, recent attempts |
| `/practice` | The target text, the recorder, and the four Azure scores plus word-level feedback |
| `/history` | Every attempt, and a first-vs-latest improvement table per practice item |

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

Copy the project URL and the **anon** key from *Project Settings → API* into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For a quick demo, turn off *Authentication → Sign In / Providers → Confirm email* so sign-up gives
you a session immediately. Leave it on and the app will ask you to confirm by email first —
`/auth/callback` handles the confirmation link.

### 3. Azure Speech

Create a **Speech service** resource in the Azure portal, then add the key and region to
`.env.local`:

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

## Developing without Azure credentials

The recording UI can be built and demonstrated before a Speech resource exists:

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
Azure provider takes `locale` as an argument — so the new language works everywhere at once.

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
- Azure Pronunciation Assessment supports a fixed set of locales. If `ta-IN` is unavailable in your
  Speech resource's region, the endpoint returns HTTP 400 and the UI surfaces it as
  "Azure Speech rejected the request… unsupported locale" rather than failing silently.
- Not implemented in Review 1 (by design): additional languages, phoneme-level drill-down,
  charts, spaced repetition.
