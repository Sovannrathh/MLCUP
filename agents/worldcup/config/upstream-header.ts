// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const HEADER_VALUE_MAX_LENGTH = 128;

function sanitizeHeaderValue(value: string): string {
  const stripped = value.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return stripped.length > HEADER_VALUE_MAX_LENGTH
    ? stripped.slice(0, HEADER_VALUE_MAX_LENGTH)
    : stripped;
}

export function buildWorldcupUpstreamHeader(config: Record<string, unknown>): string {
  const upstream = config._nemoclaw_upstream;
  if (!upstream || typeof upstream !== "object") return "";
  const u = upstream as Record<string, unknown>;
  const rawProvider = typeof u.provider === "string" ? u.provider : "";
  const rawModel = typeof u.model === "string" ? u.model : "";
  const provider = sanitizeHeaderValue(rawProvider);
  const model = sanitizeHeaderValue(rawModel);
  if (!provider && !model) return "";

  const lines = ["# Managed by NemoClaw — WorldCup configuration"];
  if (provider) lines.push(`# Upstream provider: ${provider}`);
  if (model) lines.push(`# Upstream model: ${model}`);
  lines.push("# OpenShell rewrites model.base_url to the upstream endpoint at request time.");
  return `${lines.join("\n")}\n`;
}
