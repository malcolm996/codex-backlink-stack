# Platform Playbook Template

Treat every entry as dated cache. Revalidate pricing, eligibility, route availability, account limits, asset requirements, and reciprocal requirements before execution.

## Entry format

```markdown
### Platform name

- Checked at:
- Official URL:
- Product categories:
- Classification:
- Free path:
- Submission route:
- Login requirements:
- Asset requirements:
- Reciprocal requirements:
- Last explicit evidence:
- Known failure mode:
- Fastest safe route:
- Recheck trigger:
```

## What belongs here

Store findings that will save time in later campaigns:

- a paywall revealed only at the final step;
- a domain-level duplicate check;
- a disabled registration path;
- a shared failing backend family;
- an optional badge presented as mandatory;
- a free queue hidden behind a paid upsell;
- exact asset constraints;
- a form reset that produced no durable receipt;
- a current public listing route.

Do not store credentials, personal account identifiers, private tracker IDs, session data, or full campaign histories.

## Early-exit patterns

Reject or pause during preflight when:

- the free route is unavailable;
- the platform is ineligible for the product type;
- an existing listing or account limit is confirmed;
- the submission route is broken after one clean retry;
- publication requires unapproved payment;
- reciprocal requirements fail the quality gates;
- there is no durable receipt or verifiable public result.
