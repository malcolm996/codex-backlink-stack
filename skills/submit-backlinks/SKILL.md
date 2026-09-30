---
name: submit-backlinks
description: Screen, qualify, submit, verify, and record backlink opportunities from candidate pools or discovery research. Use for directory listings, profiles, product launches, resource-page outreach, reciprocal-link opportunities, competitor backlink pools, or campaigns that require explicit evidence and bounded execution.
---

# Submit Backlinks

## Goal

Turn a target-site brief and a raw backlink pool into a qualified queue, execute only authorized actions, verify explicit evidence, and keep submission actions separate from public backlinks.

Treat this skill as a baseline workflow. Follow the user's explicit goals, constraints, tools, and authorization choices over its defaults. Adapt source selection, thresholds, batch size, order, and output format when useful; preserve evidence integrity, privacy, and explicit boundaries for payment, identity verification, and site changes.

## Tool boundary: local browser agent first

For Semrush data available through the local setup, use the local `backlink-browser-agent` bridge and Chrome extension as the interaction layer. Codex must not directly open, click, scrape, or automate `sem.3ue.co`. The extension uses the user's existing browser session; the bridge returns normalized results and keeps credentials, cookies, and raw session values out of the workflow. Read [references/browser-agent.md](references/browser-agent.md) before using this path.

The browser agent collects and inspects data; it does not submit comments or listings. Keep `manualSubmit=true`, leave CAPTCHA/2FA/login recovery to the user, and record plugin task results separately from public backlink results.

For comment or forum placements, hand copy generation to `$backlink-copywriter` after the candidate passes qualification and readable source context is available. This skill decides whether and when a candidate may proceed; `backlink-copywriter` writes and checks the text. Do not duplicate its copy rules here.

## Guide the first run

Read `references/guided-onboarding.md` when the user provides only a site URL, gives an incomplete request, or asks how to begin.

Use these safe defaults when the user does not specify them:

- build and show a qualified queue before execution;
- target up to 10 qualified opportunities in the first queue;
- use free routes only;
- allow reciprocal candidates into the queue but require approval before changing the site;
- keep execution at `queue_only` until the user gives one-time campaign authorization;
- after authorization, use `authorized_continuous` and continue through qualified free platforms without repeated confirmation;
- use the local browser agent for Semrush via 3UE when fresh Semrush data is needed; do not operate `sem.3ue.co` directly from Codex;
- prefer existing local artifacts or user-provided exports when they already contain sufficient provenance;
- for competitor-backlink discovery, find 10–20 relevant competitors when available and build a broad raw pool before ranking or qualification;
- remember only the provider/transport name after a successful bridge result or export, without storing account or session data;
- use local JSONL or stdout unless a tracker is configured;
- infer public product facts from the live site before asking questions.

Ask one bundled question only for facts that block read-only progress. Continue discovery and qualification while optional copy, assets, or execution permissions remain unresolved.

Show a compact kickoff summary before substantial work:

```text
Target:
Mode: pool | discovery
Sources:
SEO source:
Browser-agent task:
Queue target:
Paid policy:
Reciprocal policy:
Execution policy:
Google OAuth policy:
Current stage:
```

## Collect inputs

Collect the target-site brief before screening candidates:

- site name and canonical site URL;
- target page name, URL, and type;
- product category, audience, language, and market;
- tagline, short description, long description, and keywords;
- contact identity, social URL, logo, and screenshots;
- target result count, free/paid constraint, and reciprocal-link policy.

Choose one entry mode:

- **Pool mode — preferred:** accept CSV, JSONL, spreadsheet, or URL-list candidates from the user.
- **Discovery mode:** use competitors, keywords, directories, resource pages, or search sources to build a raw pool first. For competitor research, favor broad bulk exports across many relevant competitors; raw pools may contain thousands or tens of thousands of rows.

Read `references/candidate-pool.md` before parsing a pool or starting discovery. Preserve provenance. Never submit directly from an unverified URL list.

For a local pool file, run `scripts/prepare_pool.py` to normalize and deduplicate CSV, JSONL, or plain-text input. When a reusable campaign workspace helps, run `scripts/init_campaign.py` to create editable templates.

Read `references/discovery-sources.md` before choosing discovery sources. Treat commercial SEO suites as optional sources; do not block discovery when they are unavailable.

