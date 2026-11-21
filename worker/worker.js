export default {
  async fetch(request, env) {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Content-Type": "application/json; charset=utf-8" };
    const json = (body, status=200) => new Response(JSON.stringify(body), { status, headers: cors });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!env.GEMINI_API_KEY || !env.APP_TOKEN) return json({ error: "Server secrets are not configured" }, 503);
    if ((request.headers.get("Authorization") || "") !== "Bearer " + env.APP_TOKEN) return json({ error: "Unauthorized" }, 401);
    try {
      const body = await request.json();
      if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: "messages is required" }, 400);
      const contents = body.messages.slice(-30).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content || "").slice(0, 12000) }] }));
      const last = contents[contents.length - 1];
      if (body.attachment && typeof body.attachment.dataUrl === "string") {
        const match = body.attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return json({ error: "Invalid attachment" }, 400);
        if (match[2].length > 11000000) return json({ error: "Attachment too large" }, 413);
        last.parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
      const model = env.GEMINI_MODEL || "gemini-2.5-flash";
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: "You are Zehn Bartar, a helpful, accurate assistant. Reply in Persian when the user writes Persian. Be honest about uncertainty and never invent sources." }] }, contents, generationConfig: { temperature: 0.65, maxOutputTokens: 2048 } })
      });
      const result = await upstream.json();
      if (!upstream.ok) return json({ error: result?.error?.message || "AI provider request failed" }, 502);
      const reply = result?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
      if (!reply) return json({ error: "The AI provider returned no text" }, 502);
      return json({ reply });
    } catch (e) { return json({ error: "Invalid request or upstream failure" }, 400); }
  }
}