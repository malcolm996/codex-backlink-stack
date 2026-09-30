from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "init_campaign.py"
SPEC = importlib.util.spec_from_file_location("init_campaign", SCRIPT)
assert SPEC and SPEC.loader
init_campaign = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(init_campaign)


class InitCampaignTests(unittest.TestCase):
    def test_creates_guided_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            paths = init_campaign.create_campaign(
                root,
                "Example Product",
                "https://example.com",
                12,
                False,
            )
            self.assertEqual(len(paths), 3)
            brief = json.loads((root / "campaign-brief.json").read_text(encoding="utf-8"))
            self.assertEqual(brief["site_name"], "Example Product")
            self.assertEqual(brief["target_count"], 12)
            self.assertEqual(brief["execution_policy"], "ask_once_then_continue")
            self.assertEqual(brief["google_oauth_policy"], "ask_once")

    def test_refuses_to_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            init_campaign.create_campaign(
                root,
                "Example Product",
                "https://example.com",
                10,
                False,
            )
            with self.assertRaisesRegex(ValueError, "already exist"):
                init_campaign.create_campaign(
                    root,
                    "Example Product",
                    "https://example.com",
                    10,
                    False,
                )

    def test_cli_rejects_relative_site_url(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--directory",
                    str(Path(directory) / "campaign"),
                    "--site-name",
                    "Example Product",
                    "--site-url",
                    "example.com",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(process.returncode, 2)
            self.assertIn("absolute HTTP or HTTPS URL", process.stderr)


if __name__ == "__main__":
    unittest.main()
