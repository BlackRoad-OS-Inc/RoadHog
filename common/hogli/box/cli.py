"""CLI commands for remote devbox management via GitHub Codespaces.

Provides hogli box:* commands for creating, managing, and connecting
to remote development environments.
"""

from __future__ import annotations

import click
from hogli.core.cli import cli

from . import codespace as cs

DEFAULT_MACHINE = "premiumLinux"


def _get_intents_from_config() -> str:
    """Read intent configuration from local dev setup. Falls back to product_analytics."""
    try:
        from hogli.devenv.generator import get_generated_mprocs_path, load_devenv_config

        output_path = get_generated_mprocs_path()
        config = load_devenv_config(output_path)
        if config and config.intents:
            return ",".join(config.intents)
    except Exception:
        pass
    return "product_analytics"


def _resolve_codespace_name(branch: str | None, name: str | None) -> str:
    """Resolve a codespace name from explicit name or branch lookup."""
    if name:
        return name
    branch = branch or cs.get_current_branch()
    existing = cs.find_codespace(cs.REPO, branch)
    if not existing:
        click.echo(f"No codespace found for branch: {branch}", err=True)
        click.echo("Run 'hogli box:start' to create one.", err=True)
        raise SystemExit(1)
    return existing["name"]


@cli.command(name="box:start", help="Create or reconnect to a remote devbox")
@click.option("--branch", "-b", default=None, help="Branch to use (default: current)")
@click.option("--intents", "-i", default=None, help="Comma-separated intents (default: from dev:setup config)")
@click.option("--machine", "-m", default=DEFAULT_MACHINE, help="Machine type")
@click.option("--code", is_flag=True, help="Open in VS Code instead of SSH")
@click.option("--new", "force_new", is_flag=True, help="Force create a new codespace")
@click.option("--display-name", "-d", default=None, help="Display name for the codespace")
def box_start(
    branch: str | None,
    intents: str | None,
    machine: str,
    code: bool,
    force_new: bool,
    display_name: str | None,
) -> None:
    """Create or reconnect to a remote devbox via GitHub Codespaces.

    Looks for an existing codespace on the current branch.
    If found, reconnects. If not, creates a new one.

    Intent configuration is read from your local hogli dev:setup config
    and passed to the codespace so the same services start remotely.
    """
    cs.ensure_gh_authenticated()
    branch = branch or cs.get_current_branch()
    intents = intents or _get_intents_from_config()

    click.echo(f"Branch: {branch}")
    click.echo(f"Intents: {intents}")

    # Check for existing codespace
    if not force_new:
        existing = cs.find_codespace(cs.REPO, branch)
        if existing:
            name = existing["name"]
            state = existing.get("state", "unknown")
            click.echo(f"Found codespace: {name} ({state})")

            if state == "Shutdown":
                click.echo("Starting stopped codespace...")
                cs.start_codespace(name)
                if not cs.wait_for_codespace(name):
                    click.echo("Error: codespace failed to start", err=True)
                    raise SystemExit(1)

            if code:
                click.echo("Opening in VS Code...")
                cs.open_in_vscode(name)
            else:
                click.echo("Connecting via SSH...")
                cs.ssh_into(name)
            return

    # Set intent secret for the new codespace
    click.echo("Setting intent configuration...")
    cs.set_user_secret("POSTHOG_DEVBOX_INTENTS", intents)

    # Create new codespace
    click.echo(f"Creating codespace (machine: {machine})...")
    name = cs.create_codespace(
        cs.REPO,
        branch,
        machine,
        display_name=display_name,
    )
    click.echo(f"Created: {name}")

    click.echo("Waiting for codespace to be ready...")
    if not cs.wait_for_codespace(name):
        click.echo("Error: codespace creation timed out", err=True)
        raise SystemExit(1)

    click.echo("Codespace ready!")
    if code:
        click.echo("Opening in VS Code...")
        cs.open_in_vscode(name)
    else:
        click.echo("Connecting via SSH...")
        cs.ssh_into(name)


