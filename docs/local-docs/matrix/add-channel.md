# How to Add a New Messaging Channel

This guide explains the original channel structure (Telegram, Discord, Slack, WeChat, WhatsApp)
and walks through every change needed to wire in a new channel — using Matrix as the worked example.

---

## The Original Structure (Before Matrix)

Five channels existed before this branch:

| Channel | Auth method | Special notes |
|---------|-------------|---------------|
| `telegram` | token-paste | `TELEGRAM_BOT_TOKEN` |
| `discord` | token-paste | `DISCORD_BOT_TOKEN` |
| `slack` | token-paste | Two tokens: `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` |
| `wechat` | host-qr | QR scan on the host, then static token flows in |
| `whatsapp` | in-sandbox-qr | Bot library owns session state inside the sandbox |

Each channel is defined by the same five-part pattern:

```
src/lib/messaging/channels/<name>/manifest.ts   ← TypeScript channel contract
nemoclaw-blueprint/policies/presets/<name>.yaml  ← OpenShell network policy preset
agents/hermes/policy-additions.yaml             ← Hermes base policy entry (filtering stub)
agents/hermes/manifest.yaml                     ← Agent declares platform support
src/lib/messaging/channels/built-ins.ts         ← Registry entry (import + array push)
```

The channel manifest is the source of truth. Everything else — `KNOWN_CHANNELS`, `ChannelDef`,
render steps, credential storage — is derived from it automatically at runtime.

---

## Step-by-Step: Adding a New Channel

The steps below show exactly what was done to add Matrix. Follow the same pattern for any future channel (Signal, Mattermost, etc.).

---

### Step 1 — Create the channel manifest

Create a new directory and manifest file:

```
src/lib/messaging/channels/<name>/manifest.ts
```

The manifest must satisfy `ChannelManifest` from `src/lib/messaging/manifest.ts`.
Minimum required sections:

```typescript
export const myChannelManifest = {
  schemaVersion: 1,
  id: "mychannel",                  // lowercase, matches directory name
  displayName: "My Channel",
  description: "My channel bot messaging via <library>",
  enrollmentNotes: [
    "Step 1: create a bot account...",
  ],
  supportedAgents: ["hermes"],       // "openclaw", "hermes", or both
  auth: {
    mode: "token-paste",             // or "host-qr" or "in-sandbox-qr"
  },
  inputs: [...],         // user-facing prompts during onboarding
  credentials: [...],    // how secrets are stored / resolved at runtime
  policyPresets: [...],  // which preset YAML to apply
  render: [...],         // what gets written to .env and config.yaml
  state: {...},          // which values survive a rebuild
  hooks: [...],          // enrollment flow (token-paste, config-prompt, etc.)
} as const satisfies ChannelManifest;
```

#### What Matrix added to the manifest

**`inputs[]`** — seven entries covering the full auth + config surface:

| Input ID | Env key | Kind | Required |
|----------|---------|------|----------|
| `homeserver` | `MATRIX_HOMESERVER` | config | Yes |
| `accessToken` | `MATRIX_ACCESS_TOKEN` | secret | Yes |
| `allowedUsers` | `MATRIX_ALLOWED_USERS` | config | No |
| `allowedRooms` | `MATRIX_ALLOWED_ROOMS` | config | No |
| `requireMention` | `MATRIX_REQUIRE_MENTION` | config | No |
| `autoThread` | `MATRIX_AUTO_THREAD` | config | No |
| `sessionScope` | `MATRIX_SESSION_SCOPE` | config | No |

**`credentials[]`** — one entry storing the access token via OpenShell provider:
```typescript
{
  id: "matrixAccessToken",
  sourceInput: "accessToken",
  providerName: "{sandboxName}-matrix-bridge",
  providerEnvKey: "MATRIX_ACCESS_TOKEN",
  placeholder: "openshell:resolve:env:MATRIX_ACCESS_TOKEN",
}
```
This means the actual token is stored in OpenShell's credential store, not in plaintext in `.env`.
The `.env` file gets the `openshell:resolve:env:…` placeholder instead.

**`render[]`** — three steps that write config into the sandbox:

