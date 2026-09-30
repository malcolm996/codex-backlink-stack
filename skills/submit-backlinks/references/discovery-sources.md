# Discovery Source Routing

Maximize relevant source coverage for competitor-backlink research, then reduce the pool through normalization, deduplication, ranking, and qualification. Preserve the source URL, export name, query, competitor, and observation date.

## Source order

1. Reuse current local artifacts and prior campaign files.
2. Ingest user-provided exports or URL lists.
3. Use the local `backlink-browser-agent` bridge for a supported fresh provider result.
4. Reuse a remembered provider only through its supported local transport and only when a fresh result succeeds.
5. Search public directory indexes, product-launch collections, resource pages, and relevant queries.
6. Inspect competitor public backlinks and referring pages.

Always open the actual opportunity page before qualification. Third-party metrics, snippets, and export rows are discovery evidence only.

## Large competitor pools

When the user wants a reusable competitor-backlink pool:

1. identify 10–20 directly relevant, search-overlapping, or category-adjacent competitors when enough good matches exist;
2. export the largest useful backlink or referring-page dataset available for each competitor within the active plan, platform rules, and user-authorized scope;
3. target roughly 5,000–50,000 raw rows for an initial broad pool when the tool can provide them, while accepting larger exports instead of imposing an arbitrary small cap;
4. save every per-competitor export unchanged, then merge and normalize copies;
5. deduplicate by referring domain for opportunity counts while retaining page-level rows as evidence;
6. apply cheap bulk filters and ranking before opening individual opportunity pages.

Do not treat raw-pool size as a qualified-queue limit. Thousands or tens of thousands of exported rows are acceptable because download and local normalization are cheaper than live page qualification.

Continue adding relevant competitors until the available set is exhausted, the tool or plan limit is reached, or two consecutive competitor exports each add less than 5% net-new relevant referring domains and the qualified reserve is already sufficient.

## Optional SEO sources

Commercial SEO suites are optional accelerators. In the current local setup, Semrush is reached only through `backlink-browser-agent` with provider `semrush-via-3ue`; the skill has no permission to operate the third-party site directly.

Do not ask Codex to inspect visible tabs or copy session state. Enqueue a bridge task, let the extension use its configured browser session, and consume the normalized result. If the bridge is unavailable, use an existing export or public sources and report the limitation.

When an export is available:

1. save the original file unchanged;
2. run `scripts/prepare_pool.py`;
3. prefer source/referring URLs over the export’s destination URL;
4. retain competitor and metric columns as provenance;
5. verify the current opportunity page independently.

When a configured browser-agent session is available and fresh data is useful, enqueue the requested domain/backlink task. Export broadly within the selected report and authorized scope, but do not crawl unrelated projects or unrelated account data. Read `references/browser-agent.md` for the task and result contract.

When access is unavailable, continue with public sources and report the limitation. Do not present the lack of a commercial tool as a blocker.

After a successful bridge result or export, remember the provider/transport with `scripts/preferences.py --remember-provider PROVIDER --selection-source successful_bridge_result` (or `successful_export`). Store the provider name and timestamp only. Never store cookies, tokens, account identifiers, or captured session data. Read `preferences.md`.

## Source quality

Prioritize:

- relevant directories with a working route;
- public profiles or launch pages allowed by platform policy;
- resource pages with a legitimate contact path;
- editorial opportunities grounded in useful content, data, or expertise;
- competitor sources whose placement mechanism can be verified.

Deprioritize or reject:

- search result pages, app-store mirrors, and generic aggregators with no submission route;
- unrelated high-authority domains;
- privacy, legal, abuse, licensing, or generic support contacts;
- stale exports with no live route;
- paid placements when the campaign is free-only;
- sources that cannot produce durable evidence.