At the start of Discovery mode, run `scripts/preferences.py --show`, then read `references/preferences.md`. If Semrush data is needed and no sufficient export exists, check the local bridge health and enqueue a browser-agent task as described in `references/browser-agent.md`. Do not inspect browser tabs, cookies, tokens, or `sem.3ue.co` page state from Codex.

## Build a qualified queue

For each candidate, verify:

1. The target page is reachable and relevant.
2. A current submission route or legitimate public contact exists.
3. The product and page type are eligible.
4. Free and paid paths are clearly distinguished.
5. Duplicate listings and prior attempts are excluded.
6. Login, CAPTCHA, assets, scheduling, and reciprocal-link requirements are known.

Classify every checked candidate:

- `A — direct free`: eligible working route with no mandatory reciprocal link.
- `B — free with login/assets`: eligible and free but needs authentication, assets, or scheduling.
- `C1 — qualified reciprocal`: requires a link, badge, footer placement, or embed and passes `references/reciprocal-links.md`.
- `C2 — rejected reciprocal`: fails relevance, legitimacy, evidence, link-attribute, authority, or sitewide-linking gates.
- `D — blocked/ineligible`: paid-only without approval, duplicate, dead route, account limit, wrong category, persistent failure, or unverifiable outcome.

Execute `A`, then `B`, then approved `C1`. Skip `C2` and `D`.

Do not apply a blanket rejection to mandatory reciprocal links or badges. Keep every gate-passing `C1` candidate in the qualified queue with `approval_required`; reject only `C2`.

For a target of 10 or more results, read `references/high-volume-outreach.md` before discovery or execution.

When the campaign is specifically for comments or forum replies, pass `inspectCandidates=true` to the Semrush browser-agent task when supported. Consume the returned `candidatePages` and `commentAnalysis`; do not separately browse each source page from Codex. For directory, profile, launch, or outreach campaigns, set `inspectCandidates=false` unless a candidate type explicitly needs comment inspection.

## Authorization boundaries

- Treat platform submissions, account creation, and outreach sends as external writes. Perform them only when the user asked to execute the campaign.
- Before the first Google sign-in in a campaign, ask once whether the user authorizes reuse of an existing Google session for ordinary sign-in, account creation, and qualified free submissions.
- After approval, reuse that authorization across the current campaign. Click `Sign in with Google`, select the authorized account, and continue without asking again on every platform.
- If the user authorizes remembering this choice, store only the boolean reuse preference with `scripts/preferences.py --remember-google-oauth`.
- If several Google accounts are available and no preferred account was authorized, ask once which account to use, then reuse that choice for the campaign.
- Stop at payment unless the amount and platform are explicitly approved.
- Obtain approval before adding a reciprocal link, badge, footer item, or embed unless the campaign brief already authorizes that exact class of site change.
- Leave CAPTCHA, passkey, recovery, and identity-verification steps to the user.
- Stop on new credentials, account mismatch, 2FA, recovery, passkey, unusual terms, or permissions beyond ordinary profile and email access.
- Login success proves authentication only.
- The browser agent may open a dedicated minimized task window, but it must not submit the backlink action. A `manual_required` result is a handoff to the user, not a successful submission.

Read `references/oauth-session.md` before the first OAuth flow or when an account chooser, consent screen, or authentication blocker appears.

## Timebox

- Preflight a new platform for at most 2 minutes.
- Spend at most 5 minutes on a direct form.
- Spend at most 8 minutes on login or multi-step flows.
- After two equivalent failures, try one materially different route or stop.
- Retry one timeout once with a clean state.
- Stop immediately on a confirmed paywall, duplicate, ineligible category, account limit, broken route, or `C2` requirement.

## Execute in small batches

1. Prepare one reusable submission pack. For comment/forum placements, invoke `$backlink-copywriter` and attach the approved draft or no-link variant; do not generate those drafts inside this skill.
2. Reuse one active submission tab.
3. Run 3–5 candidates per batch.
4. Record every terminal result before moving on.
5. Close tabs or task spaces opened by the campaign after evidence capture.

Do not close browser state that existed before the campaign. Keep context extracts limited to URL, title, required fields, visible errors, selected plan, final status, and evidence URL.

## Evidence rules

Count a successful submission only with at least one of:

- explicit submission or review receipt;
- review, ticket, or submission ID;
- confirmed schedule or queue date;
- public product, profile, or listing URL.

