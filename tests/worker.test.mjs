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

test("search rejects an empty query without requiring AI", async () => {
  const response = await worker.fetch(request("/api/search", { query: " " }), { ASSETS: env.ASSETS });
  assert.equal(response.status, 400);
});

test("search returns normalized Wikipedia sources", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /fa\.wikipedia\.org\/w\/api\.php/);
    return Response.json({ query: { search: [
      { title: "هوش مصنوعی", pageid: 123, snippet: "<span>شاخه‌ای از علوم رایانه</span>" }
    ] } });
  };
  try {
    const response = await worker.fetch(request("/api/search", { query: "هوش مصنوعی" }), { ASSETS: env.ASSETS });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].title, "هوش مصنوعی");
    assert.equal(data.results[0].snippet, "شاخه‌ای از علوم رایانه");
    assert.match(data.results[0].url, /curid=123/);
  } finally { globalThis.fetch = originalFetch; }
});

test("search reports upstream failures safely", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 503 });
  try {
    const response = await worker.fetch(request("/api/search", { query: "آزمایش" }), { ASSETS: env.ASSETS });
    assert.equal(response.status, 502);
  } finally { globalThis.fetch = originalFetch; }
});

test("web search merges Brave and Tavily results without exposing API keys", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, headers: options.headers || {} });
    if (target.includes("api.search.brave.com")) {
      return Response.json({ web: { results: [
        { title: "Brave result", description: "A web result", url: "https://example.com/a" }
      ] } });
    }
    if (target.includes("api.tavily.com")) {
      return Response.json({ results: [
        { title: "Tavily result", content: "Another web result", url: "https://example.org/b" }
      ] });
    }
    throw new Error("Unexpected search provider");
  };
  try {
    const response = await worker.fetch(request("/api/search", { query: "آزمایش وب" }), {
      BRAVE_SEARCH_API_KEY: "server-secret-brave",
      TAVILY_API_KEY: "server-secret-tavily"
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.mode, "web");
    assert.deepEqual(data.providers.sort(), ["Brave", "Tavily"]);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].source, "Brave");
    assert.equal(data.results[1].source, "Tavily");
    assert.ok(calls.some(call => call.target.includes("api.search.brave.com")));
    assert.ok(calls.some(call => call.target.includes("api.tavily.com")));
    assert.ok(!JSON.stringify(data).includes("server-secret"));
  } finally { globalThis.fetch = originalFetch; }
});
