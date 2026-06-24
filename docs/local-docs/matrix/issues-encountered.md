# Matrix Integration — Issues Encountered

A log of every bug and misconfiguration hit while adding Matrix support to the Hermes sandbox.
Ordered chronologically (earliest first). Includes the symptom, root cause, and the fix applied.

---

## Issue 1 — Local Synapse unreachable: 172.21.0.1 timed out

**Commit:** `0cdb7ceaa` → `cbc414a63`

**Symptom:** Hermes gateway failed to connect to the local Synapse homeserver.
The policy was written for `172.21.0.1:8081` (the Docker bridge IP observed on the host),
but connections from inside the container timed out.

**Root cause:** `172.21.0.1` is the bridge IP as seen *from the host*, not from inside the
container. Inside a Docker container, `host.docker.internal` is the correct DNS name for
the host gateway, and it resolves to the real gateway IP automatically.

**Fix:** Replaced `172.21.0.1` with `host.docker.internal` in both the network policy
endpoint and the `MATRIX_HOMESERVER` default.

```yaml
# Before
- host: 172.21.0.1
  port: 8081

# After
- host: host.docker.internal
  port: 8081
```

---

## Issue 2 — SSRF guard blocked host.docker.internal

**Commit:** `0cdb7ceaa`

**Symptom:** Even after switching to `host.docker.internal`, OpenShell's SSRF guard blocked
the request because `host.docker.internal` resolves to a private-range IP
(e.g. `172.21.0.1`, `192.168.x.x`).

**Root cause:** OpenShell enforces SSRF protection by default. Any endpoint that resolves to
a private IP range is blocked unless the policy explicitly allowlists those ranges.

**Fix:** Added `allowed_ips` to the policy endpoint:
```yaml
allowed_ips:
  - 10.0.0.0/8
  - 172.16.0.0/12
  - 192.168.0.0/16
```

---

## Issue 3 — Bot didn't respond to any user messages

**Commit:** `864a88801`

**Symptom:** Hermes joined rooms but never responded to messages, even from the bot owner.

**Root cause:** The initial manifest set `MATRIX_ALLOWED_USERS` to a non-empty placeholder.
Hermes interprets a non-empty `MATRIX_ALLOWED_USERS` as a strict allowlist — anyone not on
the list is silently ignored.

**Fix:** Changed the default to empty so Hermes responds to any user in joined rooms.
Users who want to restrict access can set `MATRIX_ALLOWED_USERS` explicitly during onboarding.

---

## Issue 4 — Bot not joining rooms after being invited

**Commit:** `7db941b74`

**Symptom:** The bot account was invited to a Matrix room but Hermes never joined.
Messages sent to the room went unanswered.

**Root cause:** `auto_join` was not set in the `platforms.matrix` config block, so Hermes
left invitations pending indefinitely.

**Fix:** Added `auto_join: true` to the Matrix platform config in `hermes-config.ts`.

---

## Issue 5 — Bot failed to communicate in encrypted rooms (E2EE)

**Commit:** `631ce2df4`

**Symptom:** In rooms with encryption enabled, Hermes sent and received only `[Unable to decrypt]`
placeholders. Encrypted rooms appeared blank.

**Root cause:** The Hermes sandbox image had no E2EE libraries. `mautrix-python` needs
`libolm3` (C library) and the `mautrix[e2be]` Python extra to handle Matrix E2EE.

**Fix:** Added to `agents/hermes/Dockerfile`:
```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends libolm3 libolm-dev \
    && uv pip install --python /opt/hermes/.venv/bin/python --no-cache "mautrix[e2be]" \
    && apt-get remove --purge -y libolm-dev \
    && rm -rf /var/lib/apt/lists/*
```
Set `encryption: optional` in the config so the bot works in both encrypted and plain rooms.

---

## Issue 6 — mautrix[e2be] pip install failed (python-olm build error)

**Commit:** `1b583fe1d`

**Symptom:** Docker build failed during `pip install "mautrix[e2be]"` with errors about
missing `cmake`, `make`, `gcc`, and C headers.

**Root cause:** The `e2be` extra name is deprecated. The current extra is `mautrix[encryption]`.
`e2be` attempted to build `python-olm` from source, which requires native build tools not
present in the base image.

