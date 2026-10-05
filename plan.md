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
Saved preferences + extracted resume hints → parallel TinyFish Search across company careers/Greenhouse/Lever/Ashby/public boards → diversify and reject irrelevant/skipped hosts → one fresh markdown Fetch batch of at most ten URLs → parse structured openings → Agent only for thin/unreadable eligible pages, capped at two → canonical dedupe → seniority/work-mode filters → role/location/visa/keywords/resume ranking → persist listings and full trace before completion.

Search discovers live application pages with purpose and optional country/domain targeting. Fetch reads real pages with `ttl: 0`. Agent navigates interactive boards and returns a supported structured-output schema. Missing details remain unknown, application-form visa questions are not sponsorship evidence, and remote is not assumed worldwide.

Every hunt, including cache hits and failures, writes `searches` and ordered `search_events`. Cache is database-backed, per-user preference/resume hash, 15 minutes. Refresh bypasses it. Observatory hiding and skipped source flags are enforced by web queries and future hunts.

## Verification
Typecheck web and shared packages; production-build web; test parsing, dedupe, ranking, resume boosts, failed traces, cache, signed continuations, strict admin gates and ordinary Google/email entry. Live Managed Auth/Neon/TinyFish acceptance needs configured app environment variables and user OAuth consent.
