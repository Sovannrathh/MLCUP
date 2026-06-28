import { Buffer } from "node:buffer";

export type BuildSettings = {
    model: string;
    baseUrl: string;
    providerKey: string;
    upstreamProvider: string;
    inferenceApi: string;
}

export function readBuildsetting(env: NodeJS.ProcessEnv) : BuildSettings {
    const model = readRequiredEnv(env, "NEMOCLAW_MODEL");
    const baseUrl = readRequiredEnv(env, "NEMOCLAW_INFERENCE_BASE_URL");
    return {
        model,
        baseUrl,
        providerKey: env.NEMOCLAW_PROVIDER_KEY || "custom",
        upstreamProvider: env.NEMOCLAW_UPSTREAM_PROVIDER || env.NEMOCLAW_PROVIDER_KEY || "custom",
        inferenceApi: env.NEMOCLAW_INFERENCE_API || "",
    }

}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}