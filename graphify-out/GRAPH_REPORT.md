# Graph Report - Minnow  (2026-10-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 218 nodes · 548 edges · 9 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fda1b2e8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8

## God Nodes (most connected - your core abstractions)
1. `extractPage()` - 19 edges
2. `runSearch()` - 19 edges
3. `Preferences` - 14 edges
4. `App()` - 13 edges
5. `compilerOptions` - 13 edges
6. `canonicalUrl()` - 12 edges
7. `publicUrl()` - 11 edges
8. `Listing` - 10 edges
9. `TinyFishClient` - 10 edges
10. `isJobUrl()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `Preferences`  [EXTRACTED]
  src/components/PreferencesForm.tsx → shared/contracts.ts
- `useSearch()` --calls--> `readSSE()`  [EXTRACTED]
  src/hooks/useSearch.ts → shared/sse.ts
- `Candidate` --references--> `SourceName`  [EXTRACTED]
  server/discovery.ts → shared/contracts.ts
- `runSearch()` --calls--> `TinyFishClient`  [EXTRACTED]
  server/pipeline.ts → server/tinyfish.ts
- `runSearch()` --calls--> `TinyFishError`  [EXTRACTED]
  server/pipeline.ts → server/tinyfish.ts

## Import Cycles
- None detected.

## Communities (9 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (36): dependencies, dotenv, entities, express, lucide-react, marked, react, react-dom (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (29): buildQueries(), Candidate, discover(), diversify(), domains, SearchHit, agentItem, cleanTitle() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (22): lucide-react, react, defaultPreferences, labels, Listing, preferencesSchema, App(), examples (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (16): SearchQuery, AgentEvent, agentOutputSchema, FetchFailure, FetchPage, FetchResponse, httpError(), reserveSearch() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (17): zod, listingSchema, SearchEvent, SearchResult, seniorities, sourceNames, SourceReport, Stage (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (14): dotenv, express, cachedSearch(), cacheSearch(), entries, preferenceKey(), active, app (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (12): devDependencies, concurrently, esbuild, @playwright/test, tsx, @types/express, @types/node, @types/react (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.36
Nodes (10): countryAliases, countryFromLocation(), dedupe(), identity(), locationFit(), matchListings(), normalize(), roleFit() (+2 more)

## Knowledge Gaps
- **72 isolated node(s):** `AgentEvent`, `FetchFailure`, `dotenv`, `entities`, `express` (+67 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 82 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 5`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runSearch()` (e.g. with `.agent()` and `.search()`) actually correct?**
  _`runSearch()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AgentEvent`, `FetchFailure`, `dotenv` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13846153846153847 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13666666666666666 - nodes in this community are weakly interconnected._