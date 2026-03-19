#!/usr/bin/env python3
# ruff: noqa: T201 allow print statements
"""Generate Mermaid DAG diagrams for GitHub Actions workflows.

Usage:
    python bin/generate-ci-diagrams.py [workflow_file ...]

Without arguments, processes the default top-10 complex workflows.
Output goes to docs/internal/ci/.
"""

from __future__ import annotations

import re
import sys
import argparse
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"
OUTPUT_DIR = REPO_ROOT / "docs" / "internal" / "ci"

DEFAULT_WORKFLOWS = [
    "ci-backend.yml",
    "ci-e2e-playwright.yml",
    "ci-frontend.yml",
    "ci-storybook.yml",
    "ci-nodejs.yml",
    "ci-dagster.yml",
    "ci-rust.yml",
    "ci-proto.yml",
    "ci-mcp.yml",
    "ci-security.yaml",
]

# Mermaid shape delimiters per category
SHAPES: dict[str, tuple[str, str]] = {
    "gate": ("{{", "}}"),
    "plumbing": ("([", "])"),
    "test": ("[", "]"),
    "collation": ("[[", "]]"),
    "sideeffect": ("(", ")"),
}

# Mermaid classDef styles per category
STYLES: dict[str, str] = {
    "gate": "fill:#4a9eff,stroke:#2563eb,color:#fff",
    "plumbing": "fill:#a78bfa,stroke:#7c3aed,color:#fff",
    "test": "fill:#34d399,stroke:#059669,color:#fff",
    "collation": "fill:#fbbf24,stroke:#d97706,color:#000",
    "sideeffect": "fill:#f87171,stroke:#dc2626,color:#fff",
}

LEGEND_ROWS = [
    ("Hexagon", "Blue", "Gate / change detection"),
    ("Stadium", "Purple", "Plumbing / matrix builder"),
    ("Rectangle", "Green", "Test / core work"),
    ("Subroutine", "Yellow", "Collation / status gate"),
    ("Rounded rect", "Red", "Side effect / snapshots"),
]


@dataclass
class JobInfo:
    id: str
    name: str
    needs: list[str]
    condition: str
    condition_label: str
    matrix_keys: list[str]
    category: str
    uses_paths_filter: bool = False


@dataclass
class WorkflowInfo:
    name: str
    filename: str
    triggers: list[str]
    jobs: list[JobInfo] = field(default_factory=list)


def parse_triggers(raw: dict) -> list[str]:
    """Extract trigger event names from the workflow's on: block."""
    # PyYAML parses `on:` as boolean True
    triggers: list[str] = []
    if isinstance(raw, dict):
        triggers = sorted(raw.keys())
    elif isinstance(raw, list):
        triggers = sorted(raw)
    elif isinstance(raw, str):
        triggers = [raw]
    return [str(t) for t in triggers]


def uses_paths_filter(job_data: dict) -> bool:
    """Check if a job uses dorny/paths-filter."""
    for step in job_data.get("steps", []):
        uses = step.get("uses", "")
        if "dorny/paths-filter" in uses:
            return True
    return False


def classify_job(job_id: str, job_data: dict) -> str:
    """Classify a job into a category based on heuristics."""
    condition = str(job_data.get("if", ""))
    has_always = "always()" in condition

    # Collation: ends with _tests/_checks/_pass and uses always()
    if has_always and re.search(r"(_tests|_checks|_pass)$", job_id):
        return "collation"

    # Gate: uses paths-filter or is named 'changes'
    if job_id == "changes" or uses_paths_filter(job_data):
        return "gate"

    # Plumbing: specific jobs that detect/compute but don't produce side effects
    if job_id == "detect-snapshot-mode":
        return "plumbing"
    if re.match(r"(build_|get_|calculate|discover|turbo-discover)", job_id):
        return "plumbing"
    if "calculate-running-time" in job_id:
        return "plumbing"

    # Side effect: contains 'snapshot' or starts with 'handle-'
    if "snapshot" in job_id or job_id.startswith("handle-"):
        return "sideeffect"

    return "test"


def simplify_condition(raw: str) -> str:
    """Extract a short label from an if: condition for edge display."""
    if not raw:
        return ""

    # needs.X.outputs.Y == 'true' -> Y
    match = re.search(r"needs\.(\w[\w-]*)\.outputs\.(\w+)\s*==\s*'true'", raw)
    if match:
        return match.group(2)

    if raw.strip().startswith("always()"):
        return ""

    # Truncate complex conditions
    cleaned = raw.strip().replace("\n", " ")
    if len(cleaned) > 40:
        return cleaned[:37] + "..."
    return cleaned


