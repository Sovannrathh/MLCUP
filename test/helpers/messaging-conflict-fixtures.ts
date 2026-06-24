// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { SandboxMessagingPlan } from "../../src/lib/messaging/manifest";
import type { SandboxMessagingState } from "../../src/lib/state/registry";
import type { ConflictRegistryEntry } from "../../src/lib/messaging/applier/conflict-detection";

export function makePlan(
  sandboxName: string,
  overrides: Partial<SandboxMessagingPlan> = {},
): SandboxMessagingPlan {
  return {
    schemaVersion: 1,
    sandboxName,
    agent: "hermes",
    workflow: "onboard",
    channels: [],
    disabledChannels: [],
    credentialBindings: [],
    networkPolicy: { presets: [], entries: [] },
    agentRender: [],
    buildSteps: [],
    stateUpdates: [],
    healthChecks: [],
    ...overrides,
  };
}


export function planEntry(name: string, plan: SandboxMessagingPlan): ConflictRegistryEntry {
  const state: SandboxMessagingState = { schemaVersion: 1, plan };
  return { name, messaging: state };
}
