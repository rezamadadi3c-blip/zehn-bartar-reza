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


test("trading analysis returns market data and technical indicators from CoinGecko", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/coins/markets?")) return Response.json([{
      id: "bitcoin", name: "Bitcoin", current_price: 65000, market_cap: 1200000000000,
      total_volume: 30000000000, price_change_percentage_24h: 2.1, price_change_percentage_7d: 5.2
    }]);
    if (target.includes("/market_chart?")) {
      const now = Date.UTC(2026, 10, 24);
      return Response.json({ prices: Array.from({ length: 90 }, (_, i) => [now - (89 - i) * 86400000, 50000 + i * 100]) });
    }
    throw new Error("Unexpected market-data endpoint: " + target);
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/trading/analysis?symbol=BTC"), { ASSETS: env.ASSETS });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.symbol, "BTC");
    assert.equal(data.market.price, 65000);
    assert.equal(data.indicators.trend, "مثبت");
    assert.equal(data.history.length, 90);
    assert.equal(data.source, "CoinGecko");
  } finally { globalThis.fetch = originalFetch; }
});

test("trading analysis rejects unsupported symbols", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/trading/analysis?symbol=FAKE"), { ASSETS: env.ASSETS });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.match(data.error, /نماد پشتیبانی نمی‌شود/);
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

test("AI diagnostics performs a real minimal model inference", async () => {
  let model = "";
  const diagnosticEnv = {
    AI: { run: async (name, input) => { model = name; assert.equal(input.max_tokens, 1400); return { response: "OK" }; } },
    ASSETS: env.ASSETS
  };
  const response = await worker.fetch(request("/api/diagnostics", {}), diagnosticEnv);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.ai, true);
  assert.equal(model, "@cf/zai-org/glm-4.7-flash");
});

test("AI diagnostics clearly reports a missing Workers AI binding", async () => {
  const response = await worker.fetch(request("/api/diagnostics", {}), { ASSETS: env.ASSETS });
  const data = await response.json();
  assert.equal(response.status, 503);
  assert.equal(data.ai, false);
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
    assert.deepEqual(data.results.map(item => item.source).sort(), ["Brave", "Tavily"]);
    assert.ok(calls.some(call => call.target.includes("api.search.brave.com")));
    assert.ok(calls.some(call => call.target.includes("api.tavily.com")));
    assert.ok(!JSON.stringify(data).includes("server-secret"));
  } finally { globalThis.fetch = originalFetch; }
});

test("API rate limits are enforced per client IP and endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ query: { search: [] } });
  try {
    let last;
    for (let i = 0; i < 21; i++) {
      const req = new Request("https://example.test/api/search", {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.77" },
        body: JSON.stringify({ query: "rate test" })
      });
      last = await worker.fetch(req, { ASSETS: env.ASSETS });
    }
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get("retry-after")) >= 1);
  } finally { globalThis.fetch = originalFetch; }
});


test("chat falls back to Gemini when Cloudflare inference fails", async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async (url, options = {}) => {
    requested = String(url).includes("generativelanguage.googleapis.com");
    assert.equal(options.headers["x-goog-api-key"], "test-gemini-key");
    return Response.json({ candidates: [{ content: { parts: [{ text: "پاسخ از Gemini" }] } }] });
  };
  try {
    const fallbackEnv = {
      AI: { run: async () => { throw new Error("Cloudflare unavailable"); } },
      GEMINI_API_KEY: "test-gemini-key",
      ASSETS: env.ASSETS
    };
    const response = await worker.fetch(request("/api/chat", {
      messages: [{ role: "user", content: "سلام" }]
    }), fallbackEnv);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.reply, "پاسخ از Gemini");
    assert.equal(data.provider, "Google Gemini 2.5 Flash-Lite");
    assert.equal(requested, true);
  } finally { globalThis.fetch = originalFetch; }
});
