// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_TEST_TIMEOUT_MS = 30_000;

export function testTimeout(override?: number): number {
  if (override !== undefined) return override;
  const env = process.env.NEMOCLAW_TEST_TIMEOUT_MS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TEST_TIMEOUT_MS;
}
