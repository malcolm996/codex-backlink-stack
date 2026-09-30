#!/usr/bin/env python3
"""Normalize and deduplicate backlink candidate pools without network access."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


URL_ALIASES = (
    "opportunity_url",
    "source_url",
    "referring_page_url",
    "referring_url",
    "backlink_url",
    "url",
    "page_url",
    "target_url",
)
PLATFORM_ALIASES = ("platform", "platform_name", "source_domain", "referring_domain", "domain", "name")
SUBMISSION_ALIASES = ("submission_url", "submit_url", "form_url")
ROUTE_ALIASES = ("route_type", "type", "opportunity_type")
CONTACT_ALIASES = ("contact", "contact_email", "email")
COMPETITOR_ALIASES = ("competitor_source", "competitor", "competitor_domain")
AUTHORITY_METRIC_ALIASES = ("authority_metric", "metric", "score_type")
AUTHORITY_VALUE_ALIASES = (
    "authority_value",
    "authority_score",
    "domain_rating",
    "domain_authority",
    "page_as",
    "domain_as",
    "ascore",
    "page_ascore",
    "as",
    "dr",
)
OBSERVED_ALIASES = ("observed_at", "checked_at", "discovered_at", "date")
NOTES_ALIASES = ("notes", "note", "comments")
SOURCE_ALIASES = ("source", "source_name", "provenance")
DESTINATION_ALIASES = ("destination_url", "submitted_url")


def normalized_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def normalized_row(raw: dict[str, Any]) -> dict[str, Any]:
    return {normalized_key(str(key)): value for key, value in raw.items()}


def first_value(row: dict[str, Any], aliases: Iterable[str]) -> str:
    for alias in aliases:
        value = row.get(normalized_key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def normalize_url(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("missing opportunity URL")
    if "://" not in text:
        text = f"https://{text}"
    parts = urlsplit(text)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError(f"invalid opportunity URL: {value}")
    hostname = parts.hostname.lower()
    if any(character.isspace() for character in hostname):
        raise ValueError(f"invalid opportunity URL: {value}")
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = parts.port
    if port and not (
        (parts.scheme.lower() == "http" and port == 80)
        or (parts.scheme.lower() == "https" and port == 443)
    ):
        hostname = f"{hostname}:{port}"
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), hostname, path, parts.query, ""))


def domain_for(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def candidate_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")
        return [dict(row) for row in reader]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            rows.append(value)
    return rows


def read_text(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            value = line.strip()
            if value and not value.startswith("#"):
                rows.append({"opportunity_url": value})
    return rows


def read_input(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return read_csv(path)
    if suffix in {".jsonl", ".ndjson"}:
        return read_jsonl(path)
    return read_text(path)


def normalize_candidate(raw: dict[str, Any], fallback_source: str) -> dict[str, Any]:
    row = normalized_row(raw)
    opportunity_url = normalize_url(first_value(row, URL_ALIASES))
    hostname = domain_for(opportunity_url)
    platform = first_value(row, PLATFORM_ALIASES) or hostname
    source = first_value(row, SOURCE_ALIASES) or fallback_source

    source_url = first_value(row, ("source_url", "source_page"))
    target_url = first_value(row, ("target_url",))
    destination_url = first_value(row, DESTINATION_ALIASES)
    if source_url and target_url and normalize_url(source_url) == opportunity_url:
        destination_url = destination_url or target_url

    return {
        "candidate_id": candidate_id(opportunity_url),
        "platform": platform,
        "opportunity_url": opportunity_url,
        "source": source,
        "source_url": normalize_url(source_url) if source_url else "",
        "destination_url": normalize_url(destination_url) if destination_url else "",
        "submission_url": normalize_url(first_value(row, SUBMISSION_ALIASES))
        if first_value(row, SUBMISSION_ALIASES)
        else "",
        "route_type": first_value(row, ROUTE_ALIASES),
        "contact": first_value(row, CONTACT_ALIASES).lower(),
        "competitor_source": first_value(row, COMPETITOR_ALIASES),
        "authority_metric": first_value(row, AUTHORITY_METRIC_ALIASES),
        "authority_value": first_value(row, AUTHORITY_VALUE_ALIASES),
        "observed_at": first_value(row, OBSERVED_ALIASES),
        "notes": first_value(row, NOTES_ALIASES),
        "stage": "raw",
        "qualification": "unverified",
    }


def prepare(
    rows: list[dict[str, Any]],
    source: str,
    dedupe_by: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    prepared: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    seen: set[str] = set()
    duplicate_count = 0

    for index, raw in enumerate(rows, start=1):
        try:
            candidate = normalize_candidate(raw, source)
        except ValueError as exc:
            rejected.append({"row": index, "reason": str(exc)})
            continue
        key = (
            domain_for(candidate["opportunity_url"])
            if dedupe_by == "domain"
            else candidate["opportunity_url"]
        )
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        prepared.append(candidate)
    return prepared, rejected, duplicate_count


def ensure_writable(path: Path, force: bool) -> None:
    if path.exists() and not force:
        raise ValueError(f"output exists; pass --force to replace it: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize CSV, JSONL, or text backlink pools without network access."
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-jsonl", type=Path, required=True)
    parser.add_argument("--rejected-jsonl", type=Path)
    parser.add_argument("--source", default="user-pool")
    parser.add_argument("--dedupe-by", choices=("domain", "url"), default="domain")
    parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.input.resolve() == args.output_jsonl.resolve():
            raise ValueError("input and output paths must differ")
        rows = read_input(args.input)
        prepared, rejected, duplicates = prepare(rows, args.source, args.dedupe_by)
        ensure_writable(args.output_jsonl, args.force)
        write_jsonl(args.output_jsonl, prepared)
        if args.rejected_jsonl:
            ensure_writable(args.rejected_jsonl, args.force)
            write_jsonl(args.rejected_jsonl, rejected)
        print(
            json.dumps(
                {
                    "input_rows": len(rows),
                    "written": len(prepared),
                    "duplicates": duplicates,
                    "rejected": len(rejected),
                    "dedupe_by": args.dedupe_by,
                    "output": str(args.output_jsonl),
                },
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
