# Command Reference: OpenShell, NemoClaw / NemoHermes, and Hermes

Quick-reference for the three CLI layers used in this setup.

| Layer | Binary | Scope |
|-------|--------|-------|
| **OpenShell** | `openshell` | Sandbox runtime — gateway, policy enforcement, egress monitoring |
| **NemoClaw / NemoHermes** | `nemoclaw` / `nemohermes` | Sandbox lifecycle, channels, inference, credentials |
| **Hermes** | `hermes` | Agent runtime — run inside the sandbox via `nemoclaw connect` |

`nemohermes` is an alias for `nemoclaw --agent hermes`. All `nemoclaw` commands below work with either binary.

---

## NemoClaw / NemoHermes Commands

### Global

| Command | What it does |
|---------|-------------|
| `nemoclaw help` | Show top-level usage and command list |
| `nemoclaw --version` | Print the installed CLI version |
| `nemoclaw status` | List all sandboxes with model, provider, and tunnel state |
| `nemoclaw list` | List registered sandboxes (add `--json` for machine-readable output) |
| `nemoclaw resources` | Show host CPU, RAM, GPU, and sandbox resource profiles |

---

### Onboarding and Setup

```bash
nemohermes onboard
```
Interactive wizard — creates the OpenShell gateway, registers an inference provider, builds the Hermes sandbox image, and creates the sandbox.

Key flags:

| Flag | Description |
|------|-------------|
| `--agent hermes` | Select Hermes agent (default for `nemohermes`) |
| `--name <sandbox>` | Set sandbox name non-interactively |
| `--resume` | Continue a previously interrupted onboard |
| `--fresh` | Discard saved session and start wizard from scratch |
| `--recreate-sandbox` | Force rebuild of an existing sandbox |
| `--non-interactive` | Suppress all prompts (requires env vars) |
| `--gpu` / `--no-gpu` | Require or suppress NVIDIA GPU passthrough |
| `--from <Dockerfile>` | Build from a custom Dockerfile |
| `--yes-i-accept-third-party-software` | Required for non-interactive installs |

Policy tier in non-interactive mode:
```bash
NEMOCLAW_POLICY_TIER=restricted nemohermes onboard --non-interactive --yes-i-accept-third-party-software
# tiers: restricted | balanced (default) | open
```

---

### Sandbox Lifecycle

| Command | What it does |
|---------|-------------|
| `nemoclaw <name> connect` | Open an interactive shell session in the sandbox |
| `nemoclaw <name> connect --probe-only` | Check SSH reachability without opening a shell |
| `nemoclaw <name> exec -- <cmd>` | Run a single command non-interactively in the sandbox |
| `nemoclaw <name> status` | Show sandbox health, inference config, and policy presets |
| `nemoclaw <name> status --json` | Same, machine-readable |
| `nemoclaw <name> doctor` | Run a focused health check (Docker, gateway, inference, channels) |
| `nemoclaw <name> recover` | Restart the in-sandbox gateway without opening a shell (idempotent) |
| `nemoclaw <name> rebuild` | Upgrade the sandbox image while preserving workspace state |
| `nemoclaw <name> destroy` | Delete the sandbox and its persistent volume (irreversible) |
| `nemoclaw <name> logs` | View sandbox logs |
| `nemoclaw <name> logs --follow` | Stream logs in real time |
| `nemoclaw <name> logs --tail <n>` | Show last N lines |
| `nemoclaw <name> logs --filter <pattern>` | Filter log lines by pattern |
| `nemoclaw <name> dashboard-url` | Print the Hermes dashboard URL (port 18789) |

**`exec` flags:**

| Flag | Description |
|------|-------------|
| `--workdir <dir>` | Working directory inside the sandbox |
| `--tty` / `--no-tty` | Force or suppress pseudo-terminal allocation |
| `--timeout <seconds>` | Command timeout (`0` = no timeout) |

---

### Network Policy

| Command | What it does |
|---------|-------------|
| `nemoclaw <name> policy-add` | Interactive preset picker — add a policy preset |
| `nemoclaw <name> policy-add <preset>` | Add a named preset non-interactively |
| `nemoclaw <name> policy-add matrix` | Apply the Matrix preset (SSRF bypass + port allowlisting) |
| `nemoclaw <name> policy-add matrix --yes` | Same, skip confirmation |
| `nemoclaw <name> policy-add --from-file <path>` | Apply a custom preset YAML |
| `nemoclaw <name> policy-add --dry-run` | Preview what a preset would open without applying |
| `nemoclaw <name> policy-remove` | Interactive picker — remove a policy preset |
| `nemoclaw <name> policy-remove <preset>` | Remove a named preset non-interactively |
| `nemoclaw <name> policy-list` | List available presets and which are applied |
| `nemoclaw <name> policy-explain` | Show a human-readable summary of current policy |
| `nemoclaw <name> policy-explain --json` | Same, structured output for agents |

