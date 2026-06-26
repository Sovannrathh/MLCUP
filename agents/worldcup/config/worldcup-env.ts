// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { BuildSettings } from "./build-env.ts";

export function buildWorldcupEnvLines(settings: BuildSettings): string[] {
  const envLines = ["API_SERVER_PORT=18643", "API_SERVER_HOST=127.0.0.1"];
  return envLines;
}
