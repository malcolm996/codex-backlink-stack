#!/usr/bin/env python3
"""Normalize backlink attempt records and write only to explicitly selected trackers."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


STATUSES = {
    "send_clicked",
    "send_unknown",
    "pending_review",
    "scheduled",
    "published",
    "rejected",
    "paywall_stopped",
    "blocked",
    "unknown",
}

EVIDENCE_TYPES = {
    "none",
    "send_click",
    "receipt",
    "review_id",
    "schedule",
    "public_url",
}

CLASSIFICATIONS = {"A", "B", "C1", "C2", "D", "unclassified"}
LINK_ATTRS = {"dofollow", "nofollow", "sponsored", "unknown"}
REQUIRED_FIELDS = ("site_name", "site_url", "platform", "status")


def normalize_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parts = urlsplit(text)
    if not parts.scheme or not parts.netloc:
        return text.rstrip("/")
    hostname = (parts.hostname or "").lower()
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


def stable_attempt_id(record: dict[str, Any]) -> str:
    material = "|".join(
        [
            normalize_url(record.get("site_url")),
            str(record.get("platform", "")).strip().lower(),
            normalize_url(record.get("platform_url")),
            normalize_url(record.get("submitted_url") or record.get("site_url")),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    record = dict(raw)
    missing = [field for field in REQUIRED_FIELDS if not str(record.get(field, "")).strip()]
    if missing:
        raise ValueError(f"missing required fields: {', '.join(missing)}")

    status = str(record["status"]).strip()
    if status not in STATUSES:
        raise ValueError(f"unsupported status: {status}")

    evidence_type = str(record.get("evidence_type") or "none").strip()
    if evidence_type not in EVIDENCE_TYPES:
        raise ValueError(f"unsupported evidence_type: {evidence_type}")

    classification = str(record.get("classification") or "unclassified").strip()
    if classification not in CLASSIFICATIONS:
        raise ValueError(f"unsupported classification: {classification}")

    link_attr = str(record.get("link_attr") or "unknown").strip()
    if link_attr not in LINK_ATTRS:
        raise ValueError(f"unsupported link_attr: {link_attr}")

    record["site_name"] = str(record["site_name"]).strip()
    record["site_url"] = normalize_url(record["site_url"])
    record["platform"] = str(record["platform"]).strip()
    record["platform_url"] = normalize_url(record.get("platform_url"))
    record["submitted_url"] = normalize_url(record.get("submitted_url") or record["site_url"])
    record["classification"] = classification
    record["status"] = status
    record["evidence_type"] = evidence_type
    record["evidence_url"] = normalize_url(record.get("evidence_url"))
    record["requires_reciprocal"] = bool(record.get("requires_reciprocal", False))
    record["reciprocal_added"] = bool(record.get("reciprocal_added", False))
    record["link_attr"] = link_attr
    record["recorded_at"] = str(record.get("recorded_at") or utc_now())
    record["notes"] = str(record.get("notes") or "").strip()
    record["attempt_id"] = str(record.get("attempt_id") or stable_attempt_id(record))
    return record


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(raw, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            records.append(normalize_record(raw))
    return records


def existing_attempt_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    ids: set[str] = set()
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict) and value.get("attempt_id"):
                ids.add(str(value["attempt_id"]))
    return ids


def write_jsonl(records: Iterable[dict[str, Any]], path: Path, allow_duplicate: bool) -> int:
    rows = list(records)
    known = existing_attempt_ids(path)
    seen: set[str] = set()
    duplicates: list[str] = []
    for row in rows:
        attempt_id = row["attempt_id"]
        if attempt_id in known or attempt_id in seen:
            duplicates.append(attempt_id)
        seen.add(attempt_id)
    if duplicates and not allow_duplicate:
        unique = ", ".join(sorted(set(duplicates)))
        raise ValueError(f"duplicate attempt_id: {unique}")

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    return len(rows)


def load_lark_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    required = ("base_token_env", "table_id_env", "field_map")
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise ValueError(f"Lark config missing: {', '.join(missing)}")
    if not isinstance(config["field_map"], dict) or not config["field_map"]:
        raise ValueError("Lark field_map must be a non-empty object")
    return config


def lark_resource(config: dict[str, Any], key: str) -> str:
    env_name = str(config[key])
    value = os.environ.get(env_name, "").strip()
    if not value:
        raise ValueError(f"environment variable is not set: {env_name}")
    return value


def run_lark(args: list[str]) -> dict[str, Any]:
    try:
        process = subprocess.run(
            ["lark-cli", *args],
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("lark-cli is not installed or not on PATH") from exc
    if process.returncode != 0:
        message = (process.stderr or process.stdout).strip()
        raise RuntimeError(message or f"lark-cli exited with {process.returncode}")
    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("lark-cli returned non-JSON output") from exc


def mapped_fields(record: dict[str, Any], field_map: dict[str, str]) -> dict[str, Any]:
    return {
        external: record[internal]
        for internal, external in field_map.items()
        if internal in record
    }


def chunks(values: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def write_lark(
    records: list[dict[str, Any]],
    config: dict[str, Any],
    update_record_id: str | None,
) -> list[str]:
    base_token = lark_resource(config, "base_token_env")
    table_id = lark_resource(config, "table_id_env")
    identity = str(config.get("identity") or "user")
    field_map = config["field_map"]

    if update_record_id:
        if len(records) != 1:
            raise ValueError("--update-record-id requires exactly one record")
        result = run_lark(
            [
                "base",
                "+record-upsert",
                "--as",
                identity,
                "--base-token",
                base_token,
                "--table-id",
                table_id,
                "--record-id",
                update_record_id,
                "--json",
                json.dumps(mapped_fields(records[0], field_map), ensure_ascii=False),
            ]
        )
        return [str(result.get("data", {}).get("record_id") or update_record_id)]

    returned_ids: list[str] = []
    for group in chunks(records, 100):
        external_fields = [
            field_map[key]
            for key in field_map
            if any(key in record for record in group)
        ]
        rows = [
            [
                mapped_fields(record, field_map).get(field)
                for field in external_fields
            ]
            for record in group
        ]
        result = run_lark(
            [
                "base",
                "+record-batch-create",
                "--as",
                identity,
                "--base-token",
                base_token,
                "--table-id",
                table_id,
                "--json",
                json.dumps(
                    {"fields": external_fields, "rows": rows},
                    ensure_ascii=False,
                ),
            ]
        )
        returned_ids.extend(str(value) for value in result.get("data", {}).get("record_id_list", []))
    return returned_ids


def build_single_record(args: argparse.Namespace) -> dict[str, Any]:
    return normalize_record(
        {
            "attempt_id": args.attempt_id,
            "site_name": args.site_name,
            "site_url": args.site_url,
            "submitted_url": args.submitted_url,
            "platform": args.platform,
            "platform_url": args.platform_url,
            "classification": args.classification,
            "status": args.status,
            "evidence_type": args.evidence_type,
            "evidence_url": args.evidence_url,
            "requires_reciprocal": args.requires_reciprocal,
            "reciprocal_added": args.reciprocal_added,
            "link_attr": args.link_attr,
            "recorded_at": args.recorded_at,
            "notes": args.notes,
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize backlink attempt records and write only to selected trackers."
    )
    parser.add_argument("--input-jsonl", type=Path)
    parser.add_argument("--site-name")
    parser.add_argument("--site-url")
    parser.add_argument("--submitted-url")
    parser.add_argument("--platform")
    parser.add_argument("--platform-url")
    parser.add_argument("--classification", choices=sorted(CLASSIFICATIONS), default="unclassified")
    parser.add_argument("--status", choices=sorted(STATUSES))
    parser.add_argument("--evidence-type", choices=sorted(EVIDENCE_TYPES), default="none")
    parser.add_argument("--evidence-url")
    parser.add_argument("--requires-reciprocal", action="store_true")
    parser.add_argument("--reciprocal-added", action="store_true")
    parser.add_argument("--link-attr", choices=sorted(LINK_ATTRS), default="unknown")
    parser.add_argument("--recorded-at")
    parser.add_argument("--notes")
    parser.add_argument("--attempt-id")
    parser.add_argument("--output-jsonl", type=Path)
    parser.add_argument("--lark-config", type=Path)
    parser.add_argument("--update-record-id")
    parser.add_argument("--allow-duplicate", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.input_jsonl:
            records = read_jsonl(args.input_jsonl)
        else:
            records = [build_single_record(args)]

        if args.dry_run or (not args.output_jsonl and not args.lark_config):
            for record in records:
                print(json.dumps(record, ensure_ascii=False, sort_keys=True))
            return 0

        result: dict[str, Any] = {"records": len(records)}
        if args.output_jsonl:
            result["jsonl_written"] = write_jsonl(
                records,
                args.output_jsonl,
                args.allow_duplicate,
            )
        if args.lark_config:
            config = load_lark_config(args.lark_config)
            result["lark_record_ids"] = write_lark(
                records,
                config,
                args.update_record_id,
            )
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
