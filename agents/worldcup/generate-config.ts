// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Generate WorldCup config.yaml and .env from NemoClaw build-arg env vars.
//
// Called at Docker image build time. Reads NEMOCLAW_* env vars and writes:
//   ~/.worldcup/config.yaml  — WorldCup configuration (immutable at runtime)
//   ~/.worldcup/.env         — Base environment placeholders (immutable at runtime)

import { readBuildsetting } from "./config/build-env.ts";
import { buildWorldcupEnvLines } from "./config/worldcup-env.ts";
import { buildWorldcupConfig } from "./config/worldcup-config.ts";
import { discoverModelSpecificSetups } from "./config/model-specific-setup.ts";
import { writeWorldcupConfigFiles } from "./config/write-config.ts";

function main(): void {
  const settings = readBuildsetting(process.env);
  discoverModelSpecificSetups(
    "worldcup",
    {
      model: settings.model,
      providerKey: settings.providerKey,
      inferenceApi: settings.inferenceApi,
      baseUrl: settings.baseUrl,
    },
    {
      env: process.env,
      scriptDir: import.meta.dirname,
    },
  );

  const config = buildWorldcupConfig(settings);
  const envLines = buildWorldcupEnvLines(settings);
  const written = writeWorldcupConfigFiles(config, envLines);

  console.log(`[config] Wrote ${written.configPath} (model=${settings.model}, provider=custom)`);
  console.log(`[config] Wrote ${written.envPath} (${written.envEntryCount} entries)`);
}

main();
