// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";

import { resolveOpenshell } from "../adapters/openshell/resolve";
import { run, runCapture, shellQuote } from "../runner";

export interface OpenshellCliDeps {
  getCachedBinary(): string | null;
  setCachedBinary(binary: string): void;
  getGatewayPort(): number;
  getDockerDriverGatewayEndpoint(): string;
}

export interface OpenshellCliHelpers {
  getOpenshellBinary(): string;
  openshellShellCommand(args: string[], options?: { openshellBinary?: string }): string;
  openshellArgv(args: string[], options?: { openshellBinary?: string }): string[];
  runOpenshell(args: string[], opts?: any): ReturnType<typeof run>;
  runCaptureOpenshell(args: string[], opts?: any): string;
  safeOpenShellArgument(value: string, label: string): string;
  getGatewayPortArg(): string;
  getDockerDriverGatewayEndpointArg(): string;
}

export function createOpenshellCliHelpers(deps: OpenshellCliDeps): OpenshellCliHelpers {
  function getOpenshellBinary(): string {
    const cached = deps.getCachedBinary();
    if (cached) return cached;
    const resolved = resolveOpenshell();
    if (typeof resolved !== "string" || resolved.length === 0) {
      console.error("  openshell CLI not found.");
      console.error("  Install manually: https://github.com/NVIDIA/OpenShell/releases");
      process.exit(1);
    }
    deps.setCachedBinary(resolved);
    return resolved;
  }

  function resolveWslOpenshellPath(): string | null {
    try {
      // Prefer the user-local install (latest from install script) over any system-wide binary.
      // Expand $HOME explicitly so we get the real WSL home, not a Git Bash translation.
      const r = spawnSync(
        "wsl",
        [
          "bash",
          "-l", // login shell so $HOME is set
          "-c",
          [
            "LOCAL=$HOME/.local/bin/openshell",
            '[ -x "$LOCAL" ] && "$LOCAL" --version >/dev/null 2>&1 && echo "$LOCAL" && exit',
            "which openshell 2>/dev/null || true",
          ].join("; "),
        ],
        { encoding: "utf-8" },
      );
      const p = r.stdout?.trim().split("\n")[0]?.trim();
      return p?.startsWith("/") ? p : null;
    } catch {
      return null;
    }
  }

  function openshellShellCommand(
    args: string[],
    options: { openshellBinary?: string } = {},
  ): string {
    const openshellBinary = options.openshellBinary || getOpenshellBinary();
    // On Windows the resolved binary is a .cmd shim. bash -lc (Git Bash login shell) loses
    // the Windows PATH so `wsl` is not found, and Git Bash translates POSIX paths even
    // inside arguments. Fix: wrap in `wsl.exe bash -c '...'` and set MSYS_NO_PATHCONV=1
    // so Git Bash does not mangle the inner WSL paths before passing them to wsl.exe.
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(openshellBinary)) {
      const wslBin = resolveWslOpenshellPath() ?? "openshell";
      const wslExe = "/c/Windows/System32/wsl.exe";
      const innerCmd = [shellQuote(wslBin), ...args.map((arg) => shellQuote(arg))].join(" ");
      // -l = login shell inside WSL so PATH/HOME are set (e.g. Docker CLI is available)
      return `MSYS_NO_PATHCONV=1 ${wslExe} bash -l -c ${shellQuote(innerCmd)}`;
    }
    return [shellQuote(openshellBinary), ...args.map((arg) => shellQuote(arg))].join(" ");
  }

  function openshellArgv(args: string[], options: { openshellBinary?: string } = {}): string[] {
    const openshellBinary = options.openshellBinary || getOpenshellBinary();
    return [openshellBinary, ...args];
  }

  function runOpenshell(args: string[], opts: any = {}) {
    return run(openshellArgv(args, opts), opts);
  }

  function runCaptureOpenshell(args: string[], opts: any = {}) {
    return runCapture(openshellArgv(args, opts), opts);
  }

  function safeOpenShellArgument(value: string, label: string): string {
    if (!/^[A-Za-z0-9._~:/-]+$/.test(value)) {
      throw new Error(`Invalid ${label}: contains characters unsafe for OpenShell CLI args`);
    }
    return value;
  }

  function getGatewayPortArg(): string {
    return safeOpenShellArgument(String(deps.getGatewayPort()), "gateway port");
  }

  function getDockerDriverGatewayEndpointArg(): string {
    return safeOpenShellArgument(deps.getDockerDriverGatewayEndpoint(), "gateway endpoint");
  }

  return {
    getOpenshellBinary,
    openshellShellCommand,
    openshellArgv,
    runOpenshell,
    runCaptureOpenshell,
    safeOpenShellArgument,
    getGatewayPortArg,
    getDockerDriverGatewayEndpointArg,
  };
}
