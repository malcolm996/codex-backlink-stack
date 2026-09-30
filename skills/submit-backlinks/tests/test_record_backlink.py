from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "record_backlink.py"
SPEC = importlib.util.spec_from_file_location("record_backlink", SCRIPT)
assert SPEC and SPEC.loader
record_backlink = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(record_backlink)


class RecordBacklinkTests(unittest.TestCase):
    def sample(self) -> dict[str, object]:
        return {
            "site_name": "Example",
            "site_url": "https://www.example.com/",
            "submitted_url": "https://example.com/",
            "platform": "Directory",
            "platform_url": "https://DIRECTORY.example/submit/#form",
            "classification": "A",
            "status": "pending_review",
            "evidence_type": "receipt",
        }

    def test_normalize_url(self) -> None:
        self.assertEqual(
            record_backlink.normalize_url("https://www.Example.com/path/#part"),
            "https://example.com/path",
        )

    def test_attempt_id_is_stable(self) -> None:
        first = record_backlink.normalize_record(self.sample())
        second = record_backlink.normalize_record(self.sample())
        self.assertEqual(first["attempt_id"], second["attempt_id"])

    def test_missing_required_field_fails(self) -> None:
        sample = self.sample()
        del sample["platform"]
        with self.assertRaisesRegex(ValueError, "missing required fields"):
            record_backlink.normalize_record(sample)

    def test_jsonl_rejects_duplicate(self) -> None:
        row = record_backlink.normalize_record(self.sample())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            self.assertEqual(record_backlink.write_jsonl([row], path, False), 1)
            with self.assertRaisesRegex(ValueError, "duplicate attempt_id"):
                record_backlink.write_jsonl([row], path, False)

    def test_jsonl_rejects_duplicate_inside_batch(self) -> None:
        row = record_backlink.normalize_record(self.sample())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            with self.assertRaisesRegex(ValueError, "duplicate attempt_id"):
                record_backlink.write_jsonl([row, row], path, False)
            self.assertFalse(path.exists())

    def test_batch_input_normalizes_records(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.jsonl"
            path.write_text(json.dumps(self.sample()) + "\n", encoding="utf-8")
            rows = record_backlink.read_jsonl(path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["site_url"], "https://example.com")


if __name__ == "__main__":
    unittest.main()