def extract_matrix_keys(strategy: dict | None) -> list[str]:
    """Extract matrix dimension names from a strategy block."""
    if not strategy:
        return []
    matrix = strategy.get("matrix")
    if not matrix:
        return []
    if isinstance(matrix, str):
        return ["dynamic"]

    keys: list[str] = []
    for key, val in matrix.items():
        if key in ("include", "exclude"):
            if key == "include" and isinstance(val, list):
                keys.append(f"include({len(val)})")
            elif key == "include" and isinstance(val, str) and "${{" in val:
                keys.append("dynamic")
            continue
        if isinstance(val, str) and "${{" in val:
            keys.append("dynamic")
        elif isinstance(val, list):
            keys.append(key)
        else:
            keys.append(key)
    return keys


def parse_workflow(path: Path) -> WorkflowInfo:
    """Parse a workflow YAML file into WorkflowInfo."""
    with open(path) as f:
        data = yaml.safe_load(f)

    name = data.get("name", path.stem)

    # Handle PyYAML's on: -> True quirk
    triggers_raw = data.get(True, data.get("on", {}))
    triggers = parse_triggers(triggers_raw)

    wf = WorkflowInfo(name=name, filename=path.name, triggers=triggers)

    jobs = data.get("jobs", {})
    for job_id, job_data in jobs.items():
        if not isinstance(job_data, dict):
            continue

        job_name = job_data.get("name", job_id)
        # Clean template expressions from names for readability
        job_name = re.sub(r"\$\{\{[^}]*\}\}", "...", job_name).strip()

        needs_raw = job_data.get("needs", [])
        if isinstance(needs_raw, str):
            needs_raw = [needs_raw]

        condition = str(job_data.get("if", ""))
        condition_label = simplify_condition(condition)
        matrix_keys = extract_matrix_keys(job_data.get("strategy"))
        category = classify_job(job_id, job_data)
        has_paths_filter = uses_paths_filter(job_data)

        wf.jobs.append(
            JobInfo(
                id=job_id,
                name=job_name,
                needs=needs_raw,
                condition=condition,
                condition_label=condition_label,
                matrix_keys=matrix_keys,
                category=category,
                uses_paths_filter=has_paths_filter,
            )
        )

    # Topological sort for deterministic output
    wf.jobs = _topo_sort(wf.jobs)
    return wf


def _topo_sort(jobs: list[JobInfo]) -> list[JobInfo]:
    """Sort jobs topologically by needs dependencies."""
    by_id = {j.id: j for j in jobs}
    in_degree: dict[str, int] = {j.id: 0 for j in jobs}
    for j in jobs:
        for dep in j.needs:
            if dep in by_id:
                in_degree[j.id] += 1

    queue: deque[str] = deque(sorted(jid for jid, deg in in_degree.items() if deg == 0))
    result: list[JobInfo] = []
    while queue:
        jid = queue.popleft()
        result.append(by_id[jid])
        for j in jobs:
            if jid in j.needs:
                in_degree[j.id] -= 1
                if in_degree[j.id] == 0:
                    # Insert sorted to maintain determinism
                    _sorted_insert(queue, j.id)
    # Append any remaining (cycles, shouldn't happen)
    seen = {j.id for j in result}
    for j in jobs:
        if j.id not in seen:
            result.append(j)
    return result


def _sorted_insert(queue: deque[str], item: str) -> None:
    """Insert item into a sorted deque maintaining order."""
    items = list(queue)
    items.append(item)
    items.sort()
    queue.clear()
    queue.extend(items)


def sanitize_mermaid_id(job_id: str) -> str:
    """Sanitize a job ID for use as a Mermaid node ID."""
    return re.sub(r"[^a-zA-Z0-9_-]", "_", job_id)


def escape_mermaid_label(text: str) -> str:
    """Escape text for use in Mermaid node labels."""
    return text.replace('"', "'").replace("<", "&lt;").replace(">", "&gt;")