| Render ID | Kind | Target | What it writes |
|-----------|------|--------|----------------|
| `matrix-hermes-env` | `env-lines` | `~/.hermes/.env` | `MATRIX_HOMESERVER`, credential placeholder, `MATRIX_ALLOWED_USERS`, `MATRIX_ALLOWED_ROOMS` |
| `matrix-hermes-config` | `json-fragment` | `~/.hermes/config.yaml` | `matrix.require_mention`, `matrix.auto_thread`, `matrix.session_scope` |
| `matrix-hermes-platform` | `json-fragment` | `~/.hermes/config.yaml` | `platforms.matrix.enabled = true` |

**`hooks[]`** — two enrollment steps:
1. `common.tokenPaste` — prompts user to paste the access token
2. `common.configPrompt` — prompts for all non-secret inputs

**`state.persist` + `state.rebuildHydration`** — ensures all values survive a `nemoclaw rebuild`:
```typescript
state: {
  persist: {
    matrixConfig: ["homeserver", "allowedUsers", "allowedRooms", "requireMention", "autoThread", "sessionScope"],
  },
  rebuildHydration: [
    { statePath: "matrixConfig.homeserver", env: "MATRIX_HOMESERVER" },
    // ... one entry per persisted value
  ],
},
```

---

### Step 2 — Create the network policy preset

Create: `nemoclaw-blueprint/policies/presets/<name>.yaml`

This is the opt-in preset users apply with `nemoclaw <sandbox> policy-add <name>`.

**Minimal structure (cloud homeserver):**
```yaml
preset:
  name: mychannel
  description: "My Channel API access"

network_policies:
  mychannel:
    name: mychannel
    endpoints:
      - host: api.mychannel.example.com
        port: 443
        protocol: rest
        enforcement: enforce
        rules:
          - allow: { method: GET, path: "/**" }
          - allow: { method: POST, path: "/**" }
    binaries:
      - { path: /usr/local/bin/hermes }
      - { path: /usr/bin/python3* }
      - { path: /opt/hermes/.venv/bin/python }
```

**Extra for local/private-IP homeservers (what Matrix needed):**

When the server runs on `host.docker.internal` (WSL2 / local Docker), OpenShell's SSRF guard
blocks the request because the resolved IP is a private-range address. You must add `allowed_ips`:

```yaml
endpoints:
  - host: host.docker.internal
    port: 8081
    protocol: rest
    enforcement: enforce
    allowed_ips:
      - 10.0.0.0/8
      - 172.16.0.0/12
      - 192.168.0.0/16
    rules:
      - allow: { method: GET, path: "/_matrix/**" }
      - allow: { method: POST, path: "/_matrix/**" }
      # ... etc
```

The `policyPresets` section in the manifest must reference this preset by name:
```typescript
policyPresets: [
  {
    name: "matrix",
    agentPolicyKeys: {
      hermes: ["matrix"],     // key names in this YAML file
    },
  },
],
```

---

### Step 3 — Add a filtering stub to the Hermes base policy

File: `agents/hermes/policy-additions.yaml`

Add a named entry under `network_policies:` that matches the channel name.
This entry is **filtered out** by NemoClaw at sandbox creation time if the user did not select
the channel — so a Telegram-only sandbox never gets Matrix egress.

```yaml
network_policies:
  # ... existing entries ...

  mychannel:
    name: mychannel
    endpoints:
      - host: api.mychannel.example.com
        port: 443
        protocol: rest
        enforcement: enforce
        rules:
          - allow: { method: GET, path: "/**" }
          - allow: { method: POST, path: "/**" }
    binaries:
      - { path: /usr/local/bin/hermes }
      - { path: /usr/bin/python3* }
      - { path: /opt/hermes/.venv/bin/python }
```

> **Why two policy files?**
> `policy-additions.yaml` is the sandbox base policy (always included, then filtered).
> `nemoclaw-blueprint/policies/presets/<name>.yaml` is the opt-in preset applied post-install.
> Most users apply the preset during onboarding; the filtering stub in the base policy covers
> the case where the channel was selected at build time.

---

### Step 4 — Declare the platform in the agent manifest

File: `agents/hermes/manifest.yaml`

Add the channel name to the `messaging_platforms.supported` list:

```yaml
messaging_platforms:
  supported:
    - telegram
    - discord
    - slack
    - wechat
    - whatsapp
    - matrix        # ← added here
    - mychannel     # ← add yours here
  # Future: ...
```

Before Matrix this line was in the `# Future:` comment. Moving a channel from the comment to
the `supported:` list is the declaration that NemoClaw knows how to wire it up.

---

### Step 5 — Register in the channel manifest registry

File: `src/lib/messaging/channels/built-ins.ts`

