#!/usr/bin/env node
// @ts-nocheck
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Host-side WorldCup tool gateway broker.
 *
 * Proxies sandbox tool requests to the WorldCup API, injecting the
 * host-managed API key so the sandbox never holds raw credentials.
 */

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = parseInt(process.env.WORLDCUP_TOOL_GATEWAY_PORT || "11437", 10);
const STATE_DIR = process.env.WORLDCUP_TOOL_GATEWAY_STATE_DIR;
const MATRIX_PATH =
  process.env.WORLDCUP_TOOL_GATEWAY_MATRIX_PATH ||
  path.join(__dirname, "managed-tool-gateway-matrix.json");
const CREDENTIAL_ENV =
  process.env.WORLDCUP_TOOL_GATEWAY_CREDENTIAL_ENV || "WORLDCUP_API_KEY";

const UPSTREAM_REQUEST_TIMEOUT_MS = 60_000;

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);
const DECODED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "content-md5"]);
const STRIPPED_SECRET_HEADERS = new Set(["authorization", "cookie", "x-api-key", "api-key"]);

function loadMatrix() {
  try {
    const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
    return Object.fromEntries(
      Object.values(matrix)
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => [entry.service, entry])
        .filter(([service, entry]) => typeof service === "string" && typeof entry.upstream === "string"),
    );
  } catch (error) {
    console.error(`failed to load WorldCup tool gateway matrix: ${error.message || error}`);
    process.exit(1);
  }
}

const MATRIX = loadMatrix();

function parseRoute(reqUrl) {
  const url = new URL(reqUrl || "/", "http://broker.local");
  const parts = url.pathname.split("/").filter(Boolean);
  const service = parts[0] || "";
  const entry = MATRIX[service];
  if (!entry) return null;
  const upstreamBase = String(entry.upstream).replace(/\/+$/, "");
  const suffix = "/" + parts.slice(1).join("/");
  return {
    service,
    entry,
    upstreamUrl: upstreamBase + (suffix === "/" ? "/" : suffix) + (url.search || ""),
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function buildForwardHeaders(req, apiKey) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "content-length" || lower === "accept-encoding") continue;
    if (HOP_BY_HOP_HEADERS.has(lower) || STRIPPED_SECRET_HEADERS.has(lower)) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  headers["accept-encoding"] = "identity";
  headers["authorization"] = `Bearer ${apiKey}`;
  return headers;
}

function forwardResponseHeaders(upstreamResp) {
  const headers = {};
  upstreamResp.headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || DECODED_RESPONSE_HEADERS.has(lower) || lower === "set-cookie") return;
    headers[name] = value;
  });
  return headers;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function handleProxy(req, res, route) {
  const apiKey = (process.env[CREDENTIAL_ENV] || "").trim();
  if (!apiKey) {
    sendText(res, 401, "WorldCup API key not configured. Set " + CREDENTIAL_ENV + " in the host environment.");
    return;
  }

  let body;
  try {
    body = await readRequestBody(req);
  } catch {
    sendText(res, 400, "failed to read request body");
    return;
  }

  let upstreamResp;
  try {
    upstreamResp = await fetch(route.upstreamUrl, {
      method: req.method,
      headers: buildForwardHeaders(req, apiKey),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isAbort = err && (err.name === "AbortError" || err.name === "TimeoutError");
    sendText(res, isAbort ? 504 : 502, isAbort ? "upstream request timed out" : "upstream request failed");
    return;
  }

  const buffer = Buffer.from(await upstreamResp.arrayBuffer());
  res.writeHead(upstreamResp.status, forwardResponseHeaders(upstreamResp));
  res.end(buffer);
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(async () => {
      if (req.url === "/health") {
        sendJson(res, 200, { ok: true, services: Object.keys(MATRIX).sort() });
        return;
      }
      const route = parseRoute(req.url);
      if (!route) {
        sendText(res, 404, "unknown WorldCup tool gateway route");
        return;
      }
      await handleProxy(req, res, route);
    })
    .catch((err) => {
      console.error(`WorldCup tool gateway internal error: ${err?.message || err}`);
      if (!res.headersSent) sendText(res, 500, "WorldCup tool gateway internal error");
      else res.end();
    });
});

server.listen(PORT, "0.0.0.0", () => {
  console.error(`WorldCup tool gateway broker listening on :${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