def generate_mermaid(wf: WorkflowInfo) -> str:
    """Generate a Mermaid graph TD string from a WorkflowInfo."""
    lines = ["graph TD"]

    # Style classes
    for category, style in STYLES.items():
        lines.append(f"    classDef {category} {style}")
    lines.append("")

    # Node definitions
    for job in wf.jobs:
        mid = sanitize_mermaid_id(job.id)
        open_s, close_s = SHAPES[job.category]
        label = escape_mermaid_label(job.name)
        if job.matrix_keys:
            matrix_str = " x ".join(job.matrix_keys)
            label += f"<br/><i>matrix: {matrix_str}</i>"
        lines.append(f'    {mid}{open_s}"{label}"{close_s}')

    lines.append("")

    # Edges
    for job in wf.jobs:
        mid = sanitize_mermaid_id(job.id)
        for dep in sorted(job.needs):
            dep_mid = sanitize_mermaid_id(dep)
            # Apply condition label only to the edge from the referenced parent
            edge_label = ""
            if job.condition_label and f"needs.{dep}.outputs" in job.condition:
                edge_label = job.condition_label
            if edge_label:
                lines.append(f"    {dep_mid} -->|{edge_label}| {mid}")
            else:
                lines.append(f"    {dep_mid} --> {mid}")

    lines.append("")

    # Apply classes
    for job in wf.jobs:
        mid = sanitize_mermaid_id(job.id)
        lines.append(f"    class {mid} {job.category}")

    return "\n".join(lines)


def generate_markdown(wf: WorkflowInfo, mermaid: str) -> str:
    """Generate the full markdown document for a workflow."""
    triggers_str = ", ".join(f"`{t}`" for t in wf.triggers)

    # Job details table
    job_rows: list[str] = []
    for job in wf.jobs:
        deps = ", ".join(job.needs) if job.needs else "-"
        cond = job.condition_label.replace("|", "\\|") if job.condition_label else "-"
        matrix = " x ".join(job.matrix_keys) if job.matrix_keys else "-"
        job_rows.append(f"| `{job.id}` | {deps} | {cond} | {matrix} |")

    # Legend table
    legend_rows = "\n".join(f"| {shape} | {color} | {meaning} |" for shape, color, meaning in LEGEND_ROWS)

    return f"""\
<!-- This file is auto-generated by bin/generate-ci-diagrams.py. Do not edit manually. -->

# {wf.name} (`{wf.filename}`)

**Triggers**: {triggers_str}

```mermaid
{mermaid}
```

## Legend

| Shape | Color | Meaning |
|---|---|---|
{legend_rows}

Edge labels show the change-detection output that gates the job.

## Job details

| Job | Depends on | Condition | Matrix |
|---|---|---|---|
{chr(10).join(job_rows)}
"""


def generate_index(workflows: list[WorkflowInfo]) -> str:
    """Generate the README.md index page."""
    rows: list[str] = []
    for wf in sorted(workflows, key=lambda w: w.filename):
        stem = Path(wf.filename).stem
        triggers = ", ".join(wf.triggers)
        rows.append(f"| [{wf.name}]({stem}.md) | `{wf.filename}` | {len(wf.jobs)} | {triggers} |")

    return f"""\
<!-- This file is auto-generated by bin/generate-ci-diagrams.py. Do not edit manually. -->

# CI workflow diagrams

Visual DAG diagrams for PostHog's most complex CI workflows.
Generated by `bin/generate-ci-diagrams.py`.

| Workflow | File | Jobs | Triggers |
|---|---|---|---|
{chr(10).join(rows)}

## Regenerating

```bash
python bin/generate-ci-diagrams.py
```

To regenerate a single workflow:

```bash
python bin/generate-ci-diagrams.py ci-backend.yml
```
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Mermaid CI workflow diagrams")
    parser.add_argument(
        "workflows",
        nargs="*",
        default=DEFAULT_WORKFLOWS,
        help="Workflow filenames to process (default: top 10 complex workflows)",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    workflows: list[WorkflowInfo] = []
    for filename in args.workflows:
        path = WORKFLOWS_DIR / filename
        if not path.exists():
            print(f"Warning: {path} not found, skipping", file=sys.stderr)
            continue
        print(f"Processing {filename}...")
        wf = parse_workflow(path)
        mermaid = generate_mermaid(wf)
        md = generate_markdown(wf, mermaid)

        out_path = OUTPUT_DIR / f"{path.stem}.md"
        out_path.write_text(md)
        print(f"  -> {out_path.relative_to(REPO_ROOT)} ({len(wf.jobs)} jobs)")
        workflows.append(wf)

    if workflows:
        index_path = OUTPUT_DIR / "README.md"
        index_path.write_text(generate_index(workflows))
        print(f"  -> {index_path.relative_to(REPO_ROOT)} (index)")

    print(f"Done. Generated {len(workflows)} diagrams.")


if __name__ == "__main__":
    main()
