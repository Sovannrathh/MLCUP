# Matrix Messaging with a Local Synapse Server

Connect a Hermes sandbox to a self-hosted Synapse homeserver running on WSL2 or a local Docker host.

For a cloud homeserver (e.g. `matrix.rexform.io`), skip the Docker-host routing sections and use the public URL directly.

---

## Overview

Local Synapse is reachable from inside the sandbox via Docker's host gateway (`host.docker.internal`).
NemoClaw's OpenShell SSRF guard blocks private-range IPs by default, so the `matrix` policy preset includes explicit IP range allowlisting for the gateway.

The preset covers two ports:

| Port | What runs there |
|------|-----------------|
| `8008` | Synapse default HTTP API |
| `8081` | nginx reverse proxy (Element Web + Synapse) |

---

## Prerequisites

- Synapse is running on the host and reachable from the Docker gateway.
  Verify: `curl http://host.docker.internal:8081/_matrix/client/versions`
- A Matrix bot account exists with an access token.
  Get it from Element: **Settings > Help & About > Access Token**.
- A Hermes sandbox is already installed (`nemohermes my-assistant` or `nemoclaw my-assistant`).

---

## Step 1 — Add the Matrix Channel

```bash
export MATRIX_HOMESERVER=http://host.docker.internal:8081
export MATRIX_ACCESS_TOKEN=<your-access-token>
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw my-assistant channels add matrix
```

Interactive onboarding will prompt for optional settings:

| Setting | Default | Notes |
|---------|---------|-------|
| Allowed user IDs | _(any)_ | Comma-separated `@user:homeserver` |
| Allowed room IDs | _(any)_ | Comma-separated `!room:homeserver` — recommended for shared homeservers |
| Require @mention | `false` | Bot only responds when directly @mentioned |
| Auto-thread replies | `false` | Replies land in Matrix threads |
| Session scope | `room` | `room`, `thread`, or `auto` |

## Step 2 — Apply the Matrix Network Policy

```bash
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw my-assistant policy-add matrix
```

This applies `nemoclaw-blueprint/policies/presets/matrix.yaml`, which allows `/_matrix/**` on ports `8008` and `8081` and allowlists private IP ranges for the Docker host gateway.

## Step 3 — Rebuild and Start the Gateway

```bash
nemoclaw my-assistant rebuild
nemoclaw my-assistant gateway
```

Hermes connects to Synapse via `mautrix-python`. `auto_join` is enabled by default — invite the bot account to a room and it joins automatically.

---

## Troubleshooting

### Wrong port (8008 vs 8081)

If the bot was configured against port `8008` but your proxy listens on `8081`, patch `.env` inside the sandbox without a full rebuild:

```bash
nemoclaw my-assistant connect <<'EOF'
sed -i 's|MATRIX_HOMESERVER=http://host.docker.internal:8008|MATRIX_HOMESERVER=http://host.docker.internal:8081|' /sandbox/.hermes/.env
grep MATRIX_HOMESERVER /sandbox/.hermes/.env
hermes gateway
EOF
```

Or run the helper script from the WSL2 terminal:

```bash
bash scripts/connect-matrix-now.sh
```

### SSRF guard blocks the homeserver

Check the Docker gateway address:

```bash
getent hosts host.docker.internal
```

If the address falls outside `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`, add it to `allowed_ips` in `nemoclaw-blueprint/policies/presets/matrix.yaml` and reapply:

```bash
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw my-assistant policy-add matrix
```

### Bot does not respond in rooms

- Confirm the bot account was invited and `auto_join` is enabled (default).
- If `MATRIX_ALLOWED_USERS` is set, verify your Matrix user ID is listed.
- If `MATRIX_ALLOWED_ROOMS` is set, verify the target room ID is listed.
- If `MATRIX_REQUIRE_MENTION=true`, @mention the bot in your message.

View gateway logs:

```bash
nemoclaw my-assistant logs --filter matrix
```

---

## Configuration Reference

| Env variable | Required | Description |
|---|---|---|
| `MATRIX_HOMESERVER` | Yes | Full URL, e.g. `http://host.docker.internal:8081` |
| `MATRIX_ACCESS_TOKEN` | Yes | Bot account access token |
| `MATRIX_ALLOWED_USERS` | No | Comma-separated Matrix user IDs |
| `MATRIX_ALLOWED_ROOMS` | No | Comma-separated Matrix room IDs |
| `MATRIX_REQUIRE_MENTION` | No | `true`/`false` — require @mention in rooms (default `false`) |
| `MATRIX_AUTO_THREAD` | No | `true`/`false` — reply in threads (default `false`) |
| `MATRIX_SESSION_SCOPE` | No | `room`, `thread`, or `auto` (default `room`) |

All variables are written to `/sandbox/.hermes/.env` inside the sandbox.
