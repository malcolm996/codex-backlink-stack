# High-Volume Outreach

Use this workflow when the target is 10 or more terminal results.

## Build the queue first

For a target of `N`, prepare at least `max(N + 5, ceil(N * 1.3))` qualified candidates. For 20 results, prepare at least 26 and prefer 30.

This formula applies only to the verified qualified queue. The raw discovery pool may contain thousands or tens of thousands of backlink rows from many relevant competitors.

A candidate is qualified only when:

- its provenance is retained;
- the page is reachable and relevant;
- a current submission route or legitimate contact is verified;
- historical attempts and duplicates are excluded;
- payment requirements are known;
- reciprocal requirements have passed the reciprocal-link gates;
- required login and assets are known.

Persist discovery incrementally. Save partial results every 10 checked domains. If a scan produces no output, retry once with lower concurrency or smaller chunks, then use saved artifacts.

Reject privacy, abuse, legal, licensing, generic placeholder, and unrelated support contacts.

## Test route families

Group sibling domains and forms that share templates, endpoints, or contact APIs. Test one representative route first. If the same backend failure occurs twice, quarantine that route family for the campaign.

Keep discovery, execution, tracking, and public verification as separate stages.

## Execute in batches

Run 3–5 candidates at a time:

1. perform the authorized action;
2. capture the terminal state;
3. append the result to the local campaign file;
4. continue to the next candidate.

For outreach sends, click Send once. Store recipient, subject, click time, and `send_clicked`. If the action state is unknown, record `send_unknown` and do not resend automatically.

Reuse one submission tab. At each batch boundary, close completed, rejected, search, and scratch tabs created by the campaign.

## Track and verify

Write configured trackers in batches of 5–10. Preserve returned record IDs so retries affect only missing rows.

Run public-link checks concurrently after execution. Count a live link only when an unauthenticated successful response contains a real link to the submitted site.

Keep action counts, pending reviews, schedules, published pages, and public backlinks separate.

## Telemetry

Store:

- `discovery_started_at`
- `queue_qualified_at`
- `execution_started_at`
- `execution_completed_at`
- `tracking_completed_at`
- `verification_completed_at`
- raw and qualified candidate counts
- duplicate and rejection counts
- route-family failures
- browser retry count
- final status totals

Do not declare completion below target until the qualified queue is exhausted and every skipped candidate has a concrete reason.
