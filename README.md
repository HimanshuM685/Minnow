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
cp apps/web/.env.example apps/web/.env.local
cp apps/observatory/.env.example apps/observatory/.env.local
```

The repo may already contain blank local environment templates. Fill them with real values; do not overwrite configured secrets.

### Web environment

In `apps/web/.env.local`:

```dotenv
NEON_AUTH_BASE_URL=https://your-branch.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=your-32-plus-character-secret
DATABASE_URL=postgresql://your-pooled-neon-connection-string
TINYFISH_API_KEY=your-tinyfish-key
OBSERVATORY_ADMIN_EMAILS=you@example.com
NEON_AUTH_GOOGLE_ENABLED=false
MAX_AGENT_RUNS=2
AGENT_DURATION_SECONDS=120
```

Get the Auth URL from **Neon Console → Project → Branch → Auth → Configuration**. Get the pooled Postgres URL from the branch connection dialog. Generate a cookie secret with:

```sh
openssl rand -base64 32
```

Enable email/password sign-in on the Neon branch and configure the web origin as an Auth trusted domain. Enable Google and add its trusted callback origin only if you want it; then set `NEON_AUTH_GOOGLE_ENABLED=true`. The Google button stays hidden otherwise.

### Observatory environment

In `apps/observatory/.env.local`, use the **same** `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `OBSERVATORY_ADMIN_EMAILS` as web. **Do not set `TINYFISH_API_KEY` here.** Observatory uses server-side email/password sign-in but does not own sign-up or an auth catch-all.

On localhost, cookies are host-scoped rather than port-scoped, so a session from `localhost:3000` can be read on `localhost:3001`. Use the same hostname for both apps. For production sibling subdomains, configure `NEON_AUTH_COOKIE_DOMAIN=.yourdomain.com` identically in both apps and add both origins to the Neon branch’s trusted domains. A shared secret alone does not share cookies between unrelated domains.

An Observatory session is allowed only if its email exactly matches the comma-separated allowlist (case-insensitive). A signed-in non-admin gets **403**. Pages and server actions both enforce this check.

### Apply the SQL migration

```sh
npm run db:migrate
```

The migration command reads `apps/web/.env.local` and applies `packages/db/migrations/001_initial.sql` in one transaction. App tables are in `public`. `profiles.user_id` is the text identity ID minted by Neon Auth. The migration never creates another users table or writes into `neon_auth`.

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

## Product routes

| Route | Purpose |
| --- | --- |
| `/` | Static landing with a clearly labelled illustrative sample; no listing/database fetch |
| `/auth/sign-up`, `/auth/sign-in` | Custom email/password forms calling Neon server actions |
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

All panel pages are Server Components guarded by `getSession()` and the admin allowlist. Lists paginate in groups of **25**, use parameterized filters and query only rendered columns.

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

Browser route checks use nonfunctional build/test-only Auth configuration, verify public landing, labelled samples, custom auth errors, protected app redirects, unauthorized APIs, and separate Observatory sign-in:

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
| `NEON_AUTH_GOOGLE_ENABLED` | Optional, default false | Not used |
| `MAX_AGENT_RUNS` | 0–2, default 2 | Not used |
| `AGENT_DURATION_SECONDS` | 30–120, default 120 | Not used |

If a previous root `.env` holds the TinyFish key, put it into `apps/web/.env.local`; Next.js app workspaces do not load the old root Vite environment.
