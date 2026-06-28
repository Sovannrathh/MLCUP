# Windows Preparation (WSL2)

Prepare a Windows machine for NemoClaw before running the Quickstart. Linux and macOS users can skip this page.

> Tested on x86-64. Windows 10 build 19041+ or Windows 11 required.

---

## Option A — Bootstrap Script (Recommended)

Open **Windows PowerShell** (not WSL) and run:

```powershell
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/NVIDIA/NemoClaw/main/scripts/bootstrap-windows.ps1' -OutFile "$env:TEMP\bootstrap-windows.ps1"; powershell.exe -ExecutionPolicy Bypass -File "$env:TEMP\bootstrap-windows.ps1"
```

The script:
- Enables WSL2 Windows features
- Installs Ubuntu 24.04
- Installs and starts Docker Desktop
- Enables Docker Desktop WSL integration for Ubuntu
- Prompts for a reboot if needed (continues automatically on next sign-in)

When complete, it opens Ubuntu and prints the NemoClaw installer command to run inside it.

**Useful script parameters:**
```powershell
# Use an existing distro named "Ubuntu" instead of Ubuntu-24.04
.\bootstrap-windows.ps1 -DistroName Ubuntu

# Get full help
Get-Help "$env:TEMP\bootstrap-windows.ps1" -Detailed
```

---

## Option B — Manual Steps

### 1. Enable WSL2

Open an **elevated PowerShell** (Run as Administrator):

```powershell
wsl --install --no-distribution
```

Reboot if prompted.

### 2. Install Ubuntu

After reboot, open an elevated PowerShell again:

```powershell
wsl --install -d Ubuntu-24.04
```

Let it launch, complete first-run setup (set a Unix username and password), then type `exit`.

> **Do not** use `--no-launch` — it downloads the package but does not register the distro, so `wsl -d Ubuntu-24.04` will fail.

Verify WSL2 is active:

```powershell
wsl -l -v
```

Expected output:
```text
  NAME            STATE           VERSION
* Ubuntu-24.04    Running         2
```

### 3. Install Docker Desktop

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with the WSL2 backend.

After installation: **Docker Desktop Settings → Resources → WSL integration** — enable integration for Ubuntu-24.04.

Verify from inside WSL:

```powershell
wsl
```

```bash
docker info
```

If you see "Cannot connect to the Docker daemon": confirm Docker Desktop is running and WSL integration is enabled.

---

## Optional: Ollama for Local Inference

**Inside WSL:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve   # start if not already running
```

Or use **Ollama for Windows** — NemoClaw detects it from WSL via `host.docker.internal`. Do not run both the Windows and WSL Ollama instances on port `11434` at the same time.

---

## Next Step

Open a WSL terminal (type `wsl` in PowerShell or open Ubuntu from Windows Terminal) and follow [quickstart-hermes.md](quickstart-hermes.md).

All NemoClaw commands run inside WSL, not in PowerShell.

---

## Troubleshooting

**`winget` not found** — install **App Installer** from the Microsoft Store, or download Docker Desktop manually. Rerun the bootstrap script after installation.

**Docker not reachable after bootstrap** — open Docker Desktop → Settings → Resources → WSL integration, enable Ubuntu-24.04, then rerun the script.

**WSL version shows 1 instead of 2** — convert with:
```powershell
wsl --set-version Ubuntu-24.04 2
```