Count a public backlink only when an unauthenticated public page contains a real link to the submitted site. Verify `dofollow`, `nofollow`, or `sponsored` from the rendered link or public HTML; otherwise record `unknown`.

Keep these outcomes separate:

- `send_clicked`;
- `pending_review`;
- `scheduled`;
- `published`;
- `rejected`;
- `paywall_stopped`;
- `blocked`;
- `unknown`.

Never count a button click, cleared form, generic dashboard, login redirect, search result, or missing confirmation as a successful submission.

For outreach, click Send once and record the recipient, subject, time, and `send_clicked`. If the action returns an unknown tool state, record `send_unknown` and do not resend automatically.

## Reciprocal links

Read `references/reciprocal-links.md` before accepting any mandatory backlink, badge, footer link, or embed.

Evaluate reciprocal candidates individually. Include qualified `C1` opportunities in the queue even when site-change approval is still pending.

A reciprocal result becomes `published` only after:

1. the outbound placement is publicly deployed and verified; and
2. the incoming public listing contains the promised link.

If the incoming link fails to appear within the stated review window or later disappears, remove or deactivate the outbound placement when authorized and preserve the historical result.

## Record results

Use `scripts/record_backlink.py`. By default it prints normalized JSON to stdout and performs no external write.

Write locally only when `--output-jsonl` is provided. Use `--lark-config` only when the user configured and authorized Lark Base tracking. Read `references/tracker.md` for setup and field mapping.

Record one row per terminal attempt with provenance, classification, action status, evidence type, evidence URL, reciprocal state, link attribute, timestamps, and notes.

When a local browser agent was used, also retain `collection_method=backlink-browser-agent`, the bridge `taskId`, provider name, query scope/page, result timestamp, and any `manual_required` reason. Never record the bridge token, cookies, raw authenticated URLs, or full network captures.

Update an existing tracker row when its status changes; do not create a duplicate attempt.

### Product published-record spreadsheet

Keep three destinations separate:

- `外链候选队列`: discovered and inspected opportunities, including Semrush/browser-agent provenance;
- `外链表沉淀`: qualified opportunities approved for manual execution;
- one independent Feishu spreadsheet for each Web product's submitted backlink records.

For the third destination, use the normalized Web product URL itself as the spreadsheet title (for example, `https://example.com/`) and the worksheet title `外链发布记录`. Do not use only a domain name, product name, or the Semrush result title.

After a user-authorized submission, call the local browser-agent bridge `POST /v1/feishu/sync-published` with `productUrl` and one record per attempted source URL. The bridge creates or reuses that product spreadsheet and updates an existing row by normalized `来源URL` instead of appending a duplicate. A new record starts with `回访是否发布成功=待回访`.

On a later revisit, update the same row with `回访时间`, `回访证据URL`, and `回访是否发布成功=是` or `否`. `是` requires an unauthenticated public page containing the target link, or an equivalent explicit publication receipt; a submit-button click, cleared form, login success, generic dashboard, or search result is not enough. Preserve `提交状态` separately (`send_clicked`, `pending_review`, `scheduled`, `published`, `rejected`, `blocked`, or `unknown`).

Do not send Semrush discovery rows to this endpoint. A candidate becomes a published-record row only after the submission workflow has produced a terminal attempt result. Keep the bridge task ID and provenance in the campaign record, not as a substitute for publication evidence.

## Report stage boundaries

At the end of qualification, report:

- raw, duplicate, rejected, and qualified counts;
- the `A/B/C1` queue with reasons and requirements;
- the `C2/D` exclusions with concrete reasons;
- unresolved login, asset, payment, CAPTCHA, or site-change blockers;
- the exact next batch proposed for execution.

If `execution_policy=queue_only` or the user explicitly asked to approve the queue, stop and wait.

If `execution_policy=authorized_continuous`, show the queue as a progress checkpoint and continue immediately with `A`, `B`, and already approved `C1` candidates. Do not ask again merely because the queue was displayed.

## Maintain reusable knowledge

Use `references/platform-playbook.md` as a dated template for recurring platform facts. Revalidate pricing, eligibility, route availability, and reciprocal requirements before relying on any cached entry. Use `references/browser-agent.md` for the local collection transport; do not add direct Semrush browser steps back into this skill.
