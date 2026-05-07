#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import {
  controlDefinition,
  describeKeycode,
  getDeviceStatus,
  listControls,
  normalizeKeycode,
  readAllControls,
  readLiveInput,
  repoRoot,
  setControl,
} from "../lib/doio-core.mjs";

const publicDir = resolve(repoRoot, "ui");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createDoioServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }
      await serveStatic(response, url.pathname);
    } catch (error) {
      sendJson(response, statusFor(error), { ok: false, error: error.message });
    }
  });
}

export function startDoioServer({ port = Number(process.env.PORT ?? 5176), host = process.env.HOST ?? "127.0.0.1" } = {}) {
  const server = createDoioServer();
  return new Promise((resolveStarted, rejectStarted) => {
    server.once("error", rejectStarted);
    server.listen(port, host, () => {
      server.off("error", rejectStarted);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const url = `http://${host}:${actualPort}`;
      resolveStarted({ server, url, host, port: actualPort });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDoioServer().then(({ url }) => {
    console.log(`DOIO app listening at ${url}`);
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, { ok: true, device: getDeviceStatus() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/controls") {
    sendJson(response, 200, {
      ok: true,
      definition: {
        name: controlDefinition.name,
        orientation: controlDefinition.orientation,
        naming: controlDefinition.naming,
      },
      controls: listControls(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bindings") {
    const layer = parseHumanLayer(url.searchParams.get("layer"));
    const firmwareLayer = layer - 1;
    const bindings = readAllControls(firmwareLayer);
    sendJson(response, 200, {
      ok: true,
      layer,
      firmwareLayer,
      bindings,
      descriptions: describeBindings(bindings),
      readAt: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/live-input") {
    const layer = parseHumanLayer(url.searchParams.get("layer"));
    const firmwareLayer = layer - 1;
    const live = readLiveInput(firmwareLayer);
    sendJson(response, 200, {
      ok: true,
      ...live,
      layer,
      firmwareLayer,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/binding") {
    const body = await readJson(request);
    const layer = parseHumanLayer(body.layer);
    const firmwareLayer = layer - 1;
    if (!body.control || !body.value) {
      throw Object.assign(new Error("control and value are required"), { statusCode: 400 });
    }
    const result = setControl(body.control, body.value, firmwareLayer);
    sendJson(response, 200, {
      ok: true,
      ...result,
      layer,
      firmwareLayer,
      output: describeKeycode(result.keycode),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/translate") {
    const body = await readJson(request);
    if (!body.value) throw Object.assign(new Error("value is required"), { statusCode: 400 });
    const keycode = normalizeKeycode(body.value);
    sendJson(response, 200, {
      ok: true,
      value: body.value,
      keycode,
      output: describeKeycode(keycode),
    });
    return;
  }

  throw Object.assign(new Error("Not found"), { statusCode: 404 });
}

async function serveStatic(response, pathname) {
  const cleanPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(publicDir, cleanPath));
  if (!filePath.startsWith(publicDir)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_768) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

function parseHumanLayer(value) {
  const layer = value === null || value === undefined || value === "" ? 1 : Number(value);
  if (!Number.isInteger(layer) || layer < 1 || layer > controlDefinition.layers) {
    throw Object.assign(new Error(`layer must be an integer from 1 to ${controlDefinition.layers}`), { statusCode: 400 });
  }
  return layer;
}

function describeBindings(bindings) {
  return Object.fromEntries(
    Object.entries(bindings).map(([name, keycode]) => [name, describeKeycode(keycode)]),
  );
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function statusFor(error) {
  return Number.isInteger(error.statusCode) ? error.statusCode : 500;
}
