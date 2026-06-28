# Matrix Integration — Full Configuration Structure

This document maps every file and data flow involved in the Matrix channel integration for Hermes.
Use it as a reference when modifying any part of the Matrix stack.

---

## Architecture Overview

```
User input (onboard / channels add)
        │
        ▼
Channel Manifest          src/lib/messaging/channels/matrix/manifest.ts
  - defines inputs, credentials, policy presets, render steps
        │
        ├──► Env render      → /sandbox/.hermes/.env
        │
        ├──► Config render   → /sandbox/.hermes/config.yaml  (matrix section)
        │
        └──► Policy preset   → nemoclaw-blueprint/policies/presets/matrix.yaml
                                    │
                                    ▼
                             OpenShell SSRF guard (network enforcement)
```

At Docker build time a separate path also writes base config:

```
NEMOCLAW_* build args
        │
        ▼
agents/hermes/generate-config.ts
  └── agents/hermes/config/hermes-config.ts   → config.yaml (full file, including matrix defaults)
  └── agents/hermes/config/hermes-env.ts      → .env (base entries)
```

Channel-specific env lines (`MATRIX_HOMESERVER`, etc.) are **appended** by the render pipeline
at `channels add` time, not at image build time.

---

## File-by-File Reference

### 1. Channel Manifest
**`src/lib/messaging/channels/matrix/manifest.ts`**

The single source of truth for the Matrix channel contract. Defines:

| Section | What it controls |
|---------|-----------------|
| `inputs[]` | Every config prompt shown during `channels add matrix` |
| `credentials[]` | How the access token is stored and referenced |
| `policyPresets[]` | Which policy preset(s) to apply |
| `render[]` | What gets written to `.env` and `config.yaml` |
| `hooks[]` | Enrollment flow: token-paste then config-prompt |
| `state.persist` | Which values are saved to sandbox state for rebuild hydration |
| `state.rebuildHydration` | How state values map back to env vars on rebuild |
| `runtime.hermes.visibility` | Which config keys and log patterns to surface |

#### Inputs

| Input ID | Env key | Required | Notes |
|----------|---------|----------|-------|
| `homeserver` | `MATRIX_HOMESERVER` | Yes | Full URL including port |
| `accessToken` | `MATRIX_ACCESS_TOKEN` | Yes | Stored as a credential, not plain text |
| `allowedUsers` | `MATRIX_ALLOWED_USERS` | No | Comma-separated `@user:homeserver` |
| `allowedRooms` | `MATRIX_ALLOWED_ROOMS` | No | Comma-separated `!room:homeserver` |
| `requireMention` | `MATRIX_REQUIRE_MENTION` | No | `true`/`false` |
| `autoThread` | `MATRIX_AUTO_THREAD` | No | `true`/`false` |
| `sessionScope` | `MATRIX_SESSION_SCOPE` | No | `room` (default), `thread`, `auto` |

#### Render Steps

**`matrix-hermes-env`** — appends lines to `~/.hermes/.env`:
```
MATRIX_HOMESERVER=<value>
MATRIX_ACCESS_TOKEN=openshell:resolve:env:MATRIX_ACCESS_TOKEN
MATRIX_ALLOWED_USERS=<value or empty>
MATRIX_ALLOWED_ROOMS=<value or empty>
```
The access token line uses an OpenShell credential placeholder; the real token
is injected at gateway startup by OpenShell, not stored in the file.

**`matrix-hermes-config`** — merges into `~/.hermes/config.yaml` at path `matrix`:
```yaml
matrix:
  require_mention: <true|false>
  auto_thread: <true|false>
  session_scope: <room|thread|auto>
```

**`matrix-hermes-platform`** — merges into `~/.hermes/config.yaml` at path `platforms.matrix`:
```yaml
platforms:
  matrix:
    enabled: true
```

---

### 2. Network Policy Preset
**`nemoclaw-blueprint/policies/presets/matrix.yaml`**

Applied with: `nemoclaw <sandbox> policy-add matrix`

Allows `/_matrix/**` REST traffic on two endpoints:

| Host | Port | Purpose |
|------|------|---------|
| `host.docker.internal` | `8008` | Synapse default HTTP API (local) |
| `host.docker.internal` | `8081` | nginx reverse proxy (local, rexform setup) |
| `matrix.rexform.io` | `443` | Production homeserver |

Private-IP allowlists (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) bypass
the OpenShell SSRF guard for Docker host-gateway addresses.

Allowed binaries: `/usr/local/bin/hermes`, `/usr/bin/python3*`, `/opt/hermes/.venv/bin/python`

---

### 3. Base Hermes Sandbox Policy
**`agents/hermes/policy-additions.yaml`**

The sandbox-wide policy for all Hermes instances. Matrix is **not** included here —
it is opt-in only via the `matrix` preset above. Relevant base entries:

- `managed_inference` — `inference.local:443` for model calls
- `nous_research` — `nousresearch.com`, `hermes-agent.nousresearch.com`
- `pypi` — `pypi.org`, `files.pythonhosted.org` for pip installs
- Per-channel templates (`telegram`, `discord`, `slack`, `wechat_bridge`) are
  **filtered at sandbox creation time** — channels not selected are dropped.

