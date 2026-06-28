# Prerequisites

Before you start, verify that your machine has the software and hardware needed to run NemoClaw.

---

## Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 vCPU | 4+ vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free | 40 GB free |

The sandbox image is approximately 2.4 GB compressed. On machines with less than 8 GB of RAM, configure at least 8 GB of swap to avoid OOM during image push.

---

## Software

| Dependency | Version |
|------------|---------|
| Node.js | 22.16 or later |
| npm | 10 or later |
| Docker | Docker Engine, Docker Desktop, or Colima |

On Linux, the installer can install Docker, start the service, and add your user to the `docker` group.
If the group change is not active in the current shell, the installer exits with `newgrp docker` guidance before starting onboarding.

On macOS, start Docker Desktop or Colima before running the installer.

On Debian/Ubuntu, NemoClaw installs `zstd` automatically if missing. On other Linux distros, install it first:
```bash
sudo apt-get install -y binutils zstd
```

> **Warning:** Do not use `openshell self-update`, `openshell gateway start --recreate`, or `openshell sandbox create` directly. Always use `nemoclaw onboard` for lifecycle operations.

---

## Platforms

| OS | Container runtime | Status | Notes |
|----|-------------------|--------|-------|
| Linux | Docker | Tested | Primary path |
| macOS (Apple Silicon) | Colima, Docker Desktop | Tested with limitations | Run `xcode-select --install` first |
| DGX Spark | Docker | Tested | Use standard installer |
| Windows WSL2 | Docker Desktop (WSL backend) | Tested with limitations | See [windows-preparation.md](windows-preparation.md) first |

---

## Next Steps

- **Windows users:** complete [windows-preparation.md](windows-preparation.md) before continuing.
- **All users:** follow [quickstart-hermes.md](quickstart-hermes.md) to install and launch Hermes.