**Fix:** Switched the extra name and temporarily installed build tools:
```dockerfile
&& apt-get install -y --no-install-recommends libolm3 libolm-dev cmake make gcc g++ python3-dev \
&& uv pip install ... "mautrix[encryption]" \
&& apt-get remove --purge -y libolm-dev cmake make gcc g++ python3-dev \
```
Build tools are removed in the same `RUN` layer so they don't bloat the final image.

---

## Issue 7 — libolm-dev left in the final Docker image layer

**Commit:** `fd613d14e`

**Symptom:** The sandbox image was larger than necessary. `libolm-dev` (only needed at compile
time to build `python-olm`) was installed in one `RUN` layer and removed in a later `RUN` layer,
so Docker's layer diffing kept both layers in the final image.

**Root cause:** Docker image layers are additive. A file installed in layer N and deleted in
layer N+1 still exists in the layer N blob and contributes to image size.

**Fix:** Moved the `apt-get remove` of `libolm-dev` into the *same* `RUN` command as the
`apt-get install`, so the dev headers never appear in any committed layer.

---

## Issue 8 — YAML array parser bug: render threw on post-install

**Commit:** `640708939`

**Symptom:** Running `nemoclaw channels add matrix` on an already-onboarded sandbox failed
with a YAML parse error. The error only appeared when another platform (e.g. `api_server`)
was already present in `platform_toolsets`.

**Root cause:** The messaging build applier's YAML merge logic parsed `platform_toolsets`
as a plain array when the key had sibling entries. When the Matrix render step tried to
merge into it, the array assumption broke.

**Fix:** Fixed the YAML array-vs-object detection in
`src/lib/messaging/applier/build/messaging-build-applier.mts` to handle the case where
`platform_toolsets` contains sibling keys like `api_server` alongside platform entries.

---

## Issue 9 — Matrix mention/threading settings had no defaults

**Commit:** `640708939`

**Symptom:** After enabling Matrix, the bot responded to every message in every room,
including @other-user messages and room notices, which created noise.

**Root cause:** The `platforms.matrix` block in `hermes-config.ts` only had `auto_join` and
`encryption`. All other Hermes-documented defaults (`require_mention`, `auto_thread`,
`session_scope`, `reactions`, `process_notices`, etc.) were absent, so Hermes fell back
to its own internal defaults which were too permissive.

**Fix:** Added all eight documented default values to `buildHermesConfig()`:
```typescript
matrix: {
  auto_join: true,
  encryption: "optional",
  require_mention: true,
  auto_thread: true,
  dm_mention_threads: false,
  dm_auto_thread: false,
  reactions: true,
  allow_room_mentions: false,
  session_scope: "room",
  process_notices: false,
},
```

---

## Issue 10 — Duplicate Matrix policy in two places

**Commit:** `fd613d14e`

**Symptom:** The full Matrix network policy (with `host.docker.internal` and
`matrix.rexform.io` endpoints) existed in *both* `agents/hermes/policy-additions.yaml`
and `nemoclaw-blueprint/policies/presets/matrix.yaml`. Every Hermes sandbox got Matrix
egress even when the user hadn't selected the Matrix channel.

**Root cause:** The policy was added to the base Hermes policy during early development
before the preset system was understood. The base policy is always applied; the preset is
opt-in.

**Fix:** Removed the full Matrix block from `policy-additions.yaml`. Left only a minimal
stub entry (for the channel-filter mechanism). The full endpoint list lives exclusively
in the preset YAML.

---

## Issue 11 — Redundant MATRIX_* env defaults in hermes-env.ts

**Commit:** `fd613d14e`

**Symptom:** `MATRIX_HOMESERVER`, `MATRIX_ACCESS_TOKEN`, and `MATRIX_ALLOWED_USERS` were
hardcoded with placeholder defaults in `buildHermesEnvLines()`. This meant every Hermes
image had Matrix env vars even without the channel selected.

**Root cause:** The manifest render pipeline (`matrix-hermes-env` render step) already
writes these values into `.env` at channel enrollment time. Having them in the build-time
env was redundant and could override user-supplied values.

**Fix:** Removed the Matrix env lines from `hermes-env.ts`. The render template is the
sole source of these values.

---

## Issue 12 — Type error in metadata.ts selectManifests

**Commit:** `fd613d14e`

**Symptom:** TypeScript type check (`npm run typecheck:cli`) failed after adding Matrix
to the `supportedAgents` field, because `supportedAgents` was typed as a `readonly` tuple
and `.includes()` on a `readonly` tuple doesn't accept a `MessagingAgentId` argument
directly.

