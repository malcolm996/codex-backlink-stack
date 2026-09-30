# Backlink Copywriter Output Contract

Use this contract for chat output or for a downstream adapter. JSON is illustrative; prose may be used when the caller does not need machine-readable output, but the same fields should remain identifiable.

## Top-level shape

```json
{
  "version": "1.0",
  "status": "ready_for_review",
  "request": {
    "placement_type": "blog_comment",
    "language": "en-US",
    "link_policy": "allowed_once",
    "source_url": "https://source.example/article",
    "target_page_url": "https://product.example/tool",
    "target_keyword": "image to video"
  },
  "source_hooks": [
    {
      "hook": "The article compares short clips with longer edits.",
      "evidence": "paragraph 3, supplied excerpt",
      "kind": "argument"
    }
  ],
  "drafts": [
    {
      "id": "comment-1",
      "text": "...",
      "link": {
        "included": true,
        "placeholder": "[link: a tool for turning still images into short clips -> https://product.example/tool]",
        "anchor_text": "a tool for turning still images into short clips",
        "anchor_type": "natural",
        "permission_basis": "link_policy=allowed_once"
      },
      "angle": "qualification",
      "source_hooks_used": ["hook-1"],
      "qa": {
        "source_grounded": true,
        "topical_fit": true,
        "language_match": true,
        "naturalness": true,
        "link_compliance": true,
        "claim_safety": true,
        "variation_ok": true,
        "needs_human_review": false,
        "notes": []
      }
    }
  ],
  "assumptions": [],
  "unresolved": []
}
```

## Status rules

- `ready_for_review`: required inputs exist and every draft passes the basic checks; human review is still expected before posting.
- `needs_input`: a required field, readable source context, link permission, target page, or platform limit is missing.
- `do_not_draft`: the supplied request requires deception, unsupported claims, hidden links, link-attribute manipulation, bulk template spinning, or another action outside this skill.

## Draft fields

- `text` is the copy only. Do not mix internal QA notes into the text.
- `angle` is one short label such as `observation`, `experience`, `qualification`, or `question`.
- `source_hooks_used` points to the source hook IDs used by the draft.
- `link.included=false` for a no-link control variant; omit `placeholder` and `anchor_text` in that case.
- Use `permission_basis` to show why a link was included, not to claim that the destination is accepted or followed.

## Human review notes

Flag these instead of hiding them:

- source text is too short, truncated, or ambiguous;
- target-page facts were not supplied;
- the requested anchor sounds forced or exact-match heavy;
- the forum's allowed formatting or length is unknown;
- a first-person experience was requested without evidence;
- the article's language and requested output language differ;
- multiple drafts are only superficial rewrites.
