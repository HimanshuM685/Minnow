# Minnow implementation plan

Live openings, matched to you. Preserve the existing coastal product and live-data pipeline.

## Runtime
- `apps/web`: one Next.js App Router runtime, Managed Better Auth, preferences, resume, hunt, shortlist, and the existing dark admin instrument panel under `/admin`.
- Admin requires exactly one correct `key` query value on every URL, a normal Google/email session, and the `OBSERVATORY_ADMIN_EMAILS` allowlist. Missing/wrong keys return HTTP 404 before rendering or Auth calls. Pages and mutations independently recheck access.
- A short-lived signed login-continuation cookie remembers an internal admin destination without storing its key; login restores the key from server ENV. It cannot authorize keyless admin URLs.
- Existing email identities can explicitly connect Google from Settings through Managed Neon `linkSocial`; duplicate OAuth errors retain the actual linking failure.
- `packages/db`: shared Neon Postgres schema, types, parameterized queries and migration. Identity stays in `neon_auth`.
- `packages/core`: pure URL normalization, parsing, matching, contracts and SSE decoding. TinyFish HTTP clients live only in web.

## Pipeline
Saved preferences + extracted resume hints → atomic billed search/outbox row → durable Workflow Search/Fetch discovery with checkpoint → diversify and reject irrelevant/skipped hosts → one fresh markdown Fetch batch of at most ten URLs → parse structured openings → durable async Agent launches only for thin/unreadable eligible pages, capped at two → persist launch markers and upstream run IDs → durable polling and recovery → canonical dedupe → seniority/work-mode filters → role/location/visa/keywords/resume ranking → persist listings and full trace before completion.

Search discovers live application pages with purpose and optional country/domain targeting. Fetch reads real pages with `ttl: 0`. Agent navigates interactive boards and returns a supported structured-output schema. Missing details remain unknown, application-form visa questions are not sponsorship evidence, and remote is not assumed worldwide.

Every hunt, including cache hits and failures, writes `searches` and ordered `search_events`. Cache is database-backed, per-user preference/resume hash, 15 minutes. Refresh bypasses it. Observatory hiding and skipped source flags are enforced by web queries and future hunts.

## Vercel durability
- `workflow@5.1.0` supplies the generated flow and webhook routes. Workflow inputs contain only the search UUID; keys remain in Neon/server ENV and are loaded inside server steps.
- `vercel.json` configures `/api/internal/hunts` every five minutes. `CRON_SECRET` protects recovery. System Environment Variables must be enabled in the Vercel project.
- TinyFish Agents use `run-async`; an observer disconnect never sends `/cancel`. Ambiguous launch acknowledgements are looked up by a persisted goal marker and are never blindly resubmitted.
- Normal Search costs 1 credit, Deep Search costs 2, cached replay is free. Debit, search row and outbox are atomic; guarded settlement/refund is idempotent.

## Verification
Typecheck web and shared packages; production-build web; test parsing, dedupe, ranking, resume boosts, failed traces, cache, durable outbox, async Agent recovery, signed continuations, strict admin gates and ordinary Google/email entry. Live Managed Auth/Neon/TinyFish acceptance needs configured app environment variables and user OAuth consent. A deployed acceptance run should close the dashboard after the 202 response, wait for the persisted search to finish, then revisit `/dashboard/listings`.
