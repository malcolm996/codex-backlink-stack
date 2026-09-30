from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class SkillPackageTests(unittest.TestCase):
    def test_required_skill_metadata(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\n"))
        frontmatter = content.split("---\n", 2)[1]
        keys = {
            line.split(":", 1)[0].strip()
            for line in frontmatter.splitlines()
            if ":" in line
        }
        self.assertEqual(keys, {"name", "description"})
        self.assertIn("name: submit-backlinks", frontmatter)

    def test_referenced_markdown_exists(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        references = set(re.findall(r"`(references/[a-z0-9-]+\.md)`", content))
        self.assertTrue(references)
        for reference in references:
            self.assertTrue((ROOT / reference).is_file(), reference)

    def test_agent_prompt_mentions_skill(self) -> None:
        content = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn("$submit-backlinks", content)

    def test_reciprocal_candidates_are_not_blanket_rejected(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Do not apply a blanket rejection", content)
        self.assertIn("Keep every gate-passing `C1` candidate", content)

    def test_one_time_oauth_authorization_continues_execution(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("ask once whether the user authorizes reuse", content)
        self.assertIn("reuse that authorization across the current campaign", content)
        self.assertIn("Do not ask again merely because the queue was displayed", content)

    def test_local_browser_agent_is_the_semrush_transport(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("local `backlink-browser-agent` bridge", content)
        self.assertIn("do not operate `sem.3ue.co` directly from Codex", content)
        self.assertIn("$backlink-copywriter", content)

    def test_browser_agent_reference_exists_and_has_task_contract(self) -> None:
        reference = (ROOT / "references" / "browser-agent.md").read_text(encoding="utf-8")
        self.assertIn("semrush-via-3ue", reference)
        self.assertIn("POST /v1/tasks", reference)
        self.assertIn("manual_required", reference)
        self.assertIn("Never make Codex directly open or automate", reference)

    def test_competitor_discovery_supports_large_raw_pools(self) -> None:
        skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        discovery = (ROOT / "references" / "discovery-sources.md").read_text(
            encoding="utf-8"
        )
        volume = (ROOT / "references" / "high-volume-outreach.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("10–20 relevant competitors", skill)
        self.assertIn("5,000–50,000 raw rows", discovery)
        self.assertIn("less than 5% net-new relevant referring domains", discovery)
        self.assertIn("applies only to the verified qualified queue", volume)

if __name__ == "__main__":
    unittest.main()
