export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "zehn-bartar", ai: Boolean(env.AI || env.AI_API_KEY) });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
      const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
      if (!messages.length) return Response.json({ error: "پیام خالی است." }, { status: 400 });
      const safeMessages = [
        { role: "system", content: "تو دستیار فارسی‌زبان دقیق و مفید هستی. پاسخ‌ها را روشن و به زبان فارسی ارائه کن." },
        ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 12000) }))
      ];
      try {
        if (env.AI) {
          const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: safeMessages });
          const reply = result?.response || result?.result?.response || result?.output_text;
          if (!reply) return Response.json({ error: "مدل ابری پاسخ قابل‌خواندن نداد." }, { status: 502 });
          return Response.json({ reply });
        }
        if (!env.AI_API_KEY) return Response.json({ error: "اتصال هوش ابری هنوز در Cloudflare فعال نشده است." }, { status: 503 });
        const endpoint = env.AI_API_URL || "https://api.groq.com/openai/v1/chat/completions";
        const model = env.AI_MODEL || "llama-3.3-70b-versatile";
        const upstream = await fetch(endpoint, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.AI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: safeMessages, temperature: 0.7 })
        });
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) return Response.json({ error: data?.error?.message || "سرویس هوش مصنوعی پاسخ نداد." }, { status: 502 });
        const reply = data?.choices?.[0]?.message?.content;
        if (!reply) return Response.json({ error: "پاسخی دریافت نشد." }, { status: 502 });
        return Response.json({ reply });
      } catch {
        return Response.json({ error: "ارتباط با هوش ابری برقرار نشد؛ وضعیت سرویس و سهمیه را بررسی کنید." }, { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};