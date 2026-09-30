from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "preferences.py"
SPEC = importlib.util.spec_from_file_location("preferences", SCRIPT)
assert SPEC and SPEC.loader
preferences = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preferences)


class PreferencesTests(unittest.TestCase):
    def test_remembers_provider_without_account_data(self) -> None:
        value = preferences.update_preferences(
            {},
            "Similarweb",
            "active_authenticated_tab",
            True,
        )
        self.assertEqual(value["preferred_seo_provider"], "similarweb")
        self.assertTrue(value["google_oauth_reuse"])
        self.assertNotIn("account", value)
        self.assertNotIn("cookie", value)
        self.assertNotIn("token", value)

    def test_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preferences.json"
            value = preferences.update_preferences(
                {},
                "Ahrefs",
                "successful_export",
                None,
            )
            preferences.save_preferences(path, value)
            loaded = preferences.load_preferences(path)
            self.assertEqual(loaded["preferred_seo_provider"], "ahrefs")
            self.assertEqual(loaded["provider_selection_source"], "successful_export")

    def test_invalid_provider_fails(self) -> None:
        with self.assertRaisesRegex(ValueError, "letters, digits, or hyphens"):
            preferences.normalize_provider("../provider")

    def test_accepts_local_bridge_selection_source(self) -> None:
        value = preferences.update_preferences(
            {},
            "semrush-via-3ue",
            "successful_bridge_result",
            None,
        )
        self.assertEqual(value["preferred_seo_provider"], "semrush-via-3ue")
        self.assertEqual(value["provider_selection_source"], "successful_bridge_result")


if __name__ == "__main__":
    unittest.main()