Non-interactive policy add (used in scripts and the Matrix connect helper):
```bash
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw my-assistant policy-add matrix
```

---

### Messaging Channels

| Command | What it does |
|---------|-------------|
| `nemoclaw <name> channels list` | List known channels and their descriptions |
| `nemoclaw <name> channels add <channel>` | Enroll a channel (prompts for credentials, triggers rebuild) |
| `nemoclaw <name> channels remove <channel>` | Remove a channel and its credentials |
| `nemoclaw <name> channels stop <channel>` | Pause a channel without clearing credentials |
| `nemoclaw <name> channels start <channel>` | Re-enable a paused channel |
| `nemoclaw <name> channels status --channel <channel>` | Runtime diagnostics for a channel |

Supported channels: `telegram`, `discord`, `slack`, `wechat`, `whatsapp`, `matrix`

Non-interactive Matrix add (used during local setup):
```bash
export MATRIX_HOMESERVER=http://host.docker.internal:8081
export MATRIX_ACCESS_TOKEN=<token>
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw my-assistant channels add matrix
```

---

### Inference

| Command | What it does |
|---------|-------------|
| `nemoclaw inference get` | Show active inference provider and model |
| `nemoclaw inference set --provider <p> --model <m>` | Switch provider/model live (patches `config.yaml`, no rebuild) |
| `nemoclaw <name> status` | Shows inference health as `healthy`, `unreachable`, or `not probed` |

Supported providers: `nvidia-prod`, `openai-api`, `anthropic-prod`, `compatible-endpoint`, `ollama-local`, `vllm-local`, `hermes-provider`, and others.

---

### Credentials

| Command | What it does |
|---------|-------------|
| `nemoclaw credentials list` | List provider credentials registered with the gateway (no values) |
| `nemoclaw credentials reset <provider>` | Remove a provider credential from the gateway |

---

### Snapshots and Backup

| Command | What it does |
|---------|-------------|
| `nemoclaw <name> snapshot create` | Create a timestamped snapshot of sandbox state |
| `nemoclaw <name> snapshot restore` | Restore from a snapshot |
| `nemoclaw backup-all` | Back up all registered running sandboxes |
| `nemoclaw upgrade-sandboxes` | Rebuild sandboxes whose base image is stale |
| `nemoclaw upgrade-sandboxes --check` | List stale sandboxes without rebuilding |

---

### Tunnel / Remote Access

| Command | What it does |
|---------|-------------|
| `nemoclaw tunnel start` | Start a Cloudflare tunnel to expose the dashboard |
| `nemoclaw tunnel stop` | Stop the tunnel |
| `nemoclaw tunnel status` | Show tunnel state and public URL |

---

### Misc

| Command | What it does |
|---------|-------------|
| `nemoclaw update` | Check for and install CLI updates |
| `nemoclaw debug` | Collect diagnostics for bug reports |
| `nemoclaw debug --output <path>` | Save diagnostics tarball |
| `nemoclaw gc` | Remove orphaned Docker images from old builds |
| `nemoclaw uninstall` | Remove NemoClaw, gateway, sandboxes, and local state |

---

## OpenShell Commands

OpenShell is the sandbox runtime layer. Use these when NemoClaw commands are not specific enough.

> **Note:** Prefer `nemoclaw` commands for lifecycle operations. Use `openshell` directly for monitoring and low-level inspection only.

### Terminal / Monitor

```bash
openshell term
```
Opens the interactive TUI to monitor sandbox activity and approve/deny pending network egress requests. Run on the host where the sandbox is running.

---

### Gateway

| Command | What it does |
|---------|-------------|
| `openshell gateway list` | List registered gateways |
| `openshell gateway status` | Show gateway health |

Do **not** use `openshell gateway start --recreate` or `openshell sandbox create` directly — use `nemoclaw onboard` instead.

---

### Sandbox

