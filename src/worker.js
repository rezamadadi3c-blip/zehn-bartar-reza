const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "access-control-max-age": "86400"
};
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS };
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const isBase64 = value => typeof value === "string" && value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "zehn-bartar",
        ai: !!env.AI,
        aiBinding: !!env.AI,
        features: { chat: true, imageAnalysis: true, imageGeneration: true, transcription: true },
        limits: { requestBytes: MAX_BODY_BYTES, chatMessages: 24, imageBytes: 3 * 1024 * 1024, audioBytes: 4 * 1024 * 1024 }
      });
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "روش درخواست پشتیبانی نمی‌شود." }, 405);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return json({ error: "نوع محتوای درخواست باید JSON باشد." }, 415);
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > MAX_BODY_BYTES) return json({ error: "حجم درخواست بیش از حد مجاز است." }, 413);

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "ساختار درخواست نامعتبر است." }, 400);
    } catch {
      return json({ error: "درخواست JSON نامعتبر است." }, 400);
    }
    if (url.pathname === "/api/search") {
      const query = String(body.query || "").trim().slice(0, 160);
      if (query.length < 2) return json({ error: "عبارت جست‌وجو باید دست‌کم ۲ نویسه باشد." }, 400);
      try {
        const endpoint = new URL("https://fa.wikipedia.org/w/api.php");
        endpoint.search = new URLSearchParams({
          action: "query", list: "search", srsearch: query, srlimit: "5",
          srprop: "snippet", format: "json", formatversion: "2", origin: "*"
        }).toString();
        const upstream = await fetch(endpoint.toString(), {
          headers: { "accept": "application/json", "user-agent": "ZehnBartar/1.0 (Persian assistant)" }
        });
        if (!upstream.ok) return json({ error: "سرویس جست‌وجو موقتاً پاسخ نمی‌دهد." }, 502);
        const data = await upstream.json();
        const results = (data?.query?.search || []).map(item => ({
          title: String(item.title || ""),
          snippet: String(item.snippet || "").replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&").slice(0, 500),
          url: "https://fa.wikipedia.org/?curid=" + encodeURIComponent(String(item.pageid))
        })).filter(item => item.title && item.url);
        return json({ query, source: "ویکی‌پدیای فارسی", results });
      } catch {
        return json({ error: "ارتباط با سرویس جست‌وجو برقرار نشد." }, 502);
      }
    }
    if (!env.AI) return json({ error: "اتصال Workers AI در تنظیمات Cloudflare فعال نشده است." }, 503);

    try {
      if (url.pathname === "/api/chat") {
        const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
        if (!messages.length) return json({ error: "پیام خالی است." }, 400);
        const normalized = messages
          .filter(m => m && typeof m === "object" && !Array.isArray(m))
          .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 10000) }))
          .filter(m => m.content.trim());
        if (!normalized.length) return json({ error: "متن پیام معتبر نیست." }, 400);

        if (body.image !== undefined) {
          const mime = String(body.mimeType || "").toLowerCase();
          const dataUrlPrefix = `data:${mime};base64,`;
          const imageValue = String(body.image || "");
          if (!["image/jpeg", "image/png", "image/webp"].includes(mime) ||
              !imageValue.startsWith(dataUrlPrefix) ||
              imageValue.length > 4_200_000 ||
              !isBase64(imageValue.slice(dataUrlPrefix.length))) {
            return json({ error: "تصویر نامعتبر است یا از حد مجاز بزرگ‌تر است." }, 413);
          }
          normalized[normalized.length - 1] = {
            role: "user",
            content: [
              { type: "text", text: normalized[normalized.length - 1].content || "این تصویر را بررسی و توضیح بده." },
              { type: "image_url", image_url: { url: imageValue } }
            ]
          };
        }

        const model = body.image ? "@cf/google/gemma-4-26b-a4b-it" : "@cf/zai-org/glm-4.7-flash";
        const result = await env.AI.run(model, {
          messages: [
            { role: "system", content: "تو دستیار فارسی‌زبان دقیق، ایمن و کاربردی هستی. پاسخ‌ها را به فارسی روشن و منظم بده. اگر چیزی را نمی‌دانی صریح بگو." },
            ...normalized
          ],
          max_tokens: 1200
        });
        const reply = result?.response || result?.choices?.[0]?.message?.content || result?.result?.response;
        return reply ? json({ reply }) : json({ error: "مدل پاسخ قابل‌خواندن نداد." }, 502);
      }

      if (url.pathname === "/api/transcribe") {
        const audioValue = String(body.audio || "");
        const match = audioValue.match(/^data:(audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
        if (!match || match[2].length > 5_600_000) return json({ error: "فایل صوتی نامعتبر یا بیش از حد بزرگ است." }, 413);
        const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: match[2], task: "transcribe" });
        return json({ text: result?.text || "" });
      }

      if (url.pathname === "/api/image") {
        const prompt = String(body.prompt || "").trim().slice(0, 1500);
        if (!prompt) return json({ error: "توضیح تصویر را وارد کنید." }, 400);
        const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt });
        const output = result?.image || result;
        if (!output) return json({ error: "تصویر ساخته نشد." }, 502);
        let bytes;
        if (typeof output === "string") {
          const raw = atob(output);
          bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        } else if (output instanceof Uint8Array) bytes = output;
        else if (output instanceof ArrayBuffer) bytes = new Uint8Array(output);
        else if (output && typeof output.getReader === "function") bytes = new Uint8Array(await new Response(output).arrayBuffer());
        else return json({ error: "قالب تصویر دریافتی پشتیبانی نمی‌شود." }, 502);
        return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "no-store", ...CORS_HEADERS } });
      }

      return json({ error: "مسیر API پیدا نشد." }, 404);
    } catch (error) {
      return json({ error: String(error?.message || "خطا در اجرای هوش مصنوعی").slice(0, 300) }, 502);
    }
  }
};