---

### 4. Hermes Config Builder (Docker Build Time)
**`agents/hermes/config/hermes-config.ts`**

`buildHermesConfig()` writes the full `config.yaml` from `NEMOCLAW_*` build args.
The `platforms.matrix` block baked in at build time:

```yaml
platforms:
  matrix:
    enabled: true
    auto_join: true
    encryption: optional
    require_mention: true      # overridden by manifest render at enroll time
    auto_thread: true          # overridden by manifest render at enroll time
    dm_mention_threads: false
    dm_auto_thread: false
    reactions: true
    allow_room_mentions: false
    session_scope: room        # overridden by manifest render at enroll time
    process_notices: false
```

The manifest render steps (`matrix-hermes-config`) **override** these build-time defaults
with the values the user entered during onboarding.

---

### 5. Build Env / Config Pipeline
**`agents/hermes/generate-config.ts`** (entrypoint, called at Docker build)

Data flow:
```
NEMOCLAW_MODEL
NEMOCLAW_INFERENCE_BASE_URL
NEMOCLAW_PROVIDER_KEY
NEMOCLAW_INFERENCE_API
NEMOCLAW_UPSTREAM_PROVIDER
NEMOCLAW_HERMES_TOOL_GATEWAY_BROKER
NEMOCLAW_HERMES_TOOL_GATEWAY_PRESETS_B64
        │
        ▼
readHermesBuildSettings()       agents/hermes/config/build-env.ts
        │
        ├──► buildHermesConfig()   agents/hermes/config/hermes-config.ts
        │         └── writes config.yaml
        │
        └──► buildHermesEnvLines() agents/hermes/config/hermes-env.ts
                  └── writes .env base entries (API_SERVER_PORT etc.)
```

Matrix credentials are **never** present at build time. They are injected by the
NemoClaw render pipeline after `channels add matrix` and resolved by OpenShell
at gateway startup.

---

### 6. Channel Registry
**`src/lib/messaging/channels/built-ins.ts`**

Registers `matrixManifest` as a built-in channel. The registry is consumed by:
- `src/lib/sandbox/channels.ts` — `KNOWN_CHANNELS` list (includes `matrix`)
- `src/lib/messaging/applier/` — applies render steps during `channels add`

Primary token env key for Matrix: `MATRIX_ACCESS_TOKEN`

---

### 7. Helper Script
**`scripts/connect-matrix-now.sh`**

Intended for WSL2 (workbench@Sovannrath). Fixes a running sandbox where the
homeserver was configured on port `8008` instead of `8081`:

1. Re-applies the `matrix` policy preset (SSRF bypass + port allowlist)
2. Patches `MATRIX_HOMESERVER` in `/sandbox/.hermes/.env` (`8008` → `8081`)
3. Starts `hermes gateway` inside the sandbox

Run from the WSL2 terminal when the sandbox is already up:
```bash
bash scripts/connect-matrix-now.sh
```

---

## End-to-End Configuration Checklist

| Step | Command / File | What it does |
|------|---------------|--------------|
| 1. Add channel | `nemoclaw <name> channels add matrix` | Prompts for all inputs, writes `.env` lines and `config.yaml` fragment |
| 2. Apply policy | `nemoclaw <name> policy-add matrix` | Unlocks `/_matrix/**` egress with SSRF bypass |
| 3. Rebuild | `nemoclaw <name> rebuild` | Bakes updated config/env into the sandbox image |
| 4. Start gateway | `nemoclaw <name> gateway` | Hermes connects to Synapse, joins invited rooms |
| Fix port | `bash scripts/connect-matrix-now.sh` | Patch port in-place without rebuild |

---

## Key Paths Inside the Sandbox

| Path | Description |
|------|-------------|
| `/sandbox/.hermes/config.yaml` | Full Hermes config (model + platforms + matrix section) |
| `/sandbox/.hermes/.env` | Env vars including `MATRIX_HOMESERVER` and credential placeholder |
| `/sandbox/.hermes/runtime/state.db` | Hermes SQLite state (sessions, memory) |
| `/sandbox/.hermes/platforms/` | Platform-specific state (pairing tokens, etc.) |

---

## Changing Configuration After Onboarding

To update Matrix settings without a full rebuild:

```bash
# Re-run channel config prompts only
NEMOCLAW_NON_INTERACTIVE=0 nemoclaw <name> channels edit matrix

# Or patch .env directly in the running sandbox
nemoclaw <name> connect <<'EOF'
grep MATRIX /sandbox/.hermes/.env          # inspect current values
sed -i 's|MATRIX_ALLOWED_USERS=.*|MATRIX_ALLOWED_USERS=@you:matrix.rexform.io|' /sandbox/.hermes/.env
EOF
```

Changing `require_mention`, `auto_thread`, or `session_scope` requires a rebuild
because those values live in `config.yaml` (immutable at runtime).
`MATRIX_HOMESERVER` and `MATRIX_ALLOWED_USERS`/`MATRIX_ALLOWED_ROOMS` live in
`.env` and take effect on next gateway restart.
