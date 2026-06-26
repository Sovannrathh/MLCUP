// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync, spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

export interface ResolveOpenshellOptions {
  /** Mock result for `command -v` (undefined = run real command). */
  commandVResult?: string | null;
  /** Override executable check (default: fs.accessSync X_OK). */
  checkExecutable?: (path: string) => boolean;
  /** HOME directory override. */
  home?: string;
}

/**
 * Resolve the openshell binary path.
 *
 * Checks `command -v` first (must return an absolute path to prevent alias
 * injection), then falls back to common installation directories.
 */
export function resolveOpenshell(opts: ResolveOpenshellOptions = {}): string | null {
  const home = opts.home ?? process.env.HOME;
  const checkExecutable =
    opts.checkExecutable ??
    ((p: string): boolean => {
      try {
        // On Windows, X_OK is not meaningful for .cmd/.bat files — just check existence
        if (process.platform === "win32" && /\.(cmd|bat|exe)$/i.test(p)) {
          accessSync(p, constants.F_OK);
        } else {
          accessSync(p, constants.X_OK);
        }
        return true;
      } catch {
        return false;
      }
    });

  const override = process.env.NEMOCLAW_OPENSHELL_BIN;
  const isAbsolute = (p: string) =>
    p.startsWith("/") || (process.platform === "win32" && /^[A-Za-z]:[/\\]/.test(p));
  if (override && isAbsolute(override) && checkExecutable(override)) {
    return override;
  }

  // Step 1: PATH lookup — `where` on Windows, `command -v` on POSIX
  if (opts.commandVResult === undefined) {
    try {
      let found: string | undefined;
      if (process.platform === "win32") {
        const r = spawnSync("where", ["openshell"], { encoding: "utf-8" });
        found = r.stdout?.trim().split("\n")[0]?.trim();
      } else {
        found = execSync("command -v openshell", { encoding: "utf-8" }).trim();
      }
      if (found && isAbsolute(found)) return found;
    } catch {
      /* ignored */
    }
  } else if (opts.commandVResult && isAbsolute(opts.commandVResult)) {
    return opts.commandVResult;
  }

  // Step 2: fallback candidates
  const winHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const candidates = [
    ...(process.platform === "win32"
      ? [
          // .cmd shim preferred (routes through wsl openshell)
          ...(winHome
            ? [
                `${winHome}\\.local\\bin\\openshell.cmd`,
                `${winHome}\\.local\\bin\\openshell.exe`,
                `${winHome}\\.local\\bin\\openshell`,
              ]
            : []),
          `${process.env.LOCALAPPDATA ?? ""}\\Programs\\openshell\\openshell.exe`,
        ]
      : [
          ...(home?.startsWith("/") ? [`${home}/.local/bin/openshell`] : []),
          "/usr/local/bin/openshell",
          "/usr/bin/openshell",
        ]),
  ];
  for (const p of candidates) {
    if (checkExecutable(p)) return p;
  }

  return null;
}
