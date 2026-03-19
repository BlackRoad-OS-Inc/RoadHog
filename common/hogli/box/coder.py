"""Coder CLI wrapper for devbox management.

All subprocess interactions with the Coder CLI are isolated here.
"""

from __future__ import annotations

import os
import sys
import json
import shutil
import subprocess

import click

TEMPLATE_NAME = "posthog-devbox"

# Map human-friendly sizes to EC2 instance types
SIZE_MAP: dict[str, str] = {
    "small": "m6i.xlarge",  # 4 vCPU, 16 GB
    "medium": "m6i.2xlarge",  # 8 vCPU, 32 GB
    "large": "m6i.4xlarge",  # 16 vCPU, 64 GB
}


def ensure_coder() -> None:
    """Verify coder CLI is installed and authenticated.

    Exits with instructions if either check fails.
    """
    if not shutil.which("coder"):
        click.echo(click.style("coder CLI not found.", fg="red"))
        click.echo()
        click.echo("Install:")
        click.echo("  curl -L https://coder.com/install.sh | sh")
        click.echo()
        click.echo("Then authenticate:")
        click.echo("  coder login <coder-server-url>")
        raise SystemExit(1)

    result = subprocess.run(
        ["coder", "whoami"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        click.echo(click.style("Not authenticated with Coder.", fg="red"))
        click.echo()
        click.echo("Authenticate:")
        click.echo("  coder login <coder-server-url>")
        raise SystemExit(1)


def get_username() -> str:
    """Get current Coder username."""
    result = subprocess.run(
        ["coder", "whoami", "--format", "json"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            return data["username"]
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback: parse text output (first non-empty line, strip email/whitespace)
    result = subprocess.run(
        ["coder", "whoami"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        for line in result.stdout.strip().splitlines():
            line = line.strip()
            if line and not line.startswith("http"):
                # Handle "username (email)" format
                return line.split()[0].split("@")[0].lower()

    click.echo(click.style("Failed to determine Coder username.", fg="red"))
    raise SystemExit(1)


def get_workspace_name() -> str:
    """Derive workspace name from Coder username."""
    return f"devbox-{get_username()}"


def get_workspace(name: str) -> dict | None:
    """Get workspace info by name, or None if it doesn't exist."""
    result = subprocess.run(
        ["coder", "list", "--output", "json"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None

    try:
        workspaces = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    for ws in workspaces:
        if ws.get("name") == name:
            return ws

    return None


def get_workspace_status(workspace: dict) -> str:
    """Extract status string from workspace dict."""
    return workspace.get("latest_build", {}).get("status", "unknown")


def create_workspace(name: str, instance_type: str, branch: str) -> None:
    """Create a new Coder workspace."""
    cmd = [
        "coder",
        "create",
        name,
        "--template",
        TEMPLATE_NAME,
        "--parameter",
        f"instance_type={instance_type}",
        "--parameter",
        f"posthog_branch={branch}",
        "--yes",
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def start_workspace(name: str) -> None:
    """Start a stopped workspace."""
    result = subprocess.run(["coder", "start", name, "--yes"])
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def stop_workspace(name: str) -> None:
    """Stop a running workspace."""
    result = subprocess.run(["coder", "stop", name, "--yes"])
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def delete_workspace(name: str) -> None:
    """Delete a workspace."""
    result = subprocess.run(["coder", "delete", name, "--yes"])
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def ssh_replace(name: str) -> None:
    """SSH into workspace. Replaces the current process."""
    coder_path = shutil.which("coder")
    if coder_path:
        os.execvp(coder_path, ["coder", "ssh", name])
    else:
        # Shouldn't reach here after ensure_coder(), but be safe
        sys.exit(subprocess.run(["coder", "ssh", name]).returncode)


def port_forward_replace(name: str, local_port: int, remote_port: int) -> None:
    """Port-forward to workspace. Replaces the current process."""
    coder_path = shutil.which("coder")
    args = ["coder", "port-forward", name, f"--tcp={local_port}:{remote_port}"]
    if coder_path:
        os.execvp(coder_path, args)
    else:
        sys.exit(subprocess.run(args).returncode)
