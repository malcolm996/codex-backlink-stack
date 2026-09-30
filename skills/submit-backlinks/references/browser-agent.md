# Local Browser Agent Workflow

Use this reference whenever the campaign needs fresh Semrush backlink data or automated candidate-page inspection through the local setup.

## Boundary

`backlink-browser-agent` is the transport between this skill and the authenticated browser session. Codex talks to the local bridge only. The Chrome extension opens the configured provider page in its dedicated task window, uses the existing session, captures only configured response data, and posts a normalized result back to the bridge.

Never make Codex directly open or automate `https://sem.3ue.co`, call its internal endpoints, read browser cookies/storage, or copy session values into a campaign file. A `sem.3ue.co` URL inside `sourcePages` is provenance from the plugin result, not a URL for a second direct request.

## Preconditions

1. The local bridge is running at the configured `browser_agent_bridge` (normally `http://127.0.0.1:17831`).
2. `GET /health` returns `ok: true`.
3. The extension is installed, connected to that bridge, and has the required site permission. Do not ask for or record its token; use the locally configured authorization channel.
4. The user has an authenticated provider session in the agent's dedicated browser profile, or is ready to complete login/CAPTCHA/2FA in the foreground when the plugin reports `manual_required`.

If any precondition fails, stop the plugin path, report the concrete blocker, and use an existing export or public discovery instead. Do not open the third-party provider directly from Codex.

## Task types

### Semrush backlink discovery

Enqueue one task per normalized domain and page. Use `inspectCandidates=true` for comment/forum campaigns when the candidate-page permission has been configured; use `false` for directory, profile, launch, or outreach discovery unless comment inspection is needed.

```json
{
  "version": "1.0",
  "type": "domain.backlink_metrics.collect",
  "provider": "semrush-via-3ue",
  "input": {
    "domain": "example.com",
    "scope": "domain",
    "page": 1,
    "inspectCandidates": true
  },
  "limits": {
    "maxPages": 1,
    "maxRecords": 100,
    "maxCandidatePages": 20
  },
  "execution": {
    "mode": "quiet",
    "manualSubmit": true
  }
}
```

The bridge/extension derives the provider entry and report URLs. Do not add a direct `sem.3ue.co` URL to the task merely to force navigation.

### Single candidate-page inspection

Use this when a source page was supplied separately or when the Semrush task did not inspect candidates:

```json
{
  "version": "1.0",
  "type": "candidate.comment.check",
  "provider": "comment-page",
  "input": { "sourceUrl": "https://source.example/article" },
  "limits": { "maxPages": 1, "maxRecords": 0 },
  "execution": { "mode": "quiet", "manualSubmit": true }
}
```

This task inspects metadata and the visible comment form only. It never posts a comment.

## Bridge sequence

1. Check `GET /health`.
2. `POST /v1/tasks` with one of the task bodies above.
3. Keep the returned `taskId`. The extension polls `GET /v1/tasks/next`; do not open another provider tab to help it.
4. Poll `GET /v1/tasks/{taskId}` until the task is `completed`, `manual_required`, or `failed`. A completed task contains `task.result`.
5. For Semrush results, consume the bridge-normalized `overview`, `qualification`, `backlinks`, `pagination`, `queryLedger`, and optional `candidatePages`. Do not parse raw network captures in Codex.
6. If `candidatePages` is present, map each page's `commentAnalysis` to the candidate queue. If it is absent, enqueue `candidate.comment.check` tasks for only the pages that need inspection.
7. Import normalized backlink rows through `POST /v1/queue/import-backlinks` when using the bridge queue. Preserve the returned `created`/`existing`/`invalid` counts and keep the source `taskId` in the campaign record. A spam-labelled authority result may be returned as `skipped`; do not retry it as a transport error.
8. Use the bridge queue for source-page deduplication, then use `submit-backlinks` classifications (`A`, `B`, `C1`, `C2`, `D`) for campaign decisions. The Chinese queue states (`待采`, `已抓`, `有表单`, `无表单`, `已发`, `跳过`) are operational evidence, not replacements for the campaign classification.

### Feishu publication records

After a user-authorized submission produces a terminal attempt result, write it separately from discovery and qualification data:

```http
POST /v1/feishu/sync-published
Content-Type: application/json

{
  "productUrl": "https://example.com/",
  "records": [{
    "sourceUrl": "https://source.example/article",
    "articleUrl": "https://source.example/article",
    "targetUrl": "https://example.com/tool",
    "submittedAt": "2026-09-30T10:00:00Z",
    "status": "pending_review",
    "revisitPublishedSuccess": "待回访"
  }]
}
```

The bridge creates or reuses one Feishu spreadsheet whose title is the normalized full `productUrl`, with worksheet `外链发布记录`. It uses normalized `sourceUrl` as the update key, so a revisit updates the existing row. New rows start at `待回访`; set `是` or `否` only after recording `revisitAt` and evidence. Never send Semrush discovery rows to this endpoint.

## Result interpretation

- `completed`: data collection finished; still verify route, eligibility, cost, duplicates, and reciprocal requirements before qualification.
- `manual_required`: the user must handle permission, login, CAPTCHA/2FA, a page-structure change, or another foreground action. It is not a submission success.
- `failed`: preserve the task error, do not silently retry the same route more than the normal timebox allows.
- `overview.qualification.reject_spam`: skip the domain for this campaign according to the existing authority gate.
- `commentAnalysis.decision.skip`: do not submit a comment to that page; retain the concrete blocking reason.
- `commentAnalysis.decision.review`: continue normal route and relevance checks. Plugin review is evidence, not an automatic `A` classification.

The plugin's normalized backlink `follow`/`rel` fields describe the observed source record. They are not proof that a future comment will carry the same attribute. Verify the published comment separately through the normal public-link evidence workflow.

## Provenance and privacy

For every imported batch, retain `collection_method=backlink-browser-agent`, `collection_task_id`, provider, normalized domain, query page, result timestamp, and the original source/export identifier. Do not retain bridge tokens, cookies, account IDs, email addresses, full request captures, or authenticated provider URLs with session parameters.

When a comment candidate passes qualification, call `$backlink-copywriter` with the readable article/thread context, target page brief, link policy, and any approved anchor options. The browser agent's `commentAnalysis` can inform placement constraints, but it is not article text and does not authorize a link.
