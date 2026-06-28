# How to Add a New Agent to NemoClaw

This guide walks through everything you need to do to add a brand-new agent — not Hermes, not OpenClaw — to NemoClaw. The agent system is filesystem-driven: no code changes are required to register the agent itself. NemoClaw discovers it automatically from the directory structure you create.

Use Hermes (`agents/hermes/`) and OpenClaw (`agents/openclaw/`) as reference while working through the steps below.

---

## Overview of What You Will Create

```
agents/<your-agent>/
  manifest.yaml            ← required: agent definition contract
  Dockerfile               ← required: sandbox image
  Dockerfile.base          ← optional: base layer (separate cache tier)
  start.sh                 ← required: sandbox entrypoint
  policy-additions.yaml    ← required: sandbox network + filesystem policy
  policy-permissive.yaml   ← optional: relaxed policy for dev/testing
  generate-config.ts       ← optional: build-time config generator
  config/                  ← optional: config modules (if generate-config.ts splits logic out)
  plugin/                  ← optional: NemoClaw Commander extension
  host/                    ← optional: host-side setup scripts
```

---

## Step 1 — Create the Agent Directory

```bash
mkdir -p agents/<your-agent>
```

Use a lowercase name with no spaces. This name becomes the `--agent` flag value and the `NEMOCLAW_AGENT` env value.

---

## Step 2 — Write `manifest.yaml`

This is the single source of truth that NemoClaw reads. `listAgents()` in `src/lib/agent/defs.ts` scans `agents/*/manifest.yaml` automatically — no registration code needed.

### Required fields

```yaml
name: <your-agent>             # must match the directory name
display_name: "My Agent"
description: "One-line description"
version_constraint: ">=1.0.0"
language: python               # or: nodejs, go, rust, binary
license: Apache-2.0
homepage: "https://example.com"

binary_path: /usr/local/bin/<agent-binary>
version_command: "<agent-binary> --version"
expected_version: "1.0.0"
gateway_command: "<agent-binary> gateway run"

health_probe:
  url: "http://localhost:<port>/health"
  port: <port>
  timeout_seconds: 30

forward_ports:
  - <port>
```

### Optional but commonly needed fields

```yaml
# If the agent has a web dashboard
dashboard:
  kind: ui
  label: "Dashboard"
  path: "/"
  health_path: "/health"
  auth: session   # or: bearer_token, none

# Config location inside the sandbox
config:
  dir: /sandbox/.<your-agent>
  config_file: config.yaml
  env_file: .env
  format: yaml   # or: json

# Directories to snapshot/restore across rebuilds
state_dirs:
  - workspace
  - sessions
  - logs

# Individual files to snapshot (use strategy: sqlite_backup for .db files)
state_files:
  - path: state.db
    strategy: sqlite_backup

# Messaging platforms the agent natively supports
messaging_platforms:
  supported:
    - telegram
    - slack

# How NemoClaw routes inference
inference:
  provider_type: custom
  base_url_config_key: "model.base_url"
  model_config_key: "model.default"
  proxy_support: implicit

# Egress endpoints the agent needs for updates/auth
phone_home_hosts:
  - example.com

# Package registry for runtime installs (pip, npm, etc.)
package_registry:
  hosts:
    - pypi.org
    - files.pythonhosted.org
  binary: /usr/local/bin/pip3
```

The full interface is defined in `src/lib/agent/defs.ts` — read the `AgentDefinition` type for every accepted field and its meaning.

---

## Step 3 — Write `policy-additions.yaml`

This YAML file defines the OpenShell sandbox policy for your agent: which filesystem paths are readable/writable and which network destinations the sandbox can reach.

Base it on `agents/hermes/policy-additions.yaml`. The minimum required sections are:

```yaml
version: 1

filesystem_policy:
  include_workdir: true
  read_only:
    - /usr
    - /lib
    - /etc
  read_write:
    - /sandbox
    - /tmp
    - /sandbox/.<your-agent>

landlock:
  compatibility: best_effort

process:
  run_as_user: sandbox
  run_as_group: sandbox

network_policies:
  managed_inference:
    name: managed_inference
    endpoints:
      - host: inference.local
        port: 443
        protocol: rest
        enforcement: enforce
        rules:
          - allow: { method: POST, path: "/v1/chat/completions" }
          - allow: { method: GET, path: "/v1/models" }
    binaries:
      - { path: /usr/local/bin/<agent-binary> }
```

Add more `network_policies` entries for each external service the agent needs (package registry, phone-home hosts, messaging platforms). Each entry gets a `name`, `endpoints` list, and a `binaries` allow-list.

**Note:** Opt-in messaging policies (Telegram, Slack, etc.) should live here as named sections. NemoClaw filters them out at sandbox-creation time for channels the user didn't select.

**SSRF guard:** If your agent needs to reach a `host.docker.internal` or private-range IP (e.g. a local homeserver on WSL2), you must also add a `nemoclaw-blueprint/policies/presets/<name>.yaml` with `allowed_ips` to bypass the SSRF guard. See `nemoclaw-blueprint/policies/presets/matrix.yaml` for the pattern.

---

## Step 4 — Write `Dockerfile`

The Dockerfile builds the image that OpenShell runs. It must:

- Install the agent binary at the `binary_path` you declared in `manifest.yaml`
- Copy `start.sh` into the image and make it executable
- Set `ENTRYPOINT ["/start.sh"]` (or equivalent)
- Run as a non-root user where possible (`sandbox:sandbox`)

