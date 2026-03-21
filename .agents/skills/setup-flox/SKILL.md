---
name: setup-flox
description: Set up the flox development environment so that Bash commands have access to python, node, pytest, and other project tools. Use when commands fail due to missing tools or PATH issues.
---

# Flox environment setup

This skill captures the flox environment and writes it to `CLAUDE_ENV_FILE` so that all subsequent Bash commands have python, node, pytest, etc. on PATH.

## When to use

- Commands fail because `python`, `node`, `pytest`, `uv`, or other tools are not found
- You get PATH-related errors when running project commands
- At the start of a session when you need the development environment

## Steps

Run this script to capture the flox environment:

```bash
# Skip if flox isn't installed, on Claude web, or CLAUDE_ENV_FILE isn't set
if ! command -v flox &>/dev/null || [ "$CLAUDE_CODE_REMOTE" = "true" ] || [ -z "$CLAUDE_ENV_FILE" ]; then
  echo "Skipping flox setup (flox not installed, remote, or no CLAUDE_ENV_FILE)"
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
VENV_DIR="$PROJECT_DIR/.flox/cache/venv"

# Capture the flox activation environment (hook.on-activate runs,
# but [profile] scripts do NOT run in non-interactive `bash -c`).
FLOX_ENV_SNAPSHOT=$(flox activate --dir "$PROJECT_DIR" -- bash -c 'printenv' 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$FLOX_ENV_SNAPSHOT" ]; then
  echo "Warning: flox activate failed, skipping env setup" >&2
  exit 0
fi

# Extract key env vars from flox and write them to CLAUDE_ENV_FILE.
echo "$FLOX_ENV_SNAPSHOT" | grep -E "^(PATH|FLOX_|UV_PROJECT_ENVIRONMENT|OPENSSL_|LDFLAGS|CPPFLAGS|RUST_|LIBRARY_PATH|MANPATH|DOTENV_FILE|DEBUG|POSTHOG_SKIP_MIGRATION_CHECKS|FLAGS_REDIS_URL|RUSTC_WRAPPER|SCCACHE_)=" | while IFS='=' read -r key value; do
  printf 'export %s=%q\n' "$key" "$value"
done >> "$CLAUDE_ENV_FILE"

# The flox [profile] scripts also activate the uv venv, which adds
# the venv's bin/ to PATH. Since [profile] doesn't run in `bash -c`, we do
# this manually by prepending the venv bin dir to PATH.
if [ -d "$VENV_DIR/bin" ]; then
  echo "export PATH=\"${VENV_DIR}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  echo "export VIRTUAL_ENV=\"${VENV_DIR}\"" >> "$CLAUDE_ENV_FILE"
fi

echo "Flox environment captured successfully"
```

After running, all subsequent Bash commands in the session will have the flox environment available.
