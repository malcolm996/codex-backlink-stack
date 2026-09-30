from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "prepare_pool.py"
SPEC = importlib.util.spec_from_file_location("prepare_pool", SCRIPT)
assert SPEC and SPEC.loader
prepare_pool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_pool)


class PreparePoolTests(unittest.TestCase):
    def test_source_url_wins_for_seo_export(self) -> None:
        candidate = prepare_pool.normalize_candidate(
            {
                "Source URL": "https://referrer.example/article",
                "Target URL": "https://product.example/",
                "Source title": "Useful resources",
            },
            "seo-export",
        )
        self.assertEqual(
            candidate["opportunity_url"],
            "https://referrer.example/article",
        )
        self.assertEqual(candidate["destination_url"], "https://product.example")

    def test_domain_deduplication(self) -> None:
        rows = [
            {"URL": "https://example.com/one"},
            {"URL": "https://www.example.com/two"},
            {"URL": "https://other.example/page"},
        ]
        prepared, rejected, duplicates = prepare_pool.prepare(rows, "test", "domain")
        self.assertEqual(len(prepared), 2)
        self.assertEqual(rejected, [])
        self.assertEqual(duplicates, 1)

    def test_plain_text_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.txt"
            path.write_text("# comment\nexample.com/list\n", encoding="utf-8")
            rows = prepare_pool.read_input(path)
            prepared, rejected, duplicates = prepare_pool.prepare(rows, "text", "url")
            self.assertEqual(prepared[0]["opportunity_url"], "https://example.com/list")
            self.assertEqual(rejected, [])
            self.assertEqual(duplicates, 0)

    def test_invalid_url_is_rejected(self) -> None:
        prepared, rejected, duplicates = prepare_pool.prepare(
            [{"URL": "not a valid host"}],
            "test",
            "url",
        )
        self.assertEqual(prepared, [])
        self.assertEqual(len(rejected), 1)
        self.assertEqual(duplicates, 0)


if __name__ == "__main__":
    unittest.main()
