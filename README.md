# Minnow + Observatory

**Live openings, matched to you.** Two Next.js App Router apps, one Neon Postgres database, no third backend.

- **`apps/web` · port 3000:** Minnow landing, Managed Better Auth, saved preferences, resume parsing, live hunts and ranked shortlists.
- **`apps/observatory` · port 3001:** allowlisted admin instrument panel. Overview, Hunts, Listings, Sources, People and Trace query only stored database rows. It has no TinyFish client or resume download route.
- **`packages/db`:** shared SQL migration, parameterized Neon queries, application row types and access helpers.
- **`packages/core`:** pure discovery, URL normalization, extraction, matching and SSE decoding. TinyFish HTTP calls live only in `apps/web/lib/tinyfish.ts`.

## Setup

Requires **Node.js 22+**, a Neon Postgres branch with **Managed Better Auth** enabled, and a [TinyFish API key](https://agent.tinyfish.ai/api-keys).

```sh
npm install
npm run setup:env
```

`setup:env` fills missing app-local values from the root `.env`, generates one shared cookie secret if none exists, and keeps the TinyFish key on web only. Existing app-local credentials and unrelated settings are preserved. It reports the Neon settings you still need without printing secret values.

If you already put the TinyFish key in the root `.env`, add these values there:

```dotenv
NEON_AUTH_BASE_URL=https://your-branch.neonauth.region.aws.neon.tech/neondb/auth
DATABASE_URL=postgresql://your-pooled-neon-connection-string
OBSERVATORY_ADMIN_EMAILS=you@example.com
```

Then run `npm run setup:env` again. You can also configure `apps/web/.env.local` and `apps/observatory/.env.local` directly using their `.env.example` files. App-local values take precedence over the root setup input; keep shared values identical when editing configured files.

### Web environment

In `apps/web/.env.local`:

```dotenv
NEON_AUTH_BASE_URL=https://your-branch.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=your-32-plus-character-secret
DATABASE_URL=postgresql://your-pooled-neon-connection-string
TINYFISH_API_KEY=your-tinyfish-key
OBSERVATORY_ADMIN_EMAILS=you@example.com
NEON_AUTH_GOOGLE_ENABLED=true
WEB_APP_URL=http://localhost:3000
OBSERVATORY_APP_URL=http://localhost:3001
MAX_AGENT_RUNS=2
AGENT_DURATION_SECONDS=120
```

Get the Auth URL from **Neon Console → Project → Branch → Auth → Configuration**. Get the pooled Postgres URL from the branch connection dialog. The setup command already generates a shared cookie secret. If configuring manually, generate it with:

```sh
openssl rand -base64 32
```

Enable **Google** on the Neon Auth branch and configure the web origin as a trusted domain, then set `NEON_AUTH_GOOGLE_ENABLED=true` in web. Minnow recommends Google first and keeps email/password below it as an alternative. Keep email/password enabled on the branch for that alternative. Provider credentials stay in Neon’s managed configuration, not in this app. If Google is not enabled, the web button stays hidden and Observatory cannot offer password sign-in as a fallback.

### Observatory environment

In `apps/observatory/.env.local`, use the **same** `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `OBSERVATORY_ADMIN_EMAILS` as web. **Do not set `TINYFISH_API_KEY` here.** Set `WEB_APP_URL` and `OBSERVATORY_APP_URL` to the two app origins; localhost defaults are ports 3000 and 3001.

Observatory is **Google-only** at its sign-in entry. Its Google button opens `/auth/sign-in?intent=observatory` on web, where only the Google form is offered. Managed OAuth returns to the protected `/app/observatory` callback so Neon’s proxy can complete the session. That page checks the allowlisted email and Google-linked Managed Auth account, then redirects to Observatory. Observatory repeats both checks on pages and mutations. It has no password sign-in action, separate sign-up, or second Auth catch-all.

On localhost, cookies are host-scoped rather than port-scoped, so a session from `localhost:3000` can be read on `localhost:3001`. Use the same hostname for both apps. For production sibling subdomains, configure `NEON_AUTH_COOKIE_DOMAIN=.yourdomain.com` identically in both apps and add both origins to the Neon branch’s trusted domains. A shared secret alone does not share cookies between unrelated domains.

An Observatory session is allowed only if its email exactly matches the comma-separated allowlist (case-insensitive) and its Managed Auth identity has a Google account. A signed-in non-admin gets **403**. An allowlisted identity with only password credentials is sent to Google sign-in. This uses Neon’s session and account APIs, not a separate session store.

### Apply the SQL migration

```sh
npm run db:migrate
```

The migration command reads `apps/web/.env.local` and applies `packages/db/migrations/001_initial.sql` in one transaction. App tables are in `public`. `profiles.user_id` is the text identity ID minted by Neon Auth. The migration never creates another users table or writes into `neon_auth`.

If signup previously displayed `relation "profiles" does not exist`, the Neon account may already have been created. Apply the migration, then use Google or **Sign in** with that account. Profile setup now happens idempotently in the signed-in app shell, so a database bootstrap error is not reported as a failed account creation.

### Run both apps

```sh
npm run dev
```

Or run them separately:

```sh
npm run dev:web
npm run dev:observatory
```

Open **http://localhost:3000** and **http://localhost:3001**. Restart after changing environment variables. Both apps use Next.js **16.3.8** and `proxy.ts` with `auth.middleware()`.

`npm run dev` synchronizes missing environment values and checks both apps before launching Next.js. `npm run env:check` lists any missing or invalid settings, so an empty secret produces a setup message instead of a middleware stack trace. The separate app dev commands perform the same scoped check.

## Product routes

| Route | Purpose |
| --- | --- |
| `/` | Static landing with a clearly labelled illustrative sample; no listing/database fetch |
| `/auth/sign-up`, `/auth/sign-in` | Google-first custom auth with an email/password alternative |
| `/app/observatory` | Protected managed-Google callback and allowlisted redirect to Observatory |
| `/app` | Saved role, profession, location, country, seniority, work mode, visa and keywords; live hunt progress |
| `/app/listings` | Latest completed ranked shortlist; hidden rows omitted; real Apply links and new-since-last-hunt marks |
| `/app/resume` | Upload or replace PDF/DOCX/TXT, inspect extracted skill hints, download your own file |
| `/app/settings` | Name, profession, headline and sign-out |

Preferences are stored in Neon, not localStorage. Resume bytes are capped at **2 MB** and stored as `bytea` with extracted text. PDF and DOCX are parsed on the web server. Raw files are never sent to TinyFish. Recognized resume skills boost ranking and can be added as explicit keyword hints. Download queries always use the authenticated user ID.

## TinyFish pipeline

```text
saved preferences + resume skill hints
  → parallel Search queries
  → diversify sources; remove irrelevant/login/skipped hosts
  → one fresh Fetch batch (up to 10 selected URLs)
  → parse structured detail or board listings
  → Agent only for eligible thin/unreadable pages (max 2)
  → normalize → dedupe → filter → rank
  → persist trace and shortlist → completed UI with endpoint counts
```

| Endpoint | Contribution |
| --- | --- |
| **Search** — `GET https://api.search.tinyfish.ai` | Discovers live application pages with `query`, `purpose`, country-level `location`, and `include_domains`. Source families include company careers, Greenhouse, Lever, Ashby and public boards. Known location aliases drive automatic geo-targeting. |
| **Fetch** — `POST https://api.fetch.tinyfish.ai` | Reads a diversified batch of at most 10 pages as markdown with links and **`ttl: 0`**. Extracts real titles, employers, locations and application URLs. Per-URL failures remain in the trace without discarding successful pages. |
| **Agent** — `POST https://agent.tinyfish.ai/v1/automation/run-sse` | Navigates eligible interactive/empty boards, applies filters and returns up to 15 openings through a supported structured-output schema. Maximum two attempts per hunt; default 120-second duration limit; upstream runs are cancelled on disconnect/timeout. Readable Search/Fetch results survive Agent errors. |

Canonical URLs and ATS job IDs drive deduplication, with company/title/location fallback identity. Known seniority and work-mode mismatches are removed. Role relevance, geographic eligibility, keywords, resume skills, source quality and sponsorship signals determine rank. Visa is a **soft ranking preference**: explicit no-sponsorship postings rank lower and are clearly labelled; unstated sponsorship is not guessed. Application-form sponsorship questions do not count as positive evidence.

The completed hunt and shortlist display **actual persisted counts**: N searches, N fetches, N Agent runs. Agent is used only when needed, so some hunts correctly report zero Agent runs. Search and Fetch are free; Agent is metered. No live listings are hardcoded. Landing examples are illustrative and have no Apply action.

### Persistence and freshness

- Every hunt inserts a `searches` row, including cache hits and failures.
- Progress and source outcomes are serialized to `search_events`; parse and rank summaries are persisted before completion.
- `source_health` tracks read successes/errors. Observatory’s `skipped` flag is consulted before Fetch, and those decisions are traced.
- Cache lookup is per-user preference/resume/source-policy hash, valid for **15 minutes**. A hit writes a new search with `cache_hit=true`, copies listing visibility and original `fetched_at`, and reports **zero new API calls**.
- **Refresh live** bypasses the cache. Listing timestamps record when the source was read.
- Stored results are read by Server Components. Observatory hiding takes effect on the next web render; it updates that user's existing copies of the same canonical opening, so cache replays cannot resurrect a moderated result.

## Observatory

All panel pages are Server Components guarded by `getSession()`, the admin email allowlist, and a Google-linked account check. Lists paginate in groups of **25**, use parameterized filters and query only rendered columns.

- **Overview:** hunts today, listings stored, Fetch error rate, Agent attempts, top locations and role snapshots.
- **Hunts:** status, user ID, preference snapshot, counts, duration; open a hunt for its events and written listings.
- **Listings:** company/source/location/visibility filters and hide/unhide actions with a reason.
- **Sources:** health totals, last event and skip/resume host controls.
- **People:** profile and preference summaries plus hunt counts; no resume body.
- **Trace:** search UUID input and ordered events proving what actually ran.

Empty tables show empty states. Observatory does not infer runs, call TinyFish, or expose resume downloads. Shared queries include a limited resume metadata/preview helper for authorized admin use; the People list does not load it.

## Build and verification

```sh
npm run typecheck
npm test
npm run build
```

Builds need configured Neon Auth environment variables because the SDK validates its cookie secret at module initialization. Protected pages stay dynamic; landing/legal pages prerender without fetching listings.

Start each production app separately:

```sh
npm run start --workspace=@minnow/web
npm run start --workspace=@minnow/observatory
```

Deploy the two app roots independently on a Next.js Node runtime. The web host must permit streaming hunt requests up to **300 seconds**; Observatory needs no long-running request budget. Keep secrets server-side and share only the Neon/Auth configuration across apps.

Tests include parsing, canonicalization, dedupe, location restrictions, sponsorship evidence, resume-token ranking, source skipping, TinyFish failure/cancellation handling, and actual SQL round-trips through the Neon driver against an isolated PostgreSQL-compatible PGlite database. The web hunt orchestrator is tested through successful persistence, zero-call cache replay and failed TinyFish authentication with retained traces. PDF/DOCX/TXT extraction tests use real document bytes. They do not claim a live Neon branch was exercised.

Browser route checks use nonfunctional build/test-only Auth configuration, verify public landing, labelled samples, Google-first/email auth errors, protected app redirects, unauthorized APIs, and the Google-only Observatory entry through web:

```sh
npx playwright install chromium
npm run test:ui
```

Run browser tests after both apps have been built. For full acceptance with your real branch: sign up, save preferences, upload a resume, run a multi-host hunt, then open Observatory with an allowlisted account. Confirm the hunt’s trace and counts, hide a listing and reload the web shortlist, then skip a source and refresh the hunt.

## Environment reference

| Variable | Web | Observatory |
| --- | --- | --- |
| `DATABASE_URL` | Required | Same database |
| `NEON_AUTH_BASE_URL` | Required | Same Auth branch |
| `NEON_AUTH_COOKIE_SECRET` | Required, 32+ chars | Same secret |
| `OBSERVATORY_ADMIN_EMAILS` | Shared configuration | Required allowlist |
| `NEON_AUTH_COOKIE_DOMAIN` | Optional shared production cookie domain | Same if set |
| `TINYFISH_API_KEY` | Required for hunts | Never set |
| `NEON_AUTH_GOOGLE_ENABLED` | Set true after enabling Google on the branch | OAuth entry runs on web |
| `WEB_APP_URL` | Web origin, default `http://localhost:3000` | Same web origin for Google entry |
| `OBSERVATORY_APP_URL` | Admin return origin, default `http://localhost:3001` | Same admin origin |
| `MAX_AGENT_RUNS` | 0–2, default 2 | Not used |
| `AGENT_DURATION_SECONDS` | 30–120, default 120 | Not used |

Next.js app workspaces read their own `.env.local`. The root `.env` is setup input: `npm run setup:env` copies its missing values into the app-local files, with TinyFish going to web only. Observatory's launch wrapper also removes an inherited `TINYFISH_API_KEY` from its process environment.
