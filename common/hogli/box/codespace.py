"""GitHub Codespaces subprocess wrapper.

Encapsulates all `gh codespace` CLI calls with proper error handling.
"""

from __future__ import annotations

import os
import sys
import json
import time
import subprocess
from typing import NoReturn

import click

REPO = "PostHog/posthog"


def ensure_gh_authenticated() -> None:
    """Verify gh CLI is installed and authenticated. Exits on failure."""
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            click.echo("Error: GitHub CLI not authenticated.", err=True)
            click.echo("Run: gh auth login", err=True)
            raise SystemExit(1)
    except FileNotFoundError:
        click.echo("Error: GitHub CLI (gh) not found.", err=True)
        click.echo("Install: brew install gh", err=True)
        raise SystemExit(1)


def list_codespaces(repo: str = REPO) -> list[dict]:
    """List codespaces for a repo, parsed from JSON."""
    result = subprocess.run(
        [
            "gh",
            "codespace",
            "list",
            "--repo",
            repo,
            "--json",
            "name,state,branch,machineName,lastUsedAt,displayName",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return []


def find_codespace(repo: str, branch: str) -> dict | None:
    """Find an existing codespace for repo+branch. Prefers running over stopped."""
    codespaces = [cs for cs in list_codespaces(repo) if cs.get("branch") == branch]
    if not codespaces:
        return None
    running = [cs for cs in codespaces if cs.get("state") == "Available"]
    return running[0] if running else codespaces[0]


def create_codespace(
    repo: str,
    branch: str,
    machine: str,
    idle_timeout: str = "15m",
    retention: str = "720h",
    display_name: str | None = None,
) -> str:
    """Create a codespace and return its name."""
    cmd = [
        "gh",
        "codespace",
        "create",
        "--repo",
        repo,
        "--branch",
        branch,
        "--machine",
        machine,
        "--idle-timeout",
        idle_timeout,
        "--retention-period",
        retention,
        "--default-permissions",
    ]
    if display_name:
        cmd.extend(["--display-name", display_name])

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        click.echo(f"Error creating codespace: {result.stderr.strip()}", err=True)
        raise SystemExit(1)

    return result.stdout.strip()


def start_codespace(name: str) -> None:
    """Start a stopped codespace."""
    subprocess.run(["gh", "codespace", "start", "-c", name], check=True)


def stop_codespace(name: str) -> None:
    """Stop a running codespace."""
    subprocess.run(["gh", "codespace", "stop", "-c", name], check=True)


def delete_codespace(name: str, force: bool = False) -> None:
    """Delete a codespace."""
    cmd = ["gh", "codespace", "delete", "-c", name]
    if force:
        cmd.append("--force")
    subprocess.run(cmd, check=True)


def wait_for_codespace(name: str, timeout: int = 300) -> bool:
    """Wait for a codespace to become Available. Returns True on success."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        result = subprocess.run(
            ["gh", "codespace", "view", "-c", name, "--json", "state"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            try:
                if json.loads(result.stdout).get("state") == "Available":
                    return True
            except json.JSONDecodeError:
                pass
        elapsed = int(time.time() - start_time)
        click.echo(f"  Waiting for codespace... ({elapsed}s)", err=True)
        time.sleep(5)
    return False


def ssh_into(name: str) -> NoReturn:
    """SSH into a codespace. Replaces the current process."""
    os.execvp("gh", ["gh", "codespace", "ssh", "-c", name])
    sys.exit(1)  # unreachable, satisfies type checker


def open_in_vscode(name: str) -> NoReturn:
    """Open codespace in VS Code. Replaces the current process."""
    os.execvp("gh", ["gh", "codespace", "code", "-c", name])
    sys.exit(1)


def set_user_secret(name: str, value: str, repo: str = REPO) -> None:
    """Set a user-scoped Codespace secret for the given repo."""
    subprocess.run(
        [
            "gh",
            "secret",
            "set",
            name,
            "--user",
            "--app",
            "codespaces",
            "--repos",
            repo,
            "--body",
            value,
        ],
        check=True,
    )


def view_codespace(name: str) -> dict:
    """Get codespace details as a dict."""
    result = subprocess.run(
        [
            "gh",
            "codespace",
            "view",
            "-c",
            name,
            "--json",
            "name,state,branch,machineName,createdAt,lastUsedAt,displayName",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}


def get_current_branch() -> str:
    """Get the current git branch name."""
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else "master"