**Root cause:** The `supportedAgents` field on the manifest uses `as const` inference,
producing a narrow `readonly ["hermes"]` type. `Array.prototype.includes` expects the
argument to be assignable to the array element type, which broke when the input was
typed as the wider `MessagingAgentId`.

**Fix:** Added a type cast in `metadata.ts`:
```typescript
(manifest.supportedAgents as readonly MessagingAgentId[]).includes(agent)
```

---

## Issue 13 — Wrong homeserver port (8008 vs 8081)

**Commit:** `1b583fe1d` (added helper script)

**Symptom:** After onboarding, the gateway logged connection errors to
`http://host.docker.internal:8008`. The local nginx proxy listens on `8081`; Synapse's
direct HTTP API port `8008` was not exposed.

**Root cause:** The first iteration of the manifest used port `8008` (Synapse's default)
in the example URL in the homeserver prompt. Users (and the initial test run) copied this
value without realising the local setup runs behind nginx on `8081`.

**Fix:**
- Updated the prompt placeholder to show `8081` for the rexform.io local setup.
- Added `scripts/connect-matrix-now.sh` as a one-shot recovery script that patches
  `.env` in a running sandbox without requiring a full rebuild:
  ```bash
  sed -i 's|host.docker.internal:8008|host.docker.internal:8081|' /sandbox/.hermes/.env
  ```

---

## Issue 14 — No way to restrict which rooms the bot responds in

**Commit:** `3af680daf`

**Symptom:** The bot was invited to multiple test rooms and responded in all of them.
There was no way to limit it to specific rooms without editing `.env` manually.

**Root cause:** The initial manifest had `allowedUsers` but no `allowedRooms` input.
Hermes supports `MATRIX_ALLOWED_ROOMS` but NemoClaw had no way to configure it.

**Fix:** Added the `allowedRooms` input to the manifest with full state persistence
and rebuild hydration, following the same pattern as `allowedUsers`.

---

## Issue 15 — Default gateway port conflict (8080 vs 18080)

**Commit:** `1b583fe1d`

**Symptom:** The NemoClaw gateway failed to start — port `8080` was already in use on
the WSL2 host (occupied by another local service).

**Root cause:** `DEFAULT_GATEWAY_PORT` was set to `8080`, which clashed with a locally
running service on the development machine.

**Fix:** Changed `DEFAULT_GATEWAY_PORT` from `8080` to `18080` in `src/lib/core/ports.ts`
and updated the related comment in `gateway-binding.ts`.

---

## Summary Table

| # | Issue | Fixed in | File(s) changed |
|---|-------|----------|-----------------|
| 1 | `172.21.0.1` timed out — use `host.docker.internal` | `cbc414a63` | `policy-additions.yaml` |
| 2 | SSRF guard blocked private-IP gateway | `0cdb7ceaa` | `policy-additions.yaml` |
| 3 | Bot silent — `MATRIX_ALLOWED_USERS` too restrictive | `864a88801` | `manifest.ts` |
| 4 | Bot not joining rooms — `auto_join` missing | `7db941b74` | `hermes-config.ts` |
| 5 | Encrypted rooms blank — no E2EE libraries | `631ce2df4` | `Dockerfile` |
| 6 | `mautrix[e2be]` build failed — wrong extra name | `1b583fe1d` | `Dockerfile` |
| 7 | `libolm-dev` persisted in image layer | `fd613d14e` | `Dockerfile` |
| 8 | YAML parser bug in build applier | `640708939` | `messaging-build-applier.mts` |
| 9 | Missing mention/threading defaults | `640708939` | `hermes-config.ts` |
| 10 | Duplicate policy in base + preset | `fd613d14e` | `policy-additions.yaml` |
| 11 | Redundant `MATRIX_*` in `hermes-env.ts` | `fd613d14e` | `hermes-env.ts` |
| 12 | TypeScript type error in `selectManifests` | `fd613d14e` | `metadata.ts` |
| 13 | Wrong homeserver port 8008 vs 8081 | `1b583fe1d` | `connect-matrix-now.sh` |
| 14 | No room allowlist support | `3af680daf` | `manifest.ts` |
| 15 | Gateway port conflict — 8080 in use | `1b583fe1d` | `ports.ts` |
