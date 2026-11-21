import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const env = { AI: { run: async () => ({ response: "ok" }) }, ASSETS: { fetch: async () => new Response("asset") } };
const request = (path, body, headers = {}) => new Request("https://example.test" + path, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

test("health reports service and AI binding", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/health"), env);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.aiBinding, true);
});

test("unknown non-API paths are served from assets", async () => {
  const response = await worker.fetch(new Request("https://example.test/"), env);
  assert.equal(await response.text(), "asset");
});

test("API rejects methods other than POST", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/chat"), env);
  assert.equal(response.status, 405);
});

test("API rejects non-JSON content types", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "hello"
  }), env);
  assert.equal(response.status, 415);
});

test("API rejects malformed JSON", async () => {
  const response = await worker.fetch(request("/api/chat", "{broken"));
  assert.equal(response.status, 400);
});

test("chat rejects empty messages", async () => {
  const response = await worker.fetch(request("/api/chat", { messages: [] }), env);
  assert.equal(response.status, 400);
});

test("image analysis rejects malformed data URLs before model invocation", async () => {
  const response = await worker.fetch(request("/api/chat", {
    messages: [{ role: "user", content: "describe" }],
    image: "not-a-data-url",
    mimeType: "image/jpeg"
  }), env);
  assert.equal(response.status, 413);
});

test("transcription rejects malformed audio data URLs", async () => {
  const response = await worker.fetch(request("/api/transcribe", { audio: "not-a-data-url" }), env);
  assert.equal(response.status, 413);
});


test("image analysis uses the free-tier Gemma 4 vision model", async () => {
  let usedModel = "";
  const visionEnv = {
    AI: { run: async model => { usedModel = model; return { response: "تصویر بررسی شد" }; } },
    ASSETS: { fetch: async () => new Response("asset") }
  };
  const image = "data:image/jpeg;base64," + "A".repeat(16);
  const response = await worker.fetch(request("/api/chat", {
    messages: [{ role: "user", content: "این چیست؟" }],
    image,
    mimeType: "image/jpeg"
  }), visionEnv);
  assert.equal(response.status, 200);
  assert.equal(usedModel, "@cf/google/gemma-4-26b-a4b-it");
});

test("unknown API paths return 404", async () => {
  const response = await worker.fetch(request("/api/missing", {}), env);
  assert.equal(response.status, 404);
});
