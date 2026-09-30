#!/usr/bin/env python3
"""Create a guided backlink campaign workspace from bundled templates."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from urllib.parse import urlsplit


ASSETS = Path(__file__).parents[1] / "assets"


def create_campaign(
    directory: Path,
    site_name: str,
    site_url: str,
    target_count: int,
    force: bool,
) -> list[Path]:
    targets = [
        directory / "campaign-brief.json",
        directory / "candidate-pool.csv",
        directory / "lark-config.local.example.json",
    ]
    existing = [path for path in targets if path.exists()]
    if existing and not force:
        names = ", ".join(path.name for path in existing)
        raise ValueError(f"campaign files already exist: {names}")

    directory.mkdir(parents=True, exist_ok=True)
    brief = json.loads((ASSETS / "campaign-brief.example.json").read_text(encoding="utf-8"))
    brief.update(
        {
            "site_name": site_name,
            "site_url": site_url,
            "page_name": f"{site_name} homepage",
            "page_url": site_url,
            "target_count": target_count,
        }
    )
    targets[0].write_text(
        json.dumps(brief, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    shutil.copyfile(ASSETS / "candidate-pool.example.csv", targets[1])
    shutil.copyfile(ASSETS / "lark-config.example.json", targets[2])
    return targets


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create campaign brief, candidate-pool, and optional tracker templates."
    )
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--site-name", required=True)
    parser.add_argument("--site-url", required=True)
    parser.add_argument("--target-count", type=int, default=10)
    parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.target_count < 1:
            raise ValueError("--target-count must be at least 1")
        if not args.site_name.strip():
            raise ValueError("--site-name cannot be empty")
        site_parts = urlsplit(args.site_url.strip())
        if site_parts.scheme not in {"http", "https"} or not site_parts.hostname:
            raise ValueError("--site-url must be an absolute HTTP or HTTPS URL")
        paths = create_campaign(
            args.directory,
            args.site_name.strip(),
            args.site_url.strip(),
            args.target_count,
            args.force,
        )
        print(
            json.dumps(
                {"created": [str(path) for path in paths]},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
