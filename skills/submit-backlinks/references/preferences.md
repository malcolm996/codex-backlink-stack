# Remembered Preferences

Remember successful choices to reduce repeated setup. Store preferences only; never store authentication material.

## SEO source selection

Choose in this order:

1. an existing local campaign artifact or user-provided export with usable provenance;
2. the local `backlink-browser-agent` bridge for `semrush-via-3ue` when fresh Semrush data is required and the user has configured the extension;
3. a remembered provider only through its supported local transport, after verifying a fresh result;
4. public discovery sources.

The browser extension owns the authenticated browser session. Codex does not inspect active tabs, read browser storage, or directly open `sem.3ue.co`.

Recognize `semrush-via-3ue` as the configured local transport for the current Semrush integration. Other providers may be used only through a separately documented connector or a user-provided export; do not require several logins merely to compare availability.

The bridge result, not a page being open, is the evidence that a provider was usable. Preserve only provider name, task/result metadata, and normalized records.

## Remember after success

Remember a provider only after it successfully returns useful data or an export. A page merely being open is insufficient.

```bash
python3 scripts/preferences.py \
  --remember-provider semrush-via-3ue \
  --selection-source successful_bridge_result
```

If the user authorizes persistent Google OAuth reuse:

```bash
python3 scripts/preferences.py --remember-google-oauth
```

Read the current preference:

```bash
python3 scripts/preferences.py --show
```

Clear remembered preferences:

```bash
python3 scripts/preferences.py --clear
```

The default file follows `SUBMIT_BACKLINKS_CONFIG`, then `XDG_CONFIG_HOME`, then the platform user-config directory. Use `--config PATH` for an explicit location.

## Stored fields

- schema version
- preferred SEO provider or local transport
- provider/transport selection source
- provider success timestamp
- Google OAuth reuse boolean
- update timestamp

Do not treat a remembered provider as proof that the browser agent is running or that a current session works. Verify bridge health and obtain a fresh task result on every run.
