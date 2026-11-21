const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") return json({ok:true,service:"zehn-bartar",ai:!!env.AI,features:{chat:true,imageAnalysis:true,imageGeneration:true,transcription:true},limits:{chatMessages:30,imageBytes:3*1024*1024,audioBytes:4*1024*1024}});
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({error:"روش درخواست پشتیبانی نمی‌شود."},405);
    const declaredSize=Number(request.headers.get("content-length")||0);
    if (declaredSize>8*1024*1024) return json({error:"حجم درخواست بیش از حد مجاز است."},413);
    if (!env.AI) return json({error:"اتصال Workers AI در تنظیمات Cloudflare فعال نشده است."},503);
    let body;
    try { body=await request.json(); } catch { return json({error:"درخواست نامعتبر است."},400); }
    try {
      if (url.pathname === "/api/chat") {
        const messages=Array.isArray(body.messages)?body.messages.slice(-24):[];
        if (!messages.length) return json({error:"پیام خالی است."},400);
        const normalized=messages.filter(m=>m&&typeof m==="object").map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,10000)})).filter(m=>m.content.trim());
        if (!normalized.length) return json({error:"متن پیام معتبر نیست."},400);
        if (body.image) {
          const mime=String(body.mimeType||"image/jpeg").toLowerCase();
          const data=String(body.image).replace(/^data:[^,]+,/,"");
          if (!["image/jpeg","image/png","image/webp"].includes(mime)||data.length>4_500_000) return json({error:"تصویر نامعتبر یا بیش از حد بزرگ است."},413);
          normalized[normalized.length-1]={role:"user",content:[
            {type:"text",text:normalized[normalized.length-1].content||"این تصویر را بررسی و توضیح بده."},
            {type:"image_url",image_url:{url:"data:"+mime+";base64,"+data}}
          ]};
        }
        const model=body.image?"@cf/moonshotai/kimi-k2.5":"@cf/zai-org/glm-4.7-flash";
        const result=await env.AI.run(model,{messages:[{role:"system",content:"تو دستیار فارسی‌زبان دقیق، ایمن و کاربردی هستی. پاسخ‌ها را به فارسی روشن و منظم بده. اگر چیزی را نمی‌دانی صریح بگو."},...normalized],max_tokens:1200});
        const reply=result?.response||result?.choices?.[0]?.message?.content||result?.result?.response;
        return reply?json({reply}):json({error:"مدل پاسخ قابل‌خواندن نداد."},502);
      }
      if (url.pathname === "/api/transcribe") {
        const audio=String(body.audio||"").replace(/^data:[^,]+,/,"");
        if (!audio||audio.length>5_600_000) return json({error:"فایل صوتی خالی یا بیش از حد بزرگ است."},413);
        const result=await env.AI.run("@cf/openai/whisper-large-v3-turbo",{audio,task:"transcribe"});
        return json({text:result?.text||""});
      }
      if (url.pathname === "/api/image") {
        const prompt=String(body.prompt||"").trim().slice(0,1500);
        if (!prompt) return json({error:"توضیح تصویر را وارد کنید."},400);
        const result=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt});
        const output=result?.image||result;
        if (!output) return json({error:"تصویر ساخته نشد."},502);
        let bytes;
        if (typeof output==="string") {const raw=atob(output);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}
        else if (output instanceof Uint8Array) bytes=output;
        else if (output instanceof ArrayBuffer) bytes=new Uint8Array(output);
        else if (output && typeof output.getReader==="function") bytes=await new Response(output).arrayBuffer();
        else return json({error:"قالب تصویر دریافتی پشتیبانی نمی‌شود."},502);
        return new Response(bytes,{headers:{"content-type":"image/png","cache-control":"no-store"}});
      }
      return json({error:"مسیر API پیدا نشد."},404);
    } catch(error) { return json({error:String(error?.message||"خطا در اجرای هوش مصنوعی").slice(0,300)},502); }
  }
};