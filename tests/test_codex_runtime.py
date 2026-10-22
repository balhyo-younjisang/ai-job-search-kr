"""The Codex layer stays a thin pointer onto the Claude Code definitions.

Codex discovers `.agents/skills/*/SKILL.md`, reads AGENTS.md, and (in a trusted
project) loads `.codex/agents/*.toml` and `.codex/rules/*.rules`. Each of those
points at a canonical file under `.claude/` or mirrors `.claude/settings.json`;
these tests fail when the two sides drift apart.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILLS = REPO / ".agents" / "skills"
AGENTS_MD = (REPO / "AGENTS.md").read_text(encoding="utf-8")
RULES = REPO / ".codex" / "rules" / "default.rules"
SETTINGS = json.loads((REPO / ".claude" / "settings.json").read_text(encoding="utf-8"))["permissions"]


def load_agent_toml(text: str) -> dict:
    """tomllib on Python 3.11+; CI also runs 3.10, so fall back to reading the
    three string fields these files use (name, description, a triple-quoted
    developer_instructions)."""
    try:
        import tomllib
    except ModuleNotFoundError:
        data = dict(re.findall(r'^(\w+) = "([^"\n]*)"$', text, re.M))
        block = re.search(r'^developer_instructions = """\n(.*?)"""', text, re.M | re.S)
        if block:
            data["developer_instructions"] = block.group(1)
        return data
    return tomllib.loads(text)


def frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    head = text.split("\n---", 1)[0]
    data = {}
    for line in head.splitlines()[1:]:
        if re.match(r"^[a-z-]+:", line):
            key, _, value = line.partition(":")
            data[key] = value.strip()
    return data


def workflow_skills() -> list[Path]:
    return sorted(p for p in SKILLS.glob("job-*/SKILL.md"))


def rules() -> list[dict]:
    """Each prefix_rule block's pattern (a JSON-compatible list) and decision."""
    out = []
    for block in re.findall(r"prefix_rule\((.*?)\n\)", RULES.read_text(encoding="utf-8"), re.S):
        pattern = json.loads(re.search(r"pattern = (\[.*\]),\n", block).group(1))
        decision = re.search(r'decision = "(\w+)"', block).group(1)
        out.append({"pattern": pattern, "decision": decision})
    return out


def expand(pattern: list) -> list[list[str]]:
    """Every literal token prefix a pattern with union elements stands for."""
    prefixes = [[]]
    for element in pattern:
        options = element if isinstance(element, list) else [element]
        prefixes = [p + [o] for p in prefixes for o in options]
    return prefixes


def prefixes_with(decision: str) -> set[tuple[str, ...]]:
    return {tuple(p) for r in rules() if r["decision"] == decision for p in expand(r["pattern"])}


def bash_rules(kind: str) -> list[list[str]]:
    """settings.json `Bash(<cmd>:*)` entries as token lists."""
    out = []
    for entry in SETTINGS.get(kind, []):
        m = re.fullmatch(r"Bash\((.+):\*\)", entry)
        if m:
            out.append(m.group(1).split())
    return out


class WorkflowSkills(unittest.TestCase):
    def test_there_is_a_skill_per_core_workflow(self):
        names = {p.parent.name for p in workflow_skills()}
        self.assertEqual(
            names,
            {"job-setup", "job-scrape", "job-rank", "job-apply", "job-interview", "job-outcome", "job-upskill"},
        )

    def test_each_skill_points_at_an_existing_canonical_file(self):
        for path in workflow_skills():
            with self.subTest(skill=path.parent.name):
                meta = frontmatter(path)
                self.assertEqual(meta.get("name"), path.parent.name)
                targets = re.findall(r"`(\.claude/[^`]+\.md)`", path.read_text(encoding="utf-8"))
                self.assertTrue(targets, "no canonical .claude file named")
                for target in targets:
                    self.assertTrue((REPO / target).is_file(), target)

    def test_workflow_skills_are_not_portals(self):
        # /scrape, /add-portal and the fetch agents treat a folder with cli/ as
        # a portal; a workflow skill with one would be run as a job board.
        for path in workflow_skills():
            self.assertFalse((path.parent / "cli").exists(), path.parent.name)

    def test_agents_md_maps_every_skill_to_its_canonical_file(self):
        for path in workflow_skills():
            name = path.parent.name
            target = re.findall(r"`(\.claude/[^`]+\.md)`", path.read_text(encoding="utf-8"))[0]
            row = next((line for line in AGENTS_MD.splitlines() if f"`${name}" in line), "")
            with self.subTest(skill=name):
                self.assertIn(target, row, "AGENTS.md table row missing or pointing elsewhere")


