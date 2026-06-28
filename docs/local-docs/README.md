# local-docs

Plain Markdown files for local setup, contributor workflows, and integration notes.
No build step — readable directly on GitHub or any Markdown viewer.

---

## What Is This?

**Hermes** is an AI agent that runs inside an isolated OpenShell sandbox managed by NemoClaw.
NemoClaw handles the sandbox lifecycle (build, start, stop, rebuild, snapshot) and network policy.
Hermes itself provides the chat UI, OpenAI-compatible API, and messaging integrations.

**Matrix** is one of those messaging integrations — you connect a running Hermes sandbox to a
Matrix homeserver so Hermes can send and receive messages in Matrix rooms.

Start with the Hermes setup below. Add Matrix once Hermes is running.

---

## Hermes Setup

| File | Description |
|------|-------------|
| [hermes/prerequisites.md](hermes/prerequisites.md) | Hardware, software, and platform requirements — read first |
| [hermes/windows-preparation.md](hermes/windows-preparation.md) | WSL2 + Docker Desktop setup for Windows users — do this before the quickstart |
| [hermes/quickstart-hermes.md](hermes/quickstart-hermes.md) | Install NemoClaw, onboard Hermes, connect the dashboard and API |

**Suggested reading order:** prerequisites → windows-preparation (Windows only) → quickstart-hermes

---

## Add Matrix to Hermes

Once Hermes is running, you can connect it to a Matrix homeserver.

| File | Description |
|------|-------------|
| [matrix/local-synapse.md](matrix/local-synapse.md) | Connect Hermes to a local Synapse homeserver on WSL2 — quickest path to a working Matrix setup |
| [matrix/config-structure.md](matrix/config-structure.md) | Architecture reference: every file, env var, and data flow in the Matrix integration |
| [matrix/add-channel.md](matrix/add-channel.md) | Contributor guide: how the channel system works and how to add a new messaging channel |
| [matrix/issues-encountered.md](matrix/issues-encountered.md) | Log of bugs hit during the Matrix integration, with root causes and fixes |

---

## Reference

| File | Description |
|------|-------------|
| [command-reference.md](command-reference.md) | Quick-reference for OpenShell, NemoClaw/NemoHermes, and Hermes CLI commands |
| [create-agent/plan.md](create-agent/plan.md) | How to add a brand-new agent (not Hermes, not OpenClaw) to NemoClaw |

---

## Guidelines

- Plain `.md` only — no MDX, no frontmatter build directives.
- One topic per file.
- Keep filenames lowercase with hyphens.
