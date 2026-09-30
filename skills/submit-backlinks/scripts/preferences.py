#!/usr/bin/env python3
"""Store non-sensitive provider and OAuth reuse preferences."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


SELECTION_SOURCES = {
    "explicit",
    "local_browser_agent",
    "successful_bridge_result",
    "active_authenticated_tab",
    "other_authenticated_tab",
    "successful_export",
    "remembered",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def default_config_path() -> Path:
    explicit = os.environ.get("SUBMIT_BACKLINKS_CONFIG", "").strip()
    if explicit:
        return Path(explicit).expanduser()

    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg).expanduser() / "submit-backlinks" / "preferences.json"

    if sys.platform == "darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "submit-backlinks"
            / "preferences.json"
        )

    appdata = os.environ.get("APPDATA", "").strip()
    if appdata:
        return Path(appdata).expanduser() / "submit-backlinks" / "preferences.json"

    return Path.home() / ".config" / "submit-backlinks" / "preferences.json"


def load_preferences(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("preference file must contain a JSON object")
    return value


def normalize_provider(value: str) -> str:
    provider = value.strip().lower().replace(" ", "-")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", provider):
        raise ValueError("provider must use letters, digits, or hyphens")
    return provider


def save_preferences(path: Path, preferences: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(preferences, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def update_preferences(
    current: dict[str, Any],
    provider: str | None,
    selection_source: str,
    google_oauth_reuse: bool | None,
) -> dict[str, Any]:
    preferences = dict(current)
    preferences["version"] = 1

    if provider:
        preferences["preferred_seo_provider"] = normalize_provider(provider)
        preferences["provider_selection_source"] = selection_source
        preferences["provider_last_success_at"] = utc_now()

    if google_oauth_reuse is not None:
        preferences["google_oauth_reuse"] = google_oauth_reuse

    preferences["updated_at"] = utc_now()
    return preferences


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Store non-sensitive SEO provider and Google OAuth reuse preferences."
    )
    parser.add_argument("--config", type=Path)
    parser.add_argument("--show", action="store_true")
    parser.add_argument("--remember-provider")
    parser.add_argument(
        "--selection-source",
        choices=sorted(SELECTION_SOURCES),
        default="local_browser_agent",
    )
    oauth = parser.add_mutually_exclusive_group()
    oauth.add_argument("--remember-google-oauth", action="store_true")
    oauth.add_argument("--disable-google-oauth-reuse", action="store_true")
    parser.add_argument("--clear", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    path = args.config.expanduser() if args.config else default_config_path()
    try:
        mutating = bool(
            args.remember_provider
            or args.remember_google_oauth
            or args.disable_google_oauth_reuse
        )
        if args.clear and mutating:
            raise ValueError("--clear cannot be combined with remember options")

        if args.clear:
            if path.exists():
                path.unlink()
            print(json.dumps({"cleared": True, "config": str(path)}, sort_keys=True))
            return 0

        current = load_preferences(path)
        if mutating:
            oauth_value: bool | None = None
            if args.remember_google_oauth:
                oauth_value = True
            elif args.disable_google_oauth_reuse:
                oauth_value = False
            current = update_preferences(
                current,
                args.remember_provider,
                args.selection_source,
                oauth_value,
            )
            save_preferences(path, current)

        if args.show or mutating or not current:
            print(
                json.dumps(
                    {"config": str(path), "preferences": current},
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
