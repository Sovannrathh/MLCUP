// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildWorldcupUpstreamHeader } from "./upstream-header.ts";
import { toYaml } from "./yaml.ts";

export type WrittenWorldcupConfig = {
  configPath: string;
  envPath: string;
  envEntryCount: number;
};

export function writeWorldcupConfigFiles(
  config: Record<string, unknown>,
  envLines: string[],
  homeDir: string = homedir(),
): WrittenWorldcupConfig {
  const configPath = join(homeDir, ".worldcup", "config.yaml");
  writeFileSync(configPath, `${buildWorldcupUpstreamHeader(config)}${toYaml(config)}`);
  chmodSync(configPath, 0o600);

  const envPath = join(homeDir, ".worldcup", ".env");
  writeFileSync(envPath, envLines.length > 0 ? `${envLines.join("\n")}\n` : "");
  chmodSync(envPath, 0o600);

  return {
    configPath,
    envPath,
    envEntryCount: envLines.length,
  };
}
