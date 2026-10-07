# Minnow

**Live openings, matched to you.** One Next.js App Router app, with the existing admin panel under `/admin`, backed by Neon Postgres.

- **`apps/web` · port 3000:** Minnow landing, Managed Better Auth, saved preferences, resume parsing, live hunts and ranked shortlists.
- **`apps/web/app/admin`:** allowlisted admin instrument panel. Overview, Hunts, Listings, Sources, People and Trace query only stored database rows. Admin does not call TinyFish or expose resume downloads.
- **`packages/db`:** shared SQL migration, parameterized Neon queries, application row types and access helpers.
- **`packages/core`:** pure discovery, URL normalization, extraction, matching and SSE decoding. TinyFish HTTP calls live only in `apps/web/lib/tinyfish.ts`.

## Setup

Requires **Node.js 22+**, a Neon Postgres branch with **Managed Better Auth** enabled, and a [TinyFish API key](https://agent.tinyfish.ai/api-keys).

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # the only env file; fill it in
```

### Web environment

In `apps/web/.env.local`:

```dotenv
NEON_AUTH_BASE_URL=https://your-branch.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=your-32-plus-character-secret
DATABASE_URL=postgresql://your-pooled-neon-connection-string
TINYFISH_API_KEY=your-tinyfish-key
OBSERVATORY_ADMIN_EMAILS=you@example.com
NEON_AUTH_GOOGLE_ENABLED=true
MAX_AGENT_RUNS=2
AGENT_DURATION_SECONDS=120
```

Get the Auth URL from **Neon Console → Project → Branch → Auth → Configuration**. Get the pooled Postgres URL from the branch connection dialog. Setup generates missing secrets. If configuring manually, generate random values with:

```sh
openssl rand -base64 32
```

Enable **Google** on the Neon Auth branch and configure the web origin as a trusted domain, then set `NEON_AUTH_GOOGLE_ENABLED=true`. Minnow recommends Google first and keeps email/password below it; enable both methods on the branch. Provider credentials stay in Neon’s managed configuration.

### Google account-linking recovery

If Google returns `account_not_linked`, the matching email identity already exists but Google has not been connected under the managed branch’s linking policy. The sign-in screen preserves that reason even with legacy repeated `error` query values.

1. Sign in with your existing email and password.
2. Open **Settings → Connect Google**, and choose the Google account with the same email.
3. Confirm Settings shows Google as connected, then sign out and sign in with Google.

This uses the authenticated Neon client’s `linkSocial()` through the existing managed Auth proxy. It preserves your user ID and product data. If the branch requires email verification, complete its managed verification flow first. Linking errors explain mismatched emails or disabled linking; the application never edits `neon_auth` directly.

### Admin access

Open `http://localhost:3000/admin`. It uses the same session as the user app; signed-out visitors go to `/auth/sign-in?next=/admin` and return to `/admin` after signing in. Access requires an email in `OBSERVATORY_ADMIN_EMAILS` (comma-separated, exact, case-insensitive); other accounts get **HTTP 403**.

The separate Observatory runtime, port 3001, and cross-app callback have been retired. The existing `OBSERVATORY_ADMIN_EMAILS` setting is retained for compatibility.

### Apply the SQL migration

```sh
npm run db:migrate
```

The migration command reads `apps/web/.env.local` and applies `packages/db/migrations/001_initial.sql` in one transaction. App tables are in `public`. `profiles.user_id` is the text identity ID minted by Neon Auth. The migration never creates another users table or writes into `neon_auth`.

If signup previously displayed `relation "profiles" does not exist`, the Neon account may already have been created. Apply the migration, then use Google or **Sign in** with that account. Profile setup now happens idempotently in the signed-in app shell, so a database bootstrap error is not reported as a failed account creation.

### Run Minnow

```sh
npm run dev
```

Open **http://localhost:3000**. The app uses Next.js **16.3.8** and Neon’s session middleware. `npm run dev` synchronizes missing environment values and checks web before launch. `npm run env:check` lists missing or invalid settings.

## Product routes

| Route | Purpose |
| --- | --- |
| `/` | Static landing with a clearly labelled illustrative sample; no listing/database fetch |
| `/auth/sign-up`, `/auth/sign-in` | Google-first custom auth with an email/password alternative |
| `/auth/complete` | Managed OAuth completion and validated same-app admin return |
| `/app` | Saved role, profession, location, country, seniority, work mode, visa and keywords; live hunt progress |
| `/app/listings` | Latest completed ranked shortlist; hidden rows omitted; real Apply links and new-since-last-hunt marks |
| `/app/resume` | Upload or replace PDF/DOCX/TXT, inspect extracted skill hints, download your own file |
| `/app/settings` | Profile, connected Google sign-in and sign-out |
| `/admin` | Overview; nested Hunts, Listings, Sources, People and Trace routes |

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

## Admin panel

All panel pages are Server Components guarded by the query key, `getSession()`, and the admin email allowlist. Lists paginate in groups of **25**, use parameterized filters and query only rendered columns. The dark panel CSS is scoped; the coastal product keeps its own layout.

- **Overview:** hunts today, listings stored, Fetch error rate, Agent attempts, top locations and role snapshots.
- **Hunts:** status, user ID, preference snapshot, counts, duration; open a hunt for its events and written listings.
- **Listings:** company/source/location/visibility filters and hide/unhide actions with a reason.
- **Sources:** health totals, last event and skip/resume host controls.
- **People:** profile and preference summaries plus hunt counts; no resume body.
- **Trace:** search UUID input and ordered events proving what actually ran.

Empty tables show empty states. Admin does not infer runs, call TinyFish, or expose resume downloads. The People list does not load resume contents.

## Build and verification

```sh
npm run typecheck
npm test
npm run build
```

Builds need configured Neon Auth environment variables because the SDK validates its cookie secret at module initialization. Protected pages stay dynamic; landing/legal pages prerender without fetching listings.

Start the production app:

```sh
npm run start --workspace=@minnow/web
```

Deploy `apps/web` on a Next.js Node runtime. The host must permit streaming hunt requests up to **300 seconds**. Keep database, Auth cookie, TinyFish and admin-key configuration server-side.

Tests include parsing, canonicalization, dedupe, location restrictions, sponsorship evidence, resume-token ranking, source skipping, TinyFish failure/cancellation handling, and actual SQL round-trips through the Neon driver against an isolated PostgreSQL-compatible PGlite database. The web hunt orchestrator is tested through successful persistence, zero-call cache replay and failed TinyFish authentication with retained traces. PDF/DOCX/TXT extraction tests use real document bytes. They do not claim a live Neon branch was exercised.

Browser route checks use nonfunctional build/test-only Auth configuration, verifying public landing, labelled samples, Google/email auth errors, linking recovery messages, protected routes, unauthorized APIs, strict admin 404s, and signed admin-login continuations:

```sh
npx playwright install chromium
npm run test:ui
```

Run browser tests after building web. For real-branch acceptance, connect Google to the existing email account, sign out, and complete Google sign-in. Open keyed admin with each login method; confirm trace/counts, hide a listing and reload the shortlist, then skip a source and refresh a hunt. Automated route checks do not perform real Google consent.

## Environment reference

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required pooled Neon Postgres connection |
| `NEON_AUTH_BASE_URL` | Required Managed Auth branch URL |
| `NEON_AUTH_COOKIE_SECRET` | Required, at least 32 characters |
| `OBSERVATORY_ADMIN_EMAILS` | Admin email allowlist; retained setting name |
| `NEON_AUTH_COOKIE_DOMAIN` | Optional production cookie domain |
| `TINYFISH_API_KEY` | Required for live hunts |
| `NEON_AUTH_GOOGLE_ENABLED` | True after enabling Google on the branch |
| `MAX_AGENT_RUNS` | 0–2, default 2 |
| `AGENT_DURATION_SECONDS` | 30–120, default 120 |

Next.js reads `apps/web/.env.local`, the only env file. There is no root `.env`.


## Credits

- Every account gets 10 credits at signup (one ledger row, granted once). Normal Search costs 1, Deep Search costs 2, a cache replay or your own TinyFish key costs 0. The clicked button decides the price on the server.
- Charging and creating the search is one SQL statement, and every balance change writes a `credit_ledger` row in the same statement, so `creditAudit(userId).drift` is always 0.
- One running hunt per user is enforced by a unique index, so a double click or a second tab cannot double-charge. A retried click carries a request id and returns the first search instead of charging again.
- Refunds (failed hunt, no results, hunt killed by a timeout) are part of the statement that finishes the search, so each can pay out at most once.

## How a hunt finds open posts

1. **Search** (TinyFish Search, geo-targeted, two wordings per ATS family for intern and AI roles) discovers job pages. Every hit that is a job page becomes a listing.
2. **Company board feeds** (TinyFish Fetch reading the public Greenhouse, Lever and Ashby JSON APIs) list each company's open roles with location, posted date and employment type. A Search hit that is missing from its company's feed is treated as closed.
3. **Fetch** opens company career pages and the top unverified postings to confirm they are open and to read their details.
4. **Agent** scans JavaScript-only boards, and only when fewer than 6 posts match.
5. If strict matching leaves fewer than 6 posts, location, employment type and experience are relaxed in that order; every post this adds is labelled "Near match".

`npm run verify:hunt --workspace=@minnow/web` runs four real hunts against TinyFish (uses `TINYFISH_API_KEY` from `apps/web/.env.local`) and fails if any returns fewer than 6 posts.
