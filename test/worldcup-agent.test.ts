// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

// ── yaml.ts ──────────────────────────────────────────────────────────────────
import { toYaml } from "../agents/worldcup/config/yaml.ts";

describe("worldcup toYaml", () => {
  it("serializes a flat string/number/boolean object", () => {
    const out = toYaml({ name: "worldcup", port: 8643, enabled: true });
    expect(out).toContain("name: worldcup");
    expect(out).toContain("port: 8643");
    expect(out).toContain("enabled: true");
  });

  it("wraps strings containing special YAML characters in quotes", () => {
    const out = toYaml({ url: "http://localhost:8643/v1" });
    expect(out).toMatch(/url: "http:\/\/localhost:8643\/v1"/);
  });

  it("serializes nested objects with indentation", () => {
    const out = toYaml({ model: { default: "gpt-4o", provider: "custom" } });
    expect(out).toContain("model:");
    expect(out).toContain("  default: gpt-4o");
    expect(out).toContain("  provider: custom");
  });

  it("serializes arrays of strings", () => {
    const out = toYaml({ skills: ["memory", "web", "terminal"] });
    expect(out).toContain("- memory");
    expect(out).toContain("- web");
    expect(out).toContain("- terminal");
  });

  it("renders empty array as []", () => {
    const out = toYaml({ presets: [] });
    expect(out).toContain("presets: []");
  });

  it("renders null values", () => {
    const out = toYaml({ optional: null });
    expect(out).toContain("optional: null");
  });
});

// ── upstream-header.ts ───────────────────────────────────────────────────────
import { buildWorldcupUpstreamHeader } from "../agents/worldcup/config/upstream-header.ts";

describe("buildWorldcupUpstreamHeader", () => {
  it("returns empty string when _nemoclaw_upstream is missing", () => {
    expect(buildWorldcupUpstreamHeader({})).toBe("");
  });

  it("includes provider and model lines when both are set", () => {
    const header = buildWorldcupUpstreamHeader({
      _nemoclaw_upstream: { provider: "nvidia", model: "llama-3.3-70b" },
    });
    expect(header).toContain("# Managed by NemoClaw — WorldCup configuration");
    expect(header).toContain("# Upstream provider: nvidia");
    expect(header).toContain("# Upstream model: llama-3.3-70b");
  });

  it("strips control characters from header values", () => {
    const header = buildWorldcupUpstreamHeader({
      _nemoclaw_upstream: { provider: "bad\x00provider", model: "clean-model" },
    });
    expect(header).not.toContain("\x00");
    expect(header).toContain("badprovider");
  });

  it("truncates header values longer than 128 chars", () => {
    const longModel = "m".repeat(200);
    const header = buildWorldcupUpstreamHeader({
      _nemoclaw_upstream: { provider: "test", model: longModel },
    });
    const modelLine = header.split("\n").find((l) => l.startsWith("# Upstream model:"));
    expect(modelLine).toBeDefined();
    expect(modelLine!.length).toBeLessThanOrEqual("# Upstream model: ".length + 128);
  });
});

// ── worldcup-config.ts ───────────────────────────────────────────────────────
import { buildWorldcupConfig } from "../agents/worldcup/config/worldcup-config.ts";
import type { BuildSettings } from "../agents/worldcup/config/build-env.ts";

const BASE_SETTINGS: BuildSettings = {
  model: "llama-3.3-70b",
  baseUrl: "http://inference.local/v1",
  providerKey: "nvidia",
  upstreamProvider: "nvidia",
  inferenceApi: "",
};

describe("buildWorldcupConfig", () => {
  it("sets model fields from settings", () => {
    const config = buildWorldcupConfig(BASE_SETTINGS);
    const model = config.model as Record<string, unknown>;
    expect(model.default).toBe("llama-3.3-70b");
    expect(model.base_url).toBe("http://inference.local/v1");
    expect(model.provider).toBe("custom");
  });

  it("enables the nemoclaw plugin", () => {
    const config = buildWorldcupConfig(BASE_SETTINGS);
    const plugins = config.plugins as { enabled: string[] };
    expect(plugins.enabled).toContain("nemoclaw");
  });

  it("puts api_server on internal port 18643", () => {
    const config = buildWorldcupConfig(BASE_SETTINGS);
    const platforms = config.platforms as Record<string, unknown>;
    const apiServer = platforms.api_server as Record<string, unknown>;
    const extra = apiServer.extra as Record<string, unknown>;
    expect(extra.port).toBe(18643);
    expect(extra.host).toBe("127.0.0.1");
  });

  it("enables matrix platform", () => {
    const config = buildWorldcupConfig(BASE_SETTINGS);
    const platforms = config.platforms as Record<string, unknown>;
    const matrix = platforms.matrix as Record<string, unknown>;
    expect(matrix.enabled).toBe(true);
  });

  it("sets api_mode for anthropic-messages inferenceApi", () => {
    const config = buildWorldcupConfig({ ...BASE_SETTINGS, inferenceApi: "anthropic-messages" });
    const model = config.model as Record<string, unknown>;
    expect(model.api_mode).toBe("anthropic_messages");
  });

  it("throws for unknown inferenceApi", () => {
    expect(() =>
      buildWorldcupConfig({ ...BASE_SETTINGS, inferenceApi: "unknown-api" }),
    ).toThrow("Unsupported WorldCup inference API");
  });

  it("stores upstream provider in _nemoclaw_upstream", () => {
    const config = buildWorldcupConfig(BASE_SETTINGS);
    const upstream = config._nemoclaw_upstream as Record<string, unknown>;
    expect(upstream.provider).toBe("nvidia");
    expect(upstream.model).toBe("llama-3.3-70b");
  });
});

// ── worldcup-env.ts ──────────────────────────────────────────────────────────
import { buildWorldcupEnvLines } from "../agents/worldcup/config/worldcup-env.ts";

describe("buildWorldcupEnvLines", () => {
  it("always includes API_SERVER_PORT and API_SERVER_HOST", () => {
    const lines = buildWorldcupEnvLines(BASE_SETTINGS);
    expect(lines).toContain("API_SERVER_PORT=18643");
    expect(lines).toContain("API_SERVER_HOST=127.0.0.1");
  });
});
