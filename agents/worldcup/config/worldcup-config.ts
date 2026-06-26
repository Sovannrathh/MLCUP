// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { BuildSettings } from "./build-env.ts";

const REMOTE_PLATFORM_TOOLSETS = [
  "web",
  "browser",
  "terminal",
  "file",
  "code_execution",
  "vision",
  "skills",
  "todo",
  "memory",
  "session_search",
  "nemoclaw",
];

function worldcupApiMode(inferenceApi: string): string | null {
  switch (inferenceApi) {
    case "":
    case "openai-completions":
      return null;
    case "anthropic-messages":
      return "anthropic_messages";
    case "openai-responses":
      return "codex_responses";
    default:
      throw new Error(`Unsupported WorldCup inference API: ${inferenceApi}`);
  }
}

export function buildWorldcupConfig(settings: BuildSettings): Record<string, unknown> {
  const modelConfig: Record<string, unknown> = {
    default: settings.model,
    provider: "custom",
    base_url: settings.baseUrl,
    api_key: "sk-OPENSHELL-PROXY-REWRITE",
  };
  const apiMode = worldcupApiMode(settings.inferenceApi);
  if (apiMode) modelConfig.api_mode = apiMode;

  const upstream: Record<string, unknown> = {
    provider: settings.upstreamProvider,
    model: settings.model,
  };

  const config: Record<string, unknown> = {
    _config_version: 1,
    _nemoclaw_upstream: upstream,
    model: modelConfig,
    terminal: {
      backend: "local",
      timeout: 180,
    },
    agent: {
      max_turns: 60,
      reasoning_effort: "medium",
    },
    memory: {
      memory_enabled: true,
      user_profile_enabled: true,
    },
    skills: {
      creation_nudge_interval: 15,
    },
    display: {
      compact: false,
      tool_progress: "all",
    },
    plugins: {
      enabled: ["nemoclaw"],
    },
    platform_toolsets: {
      api_server: [...REMOTE_PLATFORM_TOOLSETS],
    },
    platforms: {
      api_server: {
        enabled: true,
        extra: {
          port: 18643,
          host: "127.0.0.1",
        },
      },
      matrix: {
        enabled: true,
        auto_join: true,
        encryption: "optional",
        require_mention: true,
        auto_thread: true,
        dm_mention_threads: false,
        dm_auto_thread: false,
        reactions: true,
        allow_room_mentions: false,
        session_scope: "room",
        process_notices: false,
      },
    },
  };

  return config;
}
