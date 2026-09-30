# Qualified Reciprocal Links

Use this policy for any platform requiring a backlink, badge, footer link, or embed.

## Acceptance gates

Accept a reciprocal route only when every gate passes:

1. The platform and listing are relevant to the submitted product and audience.
2. The platform is legitimate, publicly reachable, and free of obvious link-farm patterns.
3. The promised incoming result is a public page with an unauthenticated link to the submitted site.
4. The outbound placement is honest, visible, and appropriate for the site.
5. The platform accepts a qualified link attribute. Use `nofollow noopener noreferrer` by default. Use `sponsored` when payment is involved.
6. The exchange does not create excessive sitewide linking, hidden links, keyword-stuffed anchors, or a partner page made only for cross-linking.
7. Any authority metric is current, dated, and named. Treat it as a screening signal rather than proof of quality.
8. The user has approved the required site change or the campaign brief already authorizes that exact class of placement.

Reject a platform if it requires an unqualified dofollow link, deceptive placement, unrelated sitewide link, hidden badge, or payment that has not been approved.

Passing candidates are `C1` and remain part of the qualified queue. Pending approval blocks execution, not qualification. Do not replace this evaluation with a blanket skip rule.

## Add, verify, and roll back

1. Record the exact listing URL, destination URL, asset, alt text, placement, and required link attribute.
2. Add the platform through one shared data source or component.
3. Deploy the smallest authorized site change.
4. Verify the outbound placement in public HTML.
5. Complete the platform flow.
6. Verify the public incoming link.
7. Roll back the outbound placement when the promised incoming link misses its stated review window or disappears later.

When the platform must verify the placement before publication, mark the outbound entry `pending` until the incoming link is live.

## Presentation limits

- Keep the active set small and relevant.
- Use fixed image dimensions to prevent layout shift.
- Support keyboard access and reduced-motion preferences for moving strips.
- Do not hide links offscreen or use deceptive styling.
- Store `platform`, `href`, `logo`, `alt`, `authority`, `authority_checked_at`, `incoming_url`, `status`, and `rel`.

Every active placement must correspond to a legitimate incoming result or a clearly time-bounded pending review.
