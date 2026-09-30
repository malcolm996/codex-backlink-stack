# OAuth Session Reuse

Use one-time campaign authorization instead of asking at every platform.

## Ask once

Before the first Google OAuth flow, ask:

> May I reuse an existing Google session for this campaign to sign in, create ordinary platform accounts, and submit qualified free listings? I will pause only for account ambiguity or mismatch, new credentials, CAPTCHA, 2FA/passkey/recovery, unusual permissions or terms, payment, or website changes.

Record the answer in campaign state:

- `execution_policy`: `queue_only` or `authorized_continuous`
- `google_oauth_policy`: `ask_once`, `reuse_existing_session`, or `do_not_use`
- `authorized_google_account`: runtime account label when the user selects one

Do not store the account label in public artifacts, reusable playbooks, or source control.

If the user asks to remember the authorization beyond this campaign, run `scripts/preferences.py --remember-google-oauth`. Future campaigns may reuse the boolean preference, but must still verify that an appropriate Google session is currently available.

## Reuse the authorization

When `google_oauth_policy=reuse_existing_session`:

1. click the platform’s official `Sign in with Google` action;
2. choose the authorized account when it is present;
3. allow ordinary profile and email access;
4. return to the platform and continue the qualified free flow;
5. record authentication separately from submission evidence.

Do not request another confirmation for each qualified platform in the same campaign.

If the chooser contains several accounts and no account was selected during authorization, ask once which account to use. Reuse that selection afterward.

## Pause conditions

Pause only when:

- the authorized account is absent or mismatched;
- a password, new credential, recovery step, 2FA, passkey, or device verification appears;
- CAPTCHA requires user interaction;
- the consent screen requests unusual permissions beyond ordinary profile and email access;
- the platform presents unusual terms, payment, or a materially different account action;
- the flow requires an unapproved reciprocal site change;
- the OAuth callback fails after one clean retry.

Login or account creation is not submission evidence. Continue until the platform returns a durable terminal result or the flow reaches a stop condition.
