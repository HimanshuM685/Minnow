# Graph Report - Minnow  (2026-10-06)

## Corpus Check
- 89 files · ~21,137 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .css 3, .example 2, (none) 1)

## Summary
- 537 nodes · 1243 edges · 31 communities (26 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b2da1e64`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- scripts
- runSearch
- next
- db/src/index.ts
- resume.test.ts
- environment.mjs
- requireAdmin
- web/package.json
- pipeline.ts
- (site)/layout.tsx
- core/package.json
- db/package.json
- core.test.ts
- extraction.ts
- contracts.ts
- Minnow
- compilerOptions
- TinyFishClient
- ref_node_crypto
- web/tsconfig.json
- core/tsconfig.json
- db/tsconfig.json
- Minnow implementation plan
- GEMINI.md
- package.json
- devDependencies
- types.ts

## God Nodes (most connected - your core abstractions)
1. `getSql()` - 31 edges
2. `next` - 23 edges
3. `requireAdmin()` - 22 edges
4. `executeHunt()` - 21 edges
5. `runSearch()` - 19 edges
6. `extractPage()` - 19 edges
7. `requireUser()` - 16 edges
8. `canonicalUrl()` - 14 edges
9. `one()` - 13 edges
10. `compilerOptions` - 12 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `downloadResume()`  [EXTRACTED]
  apps/web/app/api/resume/download/route.ts → packages/db/src/index.ts
- `SettingsPage()` --calls--> `hasGoogleAccount()`  [EXTRACTED]
  apps/web/app/(site)/app/settings/page.tsx → packages/db/src/access.ts
- `SettingsPage()` --calls--> `getProfile()`  [EXTRACTED]
  apps/web/app/(site)/app/settings/page.tsx → packages/db/src/index.ts
- `setListingVisibility()` --calls--> `hideListing()`  [EXTRACTED]
  apps/web/app/admin/actions.ts → packages/db/src/index.ts
- `setSourceSkipped()` --calls--> `skipSource()`  [EXTRACTED]
  apps/web/app/admin/actions.ts → packages/db/src/index.ts

## Import Cycles
- None detected.

## Communities (31 total, 5 thin omitted)

### Community 0 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:migrate, dev, dev:web, env:check, predev, setup:env (+3 more)

### Community 1 - "runSearch"
Cohesion: 0.27
Nodes (13): runSearch(), readBatch(), SourceName, buildQueries(), Candidate, discover(), diversify(), domains (+5 more)

### Community 2 - "next"
Cohesion: 0.08
Nodes (42): googleSignIn(), signIn(), signOut(), signUp(), GET(), metadata, dynamic, SettingsPage() (+34 more)

### Community 3 - "db/src/index.ts"
Cohesion: 0.09
Nodes (53): uploadResume(), AppLayout(), dynamic, dynamic, ListingsPage(), dynamic, HuntPage(), dynamic (+45 more)

### Community 4 - "resume.test.ts"
Cohesion: 0.31
Nodes (4): hasGoogleAccount(), isAdminEmail(), jszip, pdf-lib

### Community 5 - "environment.mjs"
Cohesion: 0.47
Nodes (7): configurationProblems(), main(), read(), resolveEnvironment(), updateEnvText(), value(), webKeys

### Community 6 - "requireAdmin"
Cohesion: 0.14
Nodes (31): setListingVisibility(), setSourceSkipped(), dynamic, Hunt(), dynamic, Hunts(), dynamic, metadata (+23 more)

### Community 7 - "web/package.json"
Cohesion: 0.05
Nodes (38): dependencies, lucide-react, mammoth, @minnow/core, @minnow/db, @neondatabase/auth, next, pdf-parse (+30 more)

### Community 8 - "pipeline.ts"
Cohesion: 0.08
Nodes (8): AgentEvent, agentOutputSchema, FetchFailure, FetchResponse, stringField, timestamps, RunStats, FetchPage

### Community 9 - "(site)/layout.tsx"
Cohesion: 0.13
Nodes (13): GET, POST, maxDuration, POST(), runtime, GET(), dynamic, SiteLayout() (+5 more)

### Community 10 - "core/package.json"
Cohesion: 0.08
Nodes (24): dependencies, entities, marked, zod, devDependencies, tsx, @types/node, typescript (+16 more)

### Community 11 - "db/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @neondatabase/serverless, devDependencies, tsx, @types/node, typescript, exports, ./types (+11 more)

### Community 12 - "core.test.ts"
Cohesion: 0.22
Nodes (13): Listing, listingSchema, countryAliases, countryFromLocation(), dedupe(), identity(), locationFit(), matchListings() (+5 more)

### Community 13 - "extraction.ts"
Cohesion: 0.31
Nodes (16): agentItem, cleanTitle(), companyFrom(), excerpt(), extractAgent(), extractPage(), inferSeniority(), inferVisa() (+8 more)

### Community 14 - "contracts.ts"
Cohesion: 0.16
Nodes (11): defaultPreferences, labels, preferencesSchema, SearchEvent, SearchResult, seniorities, sourceNames, SourceReport (+3 more)

### Community 15 - "Minnow"
Cohesion: 0.14
Nodes (13): Admin access, Admin panel, Apply the SQL migration, Build and verification, Environment reference, Google account-linking recovery, Minnow, Persistence and freshness (+5 more)

### Community 16 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+4 more)

### Community 17 - "TinyFishClient"
Cohesion: 0.40
Nodes (5): httpError(), reserveSearch(), TinyFishClient, TinyFishError, Preferences

### Community 18 - "ref_node_crypto"
Cohesion: 0.20
Nodes (3): sql, buildOnlyEnv, @playwright/test

### Community 19 - "web/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, incremental, paths, plugins, exclude, extends, include (+1 more)

### Community 20 - "core/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, rootDir, extends, include, ../../tsconfig.base.json

### Community 21 - "db/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, rootDir, extends, include, ../../tsconfig.base.json

### Community 22 - "Minnow implementation plan"
Cohesion: 0.40
Nodes (4): Minnow implementation plan, Pipeline, Runtime, Verification

### Community 28 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, typescript, name, private, type, workspaces, @electric-sql/pglite

### Community 29 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @electric-sql/pglite, jszip, pdf-lib, @playwright/test, typescript

### Community 30 - "types.ts"
Cohesion: 0.09
Nodes (23): ProfileActionResult, savePreferences(), saveProfile(), schema, HuntForm(), run(), save(), ProfileFormProps (+15 more)

## Knowledge Gaps
- **179 isolated node(s):** `dynamic`, `dynamic`, `dynamic`, `dynamic`, `dynamic` (+174 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 219 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `db/src/index.ts`, `requireAdmin`, `web/package.json`, `(site)/layout.tsx`, `types.ts`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runSearch()` (e.g. with `.agent()` and `.search()`) actually correct?**
  _`runSearch()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `dynamic`, `dynamic`, `dynamic` to the rest of the system?**
  _179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `next` be split into smaller, more focused modules?**
  _Cohesion score 0.07985193019566367 - nodes in this community are weakly interconnected._
- **Why does `@neondatabase/serverless` connect `db/src/index.ts` to `ref_node_crypto`, `db/package.json`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `db/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09249786871270248 - nodes in this community are weakly interconnected._
- **Why does `@electric-sql/pglite` connect `package.json` to `db/src/index.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._