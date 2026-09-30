# Candidate Pool Contract

## Campaign brief

Collect this before candidate work:

- `site_name`
- `site_url`
- `page_name`
- `page_url`
- `page_type`
- `category`
- `audience`
- `language_market`
- `tagline`
- `short_description`
- `long_description`
- `keywords`
- `contact_name`
- `contact_email`
- `logo`
- `screenshots`
- `social_url`
- `target_count`
- `allow_paid`
- `reciprocal_policy`
- `execution_policy`
- `google_oauth_policy`
- `authorized_google_account`
- `seo_source_policy`
- `preferred_seo_provider`
- `remember_provider_after_success`
- `browser_agent_bridge`
- `inspect_candidates`

Missing optional copy or assets may be prepared before execution. Missing target URL, product identity, or authorization boundaries block execution.

## Pool mode

Accept CSV, JSONL, spreadsheet, or plain URL lists. Prefer these candidate fields:

- `platform`
- `opportunity_url`
- `source`
- `source_url`
- `submission_url`
- `route_type`
- `contact`
- `competitor_source`
- `collection_method`
- `collection_task_id`
- `provider_result_at`
- `authority_metric`
- `authority_value`
- `observed_at`
- `notes`

`opportunity_url` is the page or domain that may provide the backlink. `destination_url` is the submitted site page that should receive it. Keep those concepts separate when importing SEO-tool exports.

Only `platform` or `opportunity_url` is required for ingestion. A candidate does not enter the qualified queue until its route, eligibility, cost, duplicate state, and reciprocal requirements are verified. When imported from the browser agent, retain the normalized provider fields and task provenance; do not treat a Semrush row alone as qualification.

Use `scripts/prepare_pool.py` for deterministic ingestion:

```bash
python3 scripts/prepare_pool.py \
  --input candidates.csv \
  --output-jsonl raw-pool.jsonl \
  --source user-pool
```

The script recognizes common CSV headers, prefers referring/source URLs over ambiguous target URLs in SEO exports, derives platform names from hostnames, and reports invalid and duplicate rows. It performs no network requests and does not qualify candidates.

Domain-level deduplication is the default. Use `--dedupe-by url` when multiple distinct opportunity pages on one domain are intentionally allowed.

Normalize before deduplication:

- lowercase hostnames;
- remove default ports and URL fragments;
- remove trailing slashes;
- treat `www.` and bare hostnames as the same domain unless they serve different products;
- normalize recipient email case;
- compare platform, domain, submitted page, and prior attempt identifiers.

## Discovery mode

Build a raw pool from one or more user-authorized sources:

- competitor backlink exports;
- directory indexes;
- product-launch collections;
- relevant resource pages;
- search queries;
- public business-contact pages.

Save the exact source and discovery time for every candidate. Search snippets and third-party authority scores are discovery signals only. Open the actual platform before qualification.

## Qualified queue fields

Add these fields after preflight:

- `classification`: `A`, `B`, `C1`, `C2`, or `D`
- `classification_reason`
- `verified_at`
- `submission_route`
- `free_status`
- `duplicate_status`
- `login_requirements`
- `asset_requirements`
- `reciprocal_requirements`
- `authority_evidence`
- `planned_action`
- `priority`

Do not start live execution from a pool that contains only URLs.
