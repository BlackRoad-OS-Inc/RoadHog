"""CLI commands for remote devbox management.

Provides hogli box:* commands for managing Coder-based remote dev environments.
"""

from __future__ import annotations

import click
from hogli.core.cli import cli

from .coder import (
    SIZE_MAP,
    create_workspace,
    delete_workspace,
    ensure_coder,
    get_workspace,
    get_workspace_name,
    get_workspace_status,
    port_forward_replace,
    ssh_replace,
    start_workspace,
    stop_workspace,
)


def _print_connection_info(name: str) -> None:
    """Print connection commands after workspace is ready."""
    click.echo()
    click.echo("  SSH:      hogli box:ssh")
    click.echo("  Forward:  hogli box:forward")
    click.echo("  Status:   hogli box:status")
    click.echo("  Stop:     hogli box:stop")


@cli.command(name="box:start", help="Start or create your remote devbox")
@click.option(
    "--size",
    type=click.Choice(list(SIZE_MAP.keys())),
    default="medium",
    help="VM size: small (4 vCPU/16GB), medium (8/32GB), large (16/64GB)",
)
@click.option("--branch", default="master", help="Git branch to check out on the devbox")
def box_start(size: str, branch: str) -> None:
    """Start or create the remote devbox."""
    ensure_coder()
    name = get_workspace_name()
    ws = get_workspace(name)

    if ws is not None:
        status = get_workspace_status(ws)
        if status == "running":
            click.echo(f"Devbox '{name}' is already running.")
            _print_connection_info(name)
            return

        if status == "stopped":
            click.echo(f"Starting devbox '{name}'...")
            start_workspace(name)
            click.echo("Started.")
            _print_connection_info(name)
            return

        click.echo(f"Devbox '{name}' is in state: {status}")
        if status in ("starting", "stopping", "deleting"):
            click.echo("Wait for the current operation to complete.")
            return

        click.echo("Attempting to start...")
        start_workspace(name)
        _print_connection_info(name)
        return

    instance_type = SIZE_MAP[size]
    click.echo(f"Creating devbox '{name}' ({instance_type}, branch={branch})...")
    create_workspace(name, instance_type, branch)
    click.echo("Created.")
    _print_connection_info(name)


@cli.command(name="box:stop", help="Stop your devbox (preserves disk, stops billing)")
def box_stop() -> None:
    """Stop the devbox. State is preserved on the EBS volume."""
    ensure_coder()
    name = get_workspace_name()

    ws = get_workspace(name)
    if ws is None:
        click.echo("No devbox found. Run 'hogli box:start' to create one.")
        raise SystemExit(1)

    status = get_workspace_status(ws)
    if status == "stopped":
        click.echo(f"Devbox '{name}' is already stopped.")
        return

    click.echo(f"Stopping '{name}'...")
    stop_workspace(name)
    click.echo("Stopped. Disk preserved. Run 'hogli box:start' to resume.")


@cli.command(name="box:ssh", help="SSH into your devbox")
def box_ssh() -> None:
    """Open an SSH session to the devbox."""
    ensure_coder()
    name = get_workspace_name()
    ssh_replace(name)


@cli.command(name="box:destroy", help="Destroy your devbox and its data")
def box_destroy() -> None:
    """Destroy the devbox completely."""
    ensure_coder()
    name = get_workspace_name()

    ws = get_workspace(name)
    if ws is None:
        click.echo("No devbox found.")
        return

    if not click.confirm(f"Destroy '{name}'? This deletes the VM and its data"):
        click.echo("Cancelled.")
        return

    delete_workspace(name)
    click.echo("Destroyed.")


@cli.command(name="box:status", help="Show devbox status")
def box_status() -> None:
    """Show the current state of the devbox."""
    ensure_coder()
    name = get_workspace_name()

    ws = get_workspace(name)
    if ws is None:
        click.echo("No devbox found. Run 'hogli box:start' to create one.")
        return

    status = get_workspace_status(ws)
    color = {
        "running": "green",
        "stopped": "yellow",
        "starting": "cyan",
        "stopping": "yellow",
        "failed": "red",
        "deleting": "red",
    }.get(status, "white")

    click.echo(f"  Name:    {name}")
    click.echo(f"  Status:  {click.style(status, fg=color)}")

    # Show agent status if available
    resources = ws.get("latest_build", {}).get("resources", [])
    for resource in resources:
        for agent in resource.get("agents", []):
            agent_status = agent.get("status", "unknown")
            click.echo(f"  Agent:   {agent_status}")

    if status == "running":
        _print_connection_info(name)


@cli.command(name="box:forward", help="Forward PostHog UI to localhost")
@click.option("--port", default=8010, type=int, help="Local port to forward to")
def box_forward(port: int) -> None:
    """Forward the PostHog UI port to localhost."""
    ensure_coder()
    name = get_workspace_name()

    click.echo(f"Forwarding {name}:8010 -> localhost:{port}")
    click.echo(f"PostHog UI at http://localhost:{port}")
    click.echo("Ctrl+C to stop")
    click.echo()
    port_forward_replace(name, port, 8010)
