// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export function shouldRunInstallerIntegration(): boolean {
  return process.env.NEMOCLAW_RUN_INSTALLER_TESTS === "1";
}

export function shouldRunLiveE2EScenarios(): boolean {
  return process.env.NEMOCLAW_RUN_E2E_SCENARIOS === "1";
}

export function shouldRunBranchValidationE2E(): boolean {
  return (
    process.env.NEMOCLAW_RUN_BRANCH_VALIDATION_E2E === "1" ||
    Boolean(process.env.BREV_API_TOKEN || process.env.BREV_API_KEY)
  );
}
