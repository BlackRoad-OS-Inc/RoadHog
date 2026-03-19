#!/usr/bin/env python3

import sys
import tempfile
import importlib.util
from pathlib import Path

import unittest
from unittest.mock import patch

from parameterized import parameterized

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "bin" / "generate-ci-diagrams.py"
SPEC = importlib.util.spec_from_file_location("generate_ci_diagrams", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class TestGenerateCiDiagrams(unittest.TestCase):
    @parameterized.expand(
        [
            (
                "hyphenated_output",
                "needs.changes.outputs.ui-apps == 'true'",
                "ui-apps",
                {"changes": ["ui-apps"]},
            ),
            (
                "multiple_outputs_same_dep",
                "needs.changes.outputs.backend == 'true' || needs.changes.outputs.openapi_types == 'true'",
                "backend || openapi_types",
                {"changes": ["backend", "openapi_types"]},
            ),
            (
                "always_wrapper",
                "always() && needs.changes.outputs.frontend == 'true'",
                "frontend",
                {"changes": ["frontend"]},
            ),
            (
                "complex_condition_fallback",
                "always() && needs.changes.outputs.frontend == 'true' && github.event_name == 'pull_request'",
                "frontend && github.event_name == 'pul...",
                {"changes": ["frontend"]},
            ),
            (
                "no_needs_outputs_match",
                "github.event_name != 'merge_group'",
                "github.event_name != 'merge_group'",
                {},
            ),
        ]
    )
    def test_parse_condition(self, _name, raw, expected_summary, expected_edges):
        result = MODULE.parse_condition(raw)

        self.assertEqual(result.summary, expected_summary)
        self.assertEqual(result.edge_labels_by_dep, expected_edges)

    def test_generate_mermaid_labels_each_dependency_edge(self):
        workflow = MODULE.WorkflowInfo(
            name="Test workflow",
            filename="test.yml",
            triggers=["push"],
            jobs=[
                MODULE.JobInfo(id="changes", name="Changes", needs=[]),
                MODULE.JobInfo(id="build", name="Build", needs=[]),
                MODULE.JobInfo(
                    id="check-migrations",
                    name="Check migrations",
                    needs=["changes", "build"],
                    edge_labels_by_dep={"changes": ["backend", "openapi_types"]},
                ),
            ],
        )

        mermaid = MODULE.generate_mermaid(workflow)

        self.assertIn("changes -->|backend, openapi_types| check-migrations", mermaid)
        self.assertIn("build --> check-migrations", mermaid)

    def test_main_does_not_rebuild_index_for_partial_run(self):
        original_index = "original index"

        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            index_path = output_dir / "README.md"
            index_path.write_text(original_index, encoding="utf-8")

            with patch.object(MODULE, "OUTPUT_DIR", output_dir):
                exit_code = MODULE.main(["ci-storybook.yml"])

            self.assertEqual(exit_code, 0)
            self.assertEqual(index_path.read_text(encoding="utf-8"), original_index)
            self.assertTrue((output_dir / "ci-storybook.md").exists())

    def test_main_rebuilds_index_for_default_run(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)

            with patch.object(MODULE, "OUTPUT_DIR", output_dir):
                exit_code = MODULE.main([])

            self.assertEqual(exit_code, 0)
            readme = (output_dir / "README.md").read_text(encoding="utf-8")
            self.assertIn("# CI workflow diagrams", readme)
            self.assertIn("ci-backend.yml", readme)


if __name__ == "__main__":
    unittest.main()
