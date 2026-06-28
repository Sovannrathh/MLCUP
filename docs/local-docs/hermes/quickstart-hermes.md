# Quickstart with Hermes

Install NemoClaw, select the Hermes agent, and launch a sandboxed Hermes dashboard and API endpoint.

Review [prerequisites.md](prerequisites.md) before starting. Install Docker, start it, and verify the current shell can reach it before onboarding.

---

## Install and Onboard

Set `NEMOCLAW_AGENT=hermes` and run the installer. It installs the CLI, registers the `nemohermes` alias, and launches the guided wizard.

```bash
export NEMOCLAW_AGENT=hermes
curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
```

If NemoClaw is already installed, start onboarding directly:

```bash
nemohermes onboard
```

**Headless / remote host** — set `CHAT_UI_URL` to the externally reachable origin for port `18789` before onboarding:

```bash
export NEMOCLAW_AGENT=hermes
export CHAT_UI_URL="https://hermes.example.com:18789"
curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
```

---

## Respond to the Wizard

The wizard collects: inference provider → model → credential → sandbox name → messaging channels → network policy tier.

At any prompt: press **Enter** to accept the default `[shown in brackets]`, type `back` to return to the previous prompt, or `exit` to quit.

**Sandbox name** — use a distinct name so Hermes and OpenClaw sandboxes can coexist:
```text
Sandbox name [hermes]: my-hermes
```

**Inference provider** — choose where model traffic goes (NVIDIA Endpoints, OpenAI, Anthropic, Gemini, Ollama, etc.). See [command-reference.md](../command-reference.md) for provider names.

After confirmation, NemoClaw:
1. Registers inference with OpenShell
2. Builds the Hermes sandbox image (~2.4 GB, first build takes several minutes)
3. Starts the Hermes gateway inside the sandbox
4. Applies the selected network policy tier

---

## Non-Interactive Setup (CI / Scripted)

```bash
export NEMOCLAW_AGENT=hermes
export NEMOCLAW_NON_INTERACTIVE=1
export NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1
export NEMOCLAW_SANDBOX_NAME=my-hermes
export NVIDIA_INFERENCE_API_KEY=<your-key>
curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
```

Policy tier in non-interactive mode (default is `balanced`):
```bash
NEMOCLAW_POLICY_TIER=restricted   # restricted | balanced | open
```

---

## Connect

When onboarding completes, NemoClaw prints:

```text
──────────────────────────────────────────────────
NemoHermes is ready

Sandbox:  my-hermes
Model:    nvidia/nemotron-3-super-120b-a12b (NVIDIA Endpoints)

Access

  Hermes Agent Dashboard
  Port 18789 must be forwarded before opening this URL.
  http://127.0.0.1:18789/

  Hermes Agent OpenAI-compatible API
  Port 8642 must be forwarded before connecting.
  http://127.0.0.1:8642/v1

Terminal:
  nemohermes my-hermes connect
──────────────────────────────────────────────────
```

**Open a terminal session inside the sandbox:**
```bash
nemohermes my-hermes connect
# then inside the sandbox:
hermes
```

---

## Dashboard

The port forward starts automatically after onboarding. Get the URL:

```bash
nemohermes my-hermes dashboard-url --quiet
# → http://127.0.0.1:18789/
```

Open that URL in a browser. Hermes manages its own dashboard sessions — there is no `#token=` fragment.

---

## API Endpoint

Check the health endpoint to confirm the Hermes API is reachable:

```bash
curl -sf http://127.0.0.1:8642/health
```

If the forward dropped (e.g. after a reboot), restart it:

```bash
openshell forward start --background 8642 my-hermes
```

Configure any OpenAI-compatible client with base URL `http://127.0.0.1:8642/v1`.

---

## Day-to-Day Management

```bash
nemohermes my-hermes status          # health, inference config, applied policies
nemohermes my-hermes logs --follow   # live gateway logs
nemohermes my-hermes snapshot create # save state before changes
nemohermes my-hermes rebuild         # upgrade image, preserve workspace
nemohermes my-hermes destroy         # delete sandbox and persistent volume
```

Switch model without rebuilding:
```bash
nemohermes inference set --model <model> --provider <provider>
```

---

## Add Matrix Messaging (This Setup)

After the basic sandbox is running, connect Matrix:

```bash
export MATRIX_HOMESERVER=http://host.docker.internal:8081
export MATRIX_ACCESS_TOKEN=<token>
NEMOCLAW_NON_INTERACTIVE=1 nemohermes my-hermes channels add matrix
NEMOCLAW_NON_INTERACTIVE=1 nemohermes my-hermes policy-add matrix
nemohermes my-hermes rebuild
nemohermes my-hermes gateway
```

See [../matrix/local-synapse.md](../matrix/local-synapse.md) for the full setup and troubleshooting.

---

## Next Steps

- [prerequisites.md](prerequisites.md) — verify hardware/software before setup
- [windows-preparation.md](windows-preparation.md) — WSL2 setup for Windows
- [../matrix/local-synapse.md](../matrix/local-synapse.md) — connect to local Synapse
- [../command-reference.md](../command-reference.md) — full CLI reference
