"""Tests for hogli box commands."""

from __future__ import annotations

from pathlib import Path

from unittest.mock import MagicMock, patch

from click.testing import CliRunner
from hogli.box.cli import box_bootstrap
from hogli.core.cli import cli
from hogli.devenv import DevenvConfig, load_devenv_config

runner = CliRunner()


class TestBoxStart:
    """Test box:start behavior."""

    @patch("hogli.box.cli.cs")
    @patch("hogli.box.cli._get_devenv_config")
    def test_box_start_bootstraps_new_codespace_from_saved_config(
        self,
        mock_get_config: MagicMock,
        mock_codespace: MagicMock,
    ) -> None:
        """New codespaces inherit the current saved devenv config."""
        mock_get_config.return_value = DevenvConfig(
            intents=["session_replay"],
            exclude_units=["typegen"],
            log_to_files=True,
        )
        mock_codespace.get_current_branch.return_value = "feature/devbox"
        mock_codespace.find_codespace.return_value = None
        mock_codespace.create_codespace.return_value = "cool-box"
        mock_codespace.wait_for_codespace.return_value = True

        result = runner.invoke(cli, ["box:start"])

        assert result.exit_code == 0
        mock_codespace.run_remote_command.assert_called_once()
        remote_name, remote_command = mock_codespace.run_remote_command.call_args.args
        assert remote_name == "cool-box"
        assert "--intent" in remote_command
        assert "session_replay" in remote_command
        assert "--exclude-unit" in remote_command
        assert "typegen" in remote_command
        assert "--log" in remote_command

    @patch("hogli.box.cli.cs")
    @patch("hogli.box.cli._get_devenv_config")
    def test_box_start_reuses_existing_codespace_without_bootstrap(
        self,
        mock_get_config: MagicMock,
        mock_codespace: MagicMock,
    ) -> None:
        """Existing codespaces reconnect without reapplying local config."""
        mock_get_config.return_value = DevenvConfig(intents=["feature_flags"])
        mock_codespace.get_current_branch.return_value = "feature/devbox"
        mock_codespace.find_codespace.return_value = {"name": "cool-box", "state": "Available"}
        mock_codespace.ssh_into.side_effect = SystemExit(0)

        result = runner.invoke(cli, ["box:start"])

        assert result.exit_code == 0
        mock_codespace.run_remote_command.assert_not_called()
        mock_codespace.create_codespace.assert_not_called()


class TestBoxBootstrap:
    """Test remote bootstrap command."""

    @patch("hogli.box.cli.subprocess.run")
    def test_box_bootstrap_persists_exact_config(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """Bootstrap saves the provided config before starting infra."""
        mock_run.return_value.returncode = 0

        with patch("hogli.box.cli.REMOTE_WORKSPACE_ROOT", str(tmp_path)):
            result = runner.invoke(
                box_bootstrap,
                [
                    "--intent",
                    "session_replay",
                    "--exclude-unit",
                    "typegen",
                    "--log",
                ],
            )

        assert result.exit_code == 0
        loaded = load_devenv_config(tmp_path / ".posthog" / ".generated" / "mprocs.yaml")
        assert loaded is not None
        assert loaded.intents == ["session_replay"]
        assert loaded.exclude_units == ["typegen"]
        assert loaded.log_to_files is True

        # Verify key bootstrap steps ran (order-independent)
        commands_run = [call.args[0] for call in mock_run.call_args_list]
        assert any("docker:services:up" in str(cmd) for cmd in commands_run)
        assert any("db:download-schema" in str(cmd) for cmd in commands_run)
        assert any("migrate" in str(cmd) for cmd in commands_run)
        assert any("migrate_clickhouse" in str(cmd) for cmd in commands_run)
        assert any("setup_local_api_key" in str(cmd) for cmd in commands_run)

    @patch("hogli.box.cli.subprocess.run")
    def test_box_bootstrap_restores_schema_when_downloaded(self, mock_run: MagicMock, tmp_path: Path) -> None:
        """When the CI schema artifact is downloaded, bootstrap restores it before migrating."""
        mock_run.return_value.returncode = 0

        # Simulate db:download-schema having placed the file
        schema_dir = tmp_path / ".postgres-backups"
        schema_dir.mkdir(parents=True)
        (schema_dir / "schema-latest.sql.gz").write_bytes(b"fake")

        with patch("hogli.box.cli.REMOTE_WORKSPACE_ROOT", str(tmp_path)):
            result = runner.invoke(box_bootstrap, ["--intent", "product_analytics"])

        assert result.exit_code == 0
        commands_run = [call.args[0] for call in mock_run.call_args_list]
        assert any("psql" in str(cmd) for cmd in commands_run)