@cli.command(name="box:stop", help="Stop a running devbox (preserves state)")
@click.option("--branch", "-b", default=None, help="Branch to find codespace for")
@click.argument("name", required=False)
def box_stop(branch: str | None, name: str | None) -> None:
    """Stop a running codespace. It can be restarted later."""
    cs.ensure_gh_authenticated()
    resolved = _resolve_codespace_name(branch, name)
    click.echo(f"Stopping: {resolved}")
    cs.stop_codespace(resolved)
    click.echo("Stopped.")


@cli.command(name="box:delete", help="Delete a devbox permanently")
@click.option("--branch", "-b", default=None, help="Branch to find codespace for")
@click.option("--force", is_flag=True, help="Skip confirmation")
@click.argument("name", required=False)
def box_delete(branch: str | None, force: bool, name: str | None) -> None:
    """Permanently delete a codespace and all its data."""
    cs.ensure_gh_authenticated()
    resolved = _resolve_codespace_name(branch, name)

    if not force:
        click.confirm(f"Delete codespace {resolved}?", abort=True)

    click.echo(f"Deleting: {resolved}")
    cs.delete_codespace(resolved, force=True)
    click.echo("Deleted.")


@cli.command(name="box:list", help="List your devboxes")
def box_list() -> None:
    """List all codespaces for the PostHog repo."""
    cs.ensure_gh_authenticated()
    codespaces = cs.list_codespaces()

    if not codespaces:
        click.echo("No codespaces found.")
        return

    click.echo(f"{'Name':<40} {'Branch':<25} {'State':<12} {'Machine':<15}")
    click.echo("-" * 92)
    for entry in codespaces:
        click.echo(
            f"{entry.get('name', ''):<40} "
            f"{entry.get('branch', ''):<25} "
            f"{entry.get('state', ''):<12} "
            f"{entry.get('machineName', ''):<15}"
        )


@cli.command(name="box:ssh", help="SSH into an existing devbox")
@click.option("--branch", "-b", default=None, help="Branch to find codespace for")
@click.argument("name", required=False)
def box_ssh(branch: str | None, name: str | None) -> None:
    """SSH into a running codespace."""
    cs.ensure_gh_authenticated()
    resolved = _resolve_codespace_name(branch, name)
    cs.ssh_into(resolved)


@cli.command(name="box:ports", help="Show forwarded ports from devbox")
@click.option("--branch", "-b", default=None, help="Branch to find codespace for")
@click.argument("name", required=False)
def box_ports(branch: str | None, name: str | None) -> None:
    """Show forwarded ports for a codespace."""
    cs.ensure_gh_authenticated()
    resolved = _resolve_codespace_name(branch, name)
    # Delegate to gh codespace ports which has its own formatting
    import subprocess

    subprocess.run(["gh", "codespace", "ports", "-c", resolved])


@cli.command(name="box:status", help="Show devbox status and details")
@click.option("--branch", "-b", default=None, help="Branch to find codespace for")
@click.argument("name", required=False)
def box_status(branch: str | None, name: str | None) -> None:
    """Show status of a codespace."""
    cs.ensure_gh_authenticated()

    if not name:
        branch = branch or cs.get_current_branch()
        existing = cs.find_codespace(cs.REPO, branch)
        if not existing:
            click.echo(f"No codespace found for branch: {branch}")
            return
        name = existing["name"]

    info = cs.view_codespace(name)
    if not info:
        click.echo(f"Could not get details for: {name}", err=True)
        raise SystemExit(1)

    click.echo(f"Name:      {info.get('name', '')}")
    click.echo(f"Display:   {info.get('displayName', '')}")
    click.echo(f"State:     {info.get('state', '')}")
    click.echo(f"Branch:    {info.get('branch', '')}")
    click.echo(f"Machine:   {info.get('machineName', '')}")
    click.echo(f"Created:   {info.get('createdAt', '')}")
    click.echo(f"Last used: {info.get('lastUsedAt', '')}")