For a heavy base image (large runtime, pre-baked models), use a two-layer split:

- `Dockerfile.base` — the slow-changing base layer (runtime, heavy dependencies)
- `Dockerfile` — `FROM <base-image>` with your agent install and configs on top

The two-layer approach makes iterative rebuilds much faster because the base image is only rebuilt when its own layer changes.

---

## Step 5 — Write `start.sh`

The entrypoint script runs inside the sandbox as PID 1. At minimum it must:

1. Set `PATH` to a restricted value
2. Source `/usr/local/lib/nemoclaw/sandbox-init.sh` for security hardening primitives (see `agents/hermes/start.sh` lines 1-40 for how)
3. Call `harden_resource_limits` before stepping down from root
4. `exec` the agent's gateway command as the `sandbox` user

```bash
#!/usr/bin/env bash
set -euo pipefail

_SANDBOX_INIT="/usr/local/lib/nemoclaw/sandbox-init.sh"
source "$_SANDBOX_INIT"

harden_resource_limits

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

exec gosu sandbox <agent-binary> gateway run
```

---

## Step 6 — Build and Verify Discovery

```bash
# Build the NemoClaw plugin (picks up any TypeScript changes)
cd nemoclaw && npm run build && cd ..

# Confirm NemoClaw lists your new agent
nemoclaw agents list
```

You should see `<your-agent>` in the output. If it doesn't appear:

- Check that `manifest.yaml` parses as valid YAML
- Confirm the `name:` field matches the directory name exactly
- Run `nemoclaw agents list --verbose` to see parse errors

---

## Step 7 — Onboard and Test

```bash
export NEMOCLAW_AGENT=<your-agent>
nemoclaw onboard
```

Or without the environment variable:

```bash
nemoclaw onboard --agent <your-agent>
```

The onboard wizard reads your manifest and walks through inference provider → model → sandbox name → policy tier. After it completes:

```bash
nemoclaw <sandbox-name> status
nemoclaw <sandbox-name> logs --follow
```

If the health probe fails, check:

1. The `health_probe.url` and port match what the agent actually binds to
2. The `gateway_command` is correct
3. `start.sh` is `exec`-ing the binary (not forking it)

---

## Optional: `generate-config.ts`

If your agent needs a config file generated at build time (like Hermes generates `config.yaml` and `.env`), create `generate-config.ts` as a thin entrypoint. Put the actual config construction logic in a `config/` subdirectory, one file per concern:

```
agents/<your-agent>/
  generate-config.ts        ← entrypoint: imports and runs config/
  config/
    <agent>-config.ts       ← builds the main config structure
    env.ts                  ← parses env vars
    registry.ts             ← agent-specific provider/model registry
```

Keep `generate-config.ts` thin (see `agents/hermes/generate-config.ts` for the pattern). The heavy logic goes in `config/`.

---

## Optional: `plugin/`

If you need custom NemoClaw slash commands for your agent (like `nemohermes` wraps `nemoclaw`), add a `plugin/` subdirectory with a Commander extension. See `nemoclaw/src/commands/` and the Hermes plugin for the pattern.

Register the plugin alias in `nemoclaw/src/plugin-registry.ts` (or wherever agent plugins are registered — grep for `hermes` to find the exact location).

---

## Optional: Network Policy Preset

If the sandbox needs to reach a messaging platform or external service as an opt-in, add a preset instead of baking it into `policy-additions.yaml`:

```bash
# Copy an existing preset as a starting point
cp nemoclaw-blueprint/policies/presets/slack.yaml \
   nemoclaw-blueprint/policies/presets/<platform>.yaml
# Edit it with the correct hosts, ports, and allowed HTTP paths
```

Users then enable it during onboard or after with:

```bash
nemoclaw <sandbox-name> policy-add <platform>
```

---

## Checklist

| Step | File | Required |
|------|------|----------|
| 1 | `agents/<name>/` directory | Yes |
| 2 | `manifest.yaml` | Yes |
| 3 | `policy-additions.yaml` | Yes |
| 4 | `Dockerfile` | Yes |
| 5 | `start.sh` | Yes |
| 6 | Verify `nemoclaw agents list` | Verify |
| 7 | `nemoclaw onboard --agent <name>` | Test |
| — | `Dockerfile.base` | Optional |
| — | `generate-config.ts` + `config/` | Optional |
| — | `plugin/` (custom commands) | Optional |
| — | `policy-permissive.yaml` | Optional |
| — | `nemoclaw-blueprint/policies/presets/<name>.yaml` | Optional |

---

## Key Files to Read

| File | Why |
|------|-----|
| `src/lib/agent/defs.ts` | Full `AgentDefinition` interface — all manifest fields and their types |
| `agents/hermes/manifest.yaml` | Most complete manifest example |
| `agents/hermes/policy-additions.yaml` | Full policy example with messaging platform sections |
| `agents/hermes/start.sh` | Sandbox entrypoint pattern |
| `agents/hermes/Dockerfile` | Two-layer Dockerfile pattern |
| `agents/hermes/generate-config.ts` | Thin config entrypoint pattern |
| `agents/openclaw/manifest.yaml` | Simpler manifest (npm install method, JSON config) |
| `nemoclaw-blueprint/policies/presets/matrix.yaml` | SSRF bypass preset pattern |
