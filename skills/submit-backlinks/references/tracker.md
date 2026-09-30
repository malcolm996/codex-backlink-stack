# Tracker Configuration

The recorder performs no external write unless an output option is supplied.

## Stdout

With no tracker option, normalized records are printed as JSON:

```bash
python3 scripts/record_backlink.py \
  --site-name "Example Product" \
  --site-url "https://example.com" \
  --platform "Example Directory" \
  --status "pending_review"
```

## Local JSONL

Use `--output-jsonl PATH`. The recorder generates a stable `attempt_id` and rejects duplicates already present in that file unless `--allow-duplicate` is supplied.

For batch input, pass `--input-jsonl PATH`. Each input object must contain `site_name`, `site_url`, `platform`, and `status`.

## Optional Lark Base

Copy `assets/lark-config.example.json` to a local file excluded from version control, then adapt its field mapping to the destination table.

Set the resource identifiers in the environment:

```bash
export BACKLINK_LARK_BASE_TOKEN="..."
export BACKLINK_LARK_TABLE_ID="..."
```

Then run:

```bash
python3 scripts/record_backlink.py \
  --input-jsonl campaign-results.jsonl \
  --lark-config tracker.local.json
```

Use `--update-record-id RECORD_ID` with exactly one input record to update an existing row.

The adapter requires `lark-cli` and an already authorized identity. It never stores login credentials.

## Feishu published-record spreadsheet

Published attempts use a separate spreadsheet for each Web product. The spreadsheet title is the normalized product URL, such as `https://example.com/`; do not reuse the candidate or qualification spreadsheet. Use the worksheet `外链发布记录` with these columns:

| 字段 | 含义 |
| --- | --- |
| 来源平台 | 提交平台或站点类型 |
| 来源URL | 候选来源页面；也是幂等更新键 |
| 文章URL | 实际文章、帖子或公开页面 URL |
| 目标URL | 产品中被推广的页面 |
| 锚文本 | 提交时使用的文字或无链接说明 |
| 提交时间 | 执行提交的时间 |
| 提交状态 | `send_clicked`、`pending_review`、`scheduled`、`published`、`rejected`、`blocked` 或 `unknown` |
| 审核/公开页面URL | 审核回执或首次公开页面 |
| 实际rel属性 | `dofollow`、`nofollow`、`sponsored` 或 `unknown` |
| 回访时间 | 后续检查时间 |
| 回访是否发布成功 | 新行默认 `待回访`，证据充分后填 `是` 或 `否` |
| 回访证据URL | 回访时可公开访问的证据页面 |
| 备注 | 阻塞、审核、修改等补充信息 |

通过本地 `backlink-browser-agent` 调用 `POST /v1/feishu/sync-published` 写入或更新。使用 `来源URL` 去重；回访更新不得新建第二行，也不得把候选发现记录直接标为已发布。
