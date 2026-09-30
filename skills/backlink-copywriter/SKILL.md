---
name: backlink-copywriter
description: Draft contextual, human-sounding backlink comments and forum replies from supplied article context and target-page briefs. Use for copy generation, anchor/placement variants, and pre-submission copy QA; do not use it to screen sites, submit forms, verify rel attributes, or track backlinks.
---

# Backlink Copywriter

## Purpose and boundary

Produce reviewable copy for a specific article, discussion, or forum thread. The copy must contribute to the conversation first and mention a target page only when the supplied placement rules allow it.

This skill owns:

- extracting a concrete hook from the source article or thread;
- drafting comments, forum replies, and optional no-link participation variants;
- preserving the requested language, audience, voice, target page, and approved anchor text;
- checking topical fit, factual grounding, repetition, promotional pressure, and link count;
- returning structured copy that another workflow can review or submit.

This skill does **not** own:

- candidate-site discovery, spam/authority decisions, or whether a site is worth using;
- form inspection, CAPTCHA/login handling, submission, account actions, or pacing;
- HTML/form tricks, `nofollow` or `ugc` bypasses, rel verification, or dofollow claims;
- backlink recording, Feishu writes, GSC measurement, or campaign-level quotas;
- inventing article facts from a URL, inventing product claims, or silently choosing a target page.

Treat `submit-backlinks` and the local backlink browser agent as upstream/downstream systems. Consume their supplied facts when present, but do not re-run their qualification or execution logic.

## Inputs

Before drafting, collect the minimum brief below. A missing required field produces `needs_input`; do not fill it with guesses.

### Required

- `placement_type`: `blog_comment`, `forum_reply`, or another explicitly named reply surface;
- `source_context`: source title plus readable body/excerpt or a user-supplied thread snapshot;
- `target_page_url`: the exact page to mention when a link is requested (required when `link_policy` is `optional` or `allowed_once`);
- `target_topic`: the target page's topic and the audience problem it solves when a linked draft is requested;
- `language`: language and regional variety for the copy;
- `link_policy`: `none`, `optional`, or `allowed_once` (never infer permission from the URL alone).

### Strongly preferred

- `target_keyword` and `anchor_text`/`anchor_options`; preserve user-supplied anchors exactly;
- `product_facts`: short, verifiable facts that may be stated without exaggeration;
- `source_url`, `source_language`, platform length limits, and whether Markdown/HTML is accepted;
- `voice`: account persona, first-person experience, expertise level, and banned claims;
- `variant_count` and whether a no-link control variant is wanted.

If only a source URL is supplied, request readable content or use an explicitly authorized page-reading workflow. Never draft from the URL slug, title alone, search snippet, or assumed page topic.

## Drafting workflow

1. **Resolve the brief.** Confirm the placement type, source language, target page, link permission, and exact output length. Keep article/source URL, target URL, and anchor text as separate fields.
2. **Extract source hooks.** Identify one concrete term, example, argument, number, limitation, or unresolved question from the supplied context. Quote only when the wording is present in the source; otherwise paraphrase and mark it as a paraphrase.
3. **Choose one contribution angle per draft.** Use an observation, a bounded experience, a useful qualification, or a genuine follow-up question. Do not merely praise the article or restate the target page.
4. **Place the link naturally.** Use at most one target link per draft. Put it after the contribution, never as the opening sentence. If link permission is `none`, return a useful no-link reply. If permission is `optional`, include both a no-link draft and a linked draft when requested.
5. **Write to the surface.**
   - `blog_comment`: normally 2–4 sentences and about 30–70 words unless the platform specifies otherwise.
   - `forum_reply`: normally 3–7 sentences and about 80–180 words unless the thread or platform specifies otherwise.
   - For other surfaces, follow the supplied limit and explain the chosen length in notes.
6. **Vary the idea, not just synonyms.** Multiple variants must use different source hooks or contribution angles. Do not produce a sentence template with swapped keywords, brand names, or URLs.
7. **Run the copy QA below.** Mark unresolved claims or missing permissions instead of silently repairing them with invented facts.

## Language and voice

- Match the source discussion's language unless the brief explicitly requests another language.
- Prefer concrete, modest wording over sales copy. A commenter may say what they tried, noticed, or still wonder about; they must not claim results, popularity, awards, or technical capabilities absent from `product_facts`.
- Keep brand mentions to what the sentence needs, normally zero or one. Do not repeat the brand in the display name, anchor, and call to action in the same short comment.
- Preserve the author's viewpoint. Do not impersonate the article author, a customer, or a named expert without supplied authorization.
- Avoid generic openings and calls to action such as `Great post`, `Nice article`, `Thanks for sharing`, `Check out my site`, `Visit my website`, and their direct translations.
- Do not use fake personal experiences. If the brief provides no experience, write an observation or question instead.

## Anchor and link handling

- A target URL is not permission to add a link. Follow `link_policy` exactly.
- If `anchor_text` is supplied, use it verbatim and record its type if known (`exact`, `partial`, `brand`, `natural`, `url`).
- If no anchor is supplied, do not silently select an exact-match anchor. Propose up to three natural/partial options as suggestions, label them `proposed`, and leave final selection to the caller.
- Keep the target URL tied to the requested target page. Never default to the homepage or substitute a related page.
- Represent links as structured placeholders such as `[link: anchor text -> target_page_url]` unless the caller explicitly requests Markdown or HTML. Do not emit form markup or link-bypass syntax.
- Do not decide the campaign-level mix of linked and no-link replies. Generate the variants requested by the caller; link frequency and distribution belong to the external campaign or submission workflow.

## Copy QA

Every draft receives a compact QA result:

- `source_grounded`: cites one identifiable source hook;
- `topical_fit`: contribution answers or advances the discussion;
- `language_match`: language/register fit the source and brief;
- `naturalness`: reads like a participant, not an advertisement or template;
- `link_compliance`: respects link permission, one-link limit, anchor, and target URL;
- `claim_safety`: every product or performance claim is supported by supplied facts;
- `variation_ok`: differs meaningfully from sibling variants;
- `needs_human_review`: true for unresolved permissions, unsupported claims, awkward phrasing, or platform-specific limits.

Reject or rewrite drafts that open with a URL, contain two or more links, use a generic compliment as the main content, repeat the same template, mention the brand three or more times, or make unsupported guarantees. A no-link draft can still be `ready_for_review` and is often the correct output when link permission is unclear.

## Output

Return the contract in [references/output-contract.md](references/output-contract.md). At minimum, include:

- the resolved input summary and any assumptions;
- source hooks used, with a short evidence excerpt or location;
- one or more labeled drafts;
- anchor/link placeholders and their permission basis;
- per-draft QA flags and a final `ready_for_review`, `needs_input`, or `do_not_draft` status;
- unresolved questions for the caller.

Do not report a draft as a published backlink or imply that a link is dofollow. Submission and link verification belong to the downstream workflow.

## Optional integration fields

The browser agent may provide `sourceUrl`, `title`, and a `commentAnalysis` object with observed placement or existing-link patterns. These fields can inform formatting and whether a no-link control variant is useful, but they do not authorize a link and do not change the downstream site's qualification status. Ignore credentials, cookies, CAPTCHA state, and other execution data when drafting.