Three lines, all in the same place:

```typescript
// 1. Import the manifest
import { myChannelManifest } from "./mychannel/manifest";

// 2. Re-export it (so tests and consumers can import from the index)
export { myChannelManifest } from "./mychannel/manifest";

// 3. Add to the array (order determines display order in `nemoclaw channels list`)
export const BUILT_IN_CHANNEL_MANIFESTS = [
  telegramManifest,
  discordManifest,
  wechatManifest,
  slackManifest,
  whatsappManifest,
  matrixManifest,
  myChannelManifest,  // ← add here
] as const;
```

After this, `KNOWN_CHANNELS` in `src/lib/sandbox/channels.ts` automatically picks it up —
`channelDefFromManifest()` derives the full `ChannelDef` from the manifest at startup.

---

### Step 6 — Update tests

Three test files need updating:

#### `src/lib/messaging/channels/manifests.test.ts`

Add your manifest to the import and to any test that enumerates all channels:
```typescript
import { myChannelManifest, ... } from "./index";
```

#### `src/lib/messaging/channels/metadata.test.ts`

Add your channel's env keys to any test that checks the full channel list:
```typescript
// The test that verifies all channels have env metadata:
["matrix", "MATRIX_HOMESERVER", "MATRIX_ALLOWED_USERS", "MATRIX_REQUIRE_MENTION"],
["mychannel", "MYCHANNEL_HOMESERVER", ...],
```

#### `src/lib/messaging/diagnostics.test.ts`

If your channel has a diagnostics log pattern, add it. If not, add the channel to the
"no diagnostics" list.

#### `src/lib/sandbox/channels.test.ts`

The test at line `"covers telegram, discord, wechat, slack, whatsapp, and matrix"` asserts
`knownChannelNames()` returns an exact ordered list — add your channel to it:
```typescript
expect(knownChannelNames()).toEqual([
  "telegram", "discord", "wechat", "slack", "whatsapp", "matrix", "mychannel",
]);
```

---

### Step 7 — (Hermes only) Add platform defaults to the config builder

File: `agents/hermes/config/hermes-config.ts`

In `buildHermesConfig()`, add a block to `platforms` for the new channel.
These are the build-time defaults that exist before any user configuration is applied.
The manifest render steps override them at `channels add` time.

```typescript
platforms: {
  api_server: { ... },
  matrix: { ... },     // existing
  mychannel: {
    enabled: true,
    // whatever Hermes documents as the default config keys
  },
},
```

---

## Summary Checklist

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/messaging/channels/<name>/manifest.ts` | **Create** — full channel contract |
| 2 | `nemoclaw-blueprint/policies/presets/<name>.yaml` | **Create** — opt-in network policy |
| 3 | `agents/hermes/policy-additions.yaml` | **Add** named network policy entry |
| 4 | `agents/hermes/manifest.yaml` | **Add** channel name to `supported:` list |
| 5 | `src/lib/messaging/channels/built-ins.ts` | **Add** import, re-export, array entry |
| 6 | Tests (3 files) | **Update** channel enumerations |
| 7 | `agents/hermes/config/hermes-config.ts` | **Add** platform defaults block (Hermes only) |

---

## What You Get for Free (No Extra Code)

Once the manifest is registered, the following work automatically:

- `nemoclaw channels add <name>` — full enrollment flow (prompts, token storage, render)
- `nemoclaw channels list` — channel appears in output
- `nemoclaw policy-add <name>` — policy preset applied
- `KNOWN_CHANNELS.<name>` — `ChannelDef` derived from manifest
- Rebuild hydration — values restored from sandbox state on `nemoclaw rebuild`
- Credential placeholder resolution — OpenShell injects the real token at gateway start
- Channel filtering — sandbox only gets egress rules for selected channels

---

## Differences from OpenClaw Channels

If you also need to support OpenClaw (not just Hermes), add a second render step:
```typescript
{
  id: "mychannel-openclaw-channel",
  kind: "json-fragment",
  agent: "openclaw",
  target: "openclaw.json",
  fragment: {
    path: "channels.mychannel",
    value: { enabled: true, token: "{{credential.myChannelToken.placeholder}}" },
  },
},
```

And add `"openclaw"` to `supportedAgents` in the manifest.
The `policyPresets[].policyKeys` (without `agentPolicyKeys`) covers the OpenClaw side;
`agentPolicyKeys.hermes` covers the Hermes side separately.
