# Guided Onboarding

Use this guide when the user provides only a URL, an incomplete target brief, or a general request such as “find backlink opportunities.”

## Start from one URL

1. Inspect the public site read-only.
2. Infer the site name, canonical URL, category, audience, language, tagline, descriptions, keywords, social URLs, and available assets.
3. Mark inferred facts as inferred until verified.
4. Apply safe defaults:
   - show the qualified queue before execution;
   - up to 10 qualified opportunities;
   - free routes only;
   - reciprocal candidates allowed for review;
   - no site change without approval;
   - execution remains `queue_only` until one-time authorization.
5. Ask one bundled question only if the site is inaccessible, the product identity is ambiguous, or the requested external action lacks authorization.

Do not ask the user to manually provide public facts that can be inspected safely.

## Choose the mode

Use Pool mode when a CSV, JSONL, spreadsheet, URL list, or prior research artifact exists. Normalize it with `scripts/prepare_pool.py`.

Use Discovery mode when no usable pool exists. State the planned sources before substantial research. Read `discovery-sources.md`. If Semrush is selected, plan a local browser-agent task rather than direct interaction with `sem.3ue.co`.

## Show progress

At kickoff, show:

```text
Target: Example Product — https://example.com
Mode: Discovery
Sources: existing artifacts, public search, relevant directories
SEO source: local backlink-browser-agent | export | public sources
Browser-agent task: pending | not needed | completed
Queue target: up to 10 qualified opportunities
Paid policy: free only
Reciprocal policy: include C1 for approval
Execution policy: queue_only | authorized_continuous
Google OAuth policy: ask_once | reuse_existing_session
Current stage: building raw pool
```

At the queue checkpoint, show:

| Platform | Class | Current route | Cost | Requirements | Evidence | Planned action |
|---|---|---|---|---|---|---|

Then report excluded candidates separately with concrete reasons.

## Interpret common requests

“Find backlink opportunities” means build and qualify a queue. Do not submit.

“Find opportunities, show the queue, then execute” authorizes execution after the one-time campaign authorization step. Show the queue as a progress checkpoint and continue without another pause.

“Show me the queue and wait for my approval” means keep `execution_policy=queue_only` and stop at the checkpoint.

“Use this pool and submit qualified free listings” authorizes qualified free submissions after preflight. Payment, identity verification, and new site changes still follow their own approval boundaries.

“Get 10 backlinks” is ambiguous. Clarify whether the target means 10 terminal submission results or 10 verified public backlinks before declaring completion. Read-only discovery can continue meanwhile.

Never translate “reciprocal links require approval” into “skip every reciprocal platform.” Gate each candidate, keep qualified `C1` rows in the queue, and mark the required site change as pending approval.

Before the first platform requiring Google OAuth, ask one bundled question:

> May I reuse an existing Google session for this campaign to sign in, create ordinary platform accounts, and submit qualified free listings? I will pause only for account ambiguity or mismatch, new credentials, CAPTCHA, 2FA/passkey/recovery, unusual permissions or terms, payment, or website changes.

After approval, set `execution_policy=authorized_continuous` and `google_oauth_policy=reuse_existing_session`.

## Recover from missing inputs

- Missing copy: invoke `$backlink-copywriter` after the source context and target-page brief are available; do not write campaign copy inside this skill.
- Missing logo or screenshots: keep asset-heavy candidates in `B`.
- Missing historical tracker: deduplicate within available files and report the boundary.
- Missing browser-agent bridge or extension: continue with existing exports and public sources; do not fall back to direct `sem.3ue.co` automation.
- Small candidate pool: report the real qualified maximum and the next discovery source.
