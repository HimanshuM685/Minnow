# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Job and internship seekers, especially students and early-career people in India (Bengaluru is the landing-page example), who want a shortlist of currently open roles for their role, location and skills without hopping between careers tabs and job boards.

## Product Purpose
Minnow finds live openings and ranks them against the user's saved preferences and resume. A hunt searches the web for careers and ATS pages, reads them at that moment, extracts structured openings, and returns a ranked shortlist. Success is a trustworthy shortlist in minutes, where every result links to its source.

## Positioning
Live pages, not stale posts: Minnow reads current company careers pages and public ATS boards (Greenhouse, Lever, Ashby, Workable and others) at hunt time using TinyFish Search, Fetch and Agent. Every result links to its source and every hunt records a trace. Missing details stay "not stated" rather than invented.

## Operating Context
Next.js App Router app (`apps/web`) on Neon Postgres with Managed Better Auth (Google first, email/password second). Users save preferences, upload a resume (PDF/DOCX) whose skills boost ranking, then run hunts from the dashboard. Hunts are cached 15 minutes per user; Refresh bypasses the cache. An allowlisted admin panel lives under `/admin`.

## Capabilities and Constraints
- Credits: every account starts with 10 credits; a live hunt costs one; cached replays are free. Users can add their own TinyFish key on the Credits page to bypass credits. More credits are requested via Telegram.
- Honest data: unknown salary, visa sponsorship, location and work mode are shown as unknown. Application-form visa questions are not sponsorship evidence. Remote is not assumed worldwide.
- Deploys as one Next.js app with Cache Components enabled; Vercel is the likely host (`vercel.json`).
- Undecided: pricing beyond credits; deploy target is not confirmed.

## Brand Commitments
Name "Minnow", wordmark "minnow." with a fish mark (`public/minnow.svg`), tagline "Small fish. Big possibilities.", and the "Powered by TinyFish" attribution. The plan describes an existing "coastal" product look to preserve.

## Evidence on Hand
No customer testimonials, usage numbers or benchmarks exist; none may be invented. Real content: the landing FAQ, the comparison table, the source list, and live hunt traces in the database.

## Product Principles
- Every claim traces to a live source page.
- Say "not stated" instead of guessing.
- Fast to a first shortlist; the hunt is the product, not the marketing.
- Free to try, transparent about cost, bring-your-own-key allowed.
- Built for India-first job seekers without excluding other markets.

## Accessibility & Inclusion
No formal standard stated. Existing app supports skip link, visible focus, reduced motion and light/dark color schemes; keep them.
