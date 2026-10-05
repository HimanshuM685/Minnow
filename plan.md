# Minnow implementation plan

Live openings, matched to you. Preserve the existing coastal product and live-data pipeline.

## Runtime
- `apps/web`: Next.js App Router product, Managed Better Auth, preferences, resume, hunt, shortlist.
- `apps/observatory`: separate Next.js App Router admin instrument panel. Reads and moderates stored rows; never calls TinyFish.
- `packages/db`: shared Neon Postgres schema, types, parameterized queries and migration. Identity stays in `neon_auth`.
- `packages/core`: pure URL normalization, parsing, matching, contracts and SSE decoding. TinyFish HTTP clients live only in web.

## Pipeline
Saved preferences + extracted resume hints → parallel TinyFish Search across company careers/Greenhouse/Lever/Ashby/public boards → diversify and reject irrelevant/skipped hosts → one fresh markdown Fetch batch of at most ten URLs → parse structured openings → Agent only for thin/unreadable eligible pages, capped at two → canonical dedupe → seniority/work-mode filters → role/location/visa/keywords/resume ranking → persist listings and full trace before completion.

Search discovers live application pages with purpose and optional country/domain targeting. Fetch reads real pages with `ttl: 0`. Agent navigates interactive boards and returns a supported structured-output schema. Missing details remain unknown, application-form visa questions are not sponsorship evidence, and remote is not assumed worldwide.

Every hunt, including cache hits and failures, writes `searches` and ordered `search_events`. Cache is database-backed, per-user preference/resume hash, 15 minutes. Refresh bypasses it. Observatory hiding and skipped source flags are enforced by web queries and future hunts.

## Verification
Typecheck both apps and packages; production-build both apps; test parsing, dedupe, ranking, resume boosts, failed traces, cache and authorization helpers. Live Managed Auth/Neon/TinyFish acceptance needs configured app environment variables.