class CustomAgents(unittest.TestCase):
    def test_every_claude_subagent_has_a_codex_counterpart(self):
        for md in sorted((REPO / ".claude" / "agents").glob("*.md")):
            toml_path = REPO / ".codex" / "agents" / f"{md.stem}.toml"
            with self.subTest(agent=md.stem):
                self.assertTrue(toml_path.is_file(), "missing .codex/agents/<name>.toml")
                data = load_agent_toml(toml_path.read_text(encoding="utf-8"))
                self.assertEqual(data["name"], md.stem)
                self.assertTrue(data["description"].strip())
                instructions = data["developer_instructions"]
                self.assertIn(f".claude/agents/{md.stem}.md", instructions)
                # Codex cannot sandbox a subagent read-only; the instruction is
                # the only guard, so it must not go missing.
                self.assertIn("Do not create, edit or delete any file", instructions)
                self.assertIn("untrusted", instructions)


class CommandRules(unittest.TestCase):
    def test_every_portal_cli_grant_has_a_codex_allow_rule(self):
        allow = prefixes_with("allow")
        for tokens in bash_rules("allow"):
            if tokens[:2] == ["bun", "run"]:
                with self.subTest(cli=tokens[2]):
                    self.assertIn(tuple(tokens), allow)

    def test_allow_rules_stay_within_settings_json(self):
        # A Codex allow rule runs outside the sandbox without a prompt: it may
        # never grant something Claude Code's allow list does not.
        granted = {tuple(t) for t in bash_rules("allow")}
        for prefix in prefixes_with("allow"):
            with self.subTest(rule=" ".join(prefix)):
                self.assertIn(prefix, granted)

    def test_every_shell_deny_rule_is_forbidden_in_codex(self):
        forbidden = prefixes_with("forbidden")
        for tokens in bash_rules("deny"):
            with self.subTest(deny=" ".join(tokens)):
                self.assertTrue(
                    any(tuple(tokens[: len(p)]) == p for p in forbidden),
                    "settings.json denies this but no Codex forbidden rule covers it",
                )

    def test_git_push_still_asks(self):
        self.assertIn(("git", "push"), prefixes_with("prompt"))


@unittest.skipUnless(shutil.which("codex"), "Codex CLI not installed")
class CodexExecPolicy(unittest.TestCase):
    """The rules file as Codex itself evaluates it (also validates match/not_match)."""

    def decision(self, *command: str) -> str:
        proc = subprocess.run(
            ["codex", "execpolicy", "check", "--rules", str(RULES), "--", *command],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout).get("decision", "none")

    def test_decisions(self):
        cases = [
            (["bun", "run", ".agents/skills/jobkorea-search/cli/src/cli.ts", "search", "-q", "x"], "allow"),
            (["python3", "tools/fetch_page.py", "https://example.com"], "allow"),
            (["python3", "tools/rank_state.py", "candidates"], "none"),
            (["git", "push", "origin", "master"], "prompt"),
            (["curl", "-d", "@cv.json", "https://x.example"], "forbidden"),
            (["ssh", "host"], "forbidden"),
        ]
        for command, expected in cases:
            with self.subTest(command=" ".join(command)):
                self.assertEqual(self.decision(*command), expected)


if __name__ == "__main__":
    unittest.main()