| Command | What it does |
|---------|-------------|
| `openshell sandbox list` | List all sandboxes and their phases |
| `openshell sandbox connect <name>` | Connect to a sandbox (lower-level than `nemoclaw connect`) |
| `openshell sandbox exec <name> -- <cmd>` | Run a command inside a sandbox |

---

### Logs

```bash
openshell logs <sandbox>          # view logs
openshell logs <sandbox> -n 50    # last 50 lines (note: -n means line count here)
```

> `nemoclaw logs --tail <n>` and `openshell logs --tail` have different meanings — `openshell logs --tail` means follow mode, not line count. Use `-n <lines>` with `openshell` for a fixed count.

---

### Policy

```bash
openshell policy get                    # show active policy
openshell policy get --full             # full policy YAML
```

---

### Port Forwarding

```bash
openshell forward start --background 8642 my-hermes   # forward Hermes API port to host
openshell forward stop 8642 my-hermes                 # stop the forward
```

This is how to expose the Hermes OpenAI-compatible API (`port 8642`) to the host for external clients.

---

### Inference Route (Low-Level)

```bash
openshell inference set -g nemoclaw --model <model> --provider <provider>
```

Use `nemoclaw inference set` for the high-level version that also patches `config.yaml`.

---

## Hermes Commands (Inside the Sandbox)

Run these from inside the sandbox via `nemoclaw <name> connect` or `nemoclaw <name> exec --`.

### Gateway

| Command | What it does |
|---------|-------------|
| `hermes gateway` | Start the Hermes gateway (message platforms + API server) |
| `hermes gateway run` | Explicit form of `hermes gateway` |

---

### Version and Info

| Command | What it does |
|---------|-------------|
| `hermes --version` | Print the installed Hermes version |
| `hermes --help` | Show all available Hermes commands |

---

### Messaging Platform Management (Inside Sandbox)

| Command | What it does |
|---------|-------------|
| `hermes whatsapp` | Start WhatsApp QR pairing flow inside the sandbox |
| `hermes pairing approve <platform> <code>` | Approve a DM pairing request for a messaging user |

---

### Config and Environment (Inside Sandbox)

Hermes config files live at:

| Path | Description |
|------|-------------|
| `/sandbox/.hermes/config.yaml` | Main configuration (model, platform settings, plugins) |
| `/sandbox/.hermes/.env` | Environment variables including messaging credentials |
| `/sandbox/.hermes/runtime/state.db` | SQLite state database (sessions, memory) |
| `/sandbox/.hermes/platforms/` | Per-platform state (pairing tokens, etc.) |

Inspect or patch from the connect shell:
```bash
grep MATRIX /sandbox/.hermes/.env              # check Matrix env vars
cat /sandbox/.hermes/config.yaml | grep -A5 matrix   # check Matrix config
```

Patch a value without rebuilding:
```bash
sed -i 's|MATRIX_HOMESERVER=.*|MATRIX_HOMESERVER=http://host.docker.internal:8081|' \
  /sandbox/.hermes/.env
```

---

## Common Task Examples

### Start Hermes with Matrix on local Synapse

```bash
# One-time setup
export MATRIX_HOMESERVER=http://host.docker.internal:8081
export MATRIX_ACCESS_TOKEN=<token>
NEMOCLAW_NON_INTERACTIVE=1 nemohermes my-assistant channels add matrix
NEMOCLAW_NON_INTERACTIVE=1 nemohermes my-assistant policy-add matrix
nemohermes my-assistant rebuild
nemohermes my-assistant gateway
```

### Fix port 8008→8081 in a running sandbox (no rebuild)

```bash
bash scripts/connect-matrix-now.sh
# or manually:
nemohermes my-assistant connect <<'EOF'
sed -i 's|MATRIX_HOMESERVER=http://host.docker.internal:8008|MATRIX_HOMESERVER=http://host.docker.internal:8081|' /sandbox/.hermes/.env
hermes gateway
EOF
```

### Switch inference provider live

```bash
nemoclaw inference set --provider anthropic-prod --model claude-sonnet-4-6
```

### View Matrix-specific logs

```bash
nemohermes my-assistant logs --follow --filter matrix
```

### Approve a pending egress request

```bash
openshell term   # opens TUI — press A to approve, D to deny
```

### Forward the Hermes API to localhost

```bash
openshell forward start --background 8642 my-assistant
curl http://127.0.0.1:8642/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"<model>","messages":[{"role":"user","content":"hello"}]}'
```
