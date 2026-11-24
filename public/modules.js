/* Zehn Bartar modular workspace: trading and coding tools. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const host = document.createElement("section");
  host.id = "zbModules";
  host.innerHTML = `
  <style>
  #zbModules{display:grid;gap:12px;margin:12px 0}
  .zb-mod{background:#111d30;border:1px solid #40516e;border-radius:16px;padding:14px}
  .zb-mod h2{font-size:18px;margin:0 0 8px}
  .zb-mod p{font-size:12px;color:#aab8ce;line-height:1.8}
  .zb-mod .line{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .zb-mod select,.zb-mod textarea{background:#0b1524;color:#f4f6fb;border:1px solid #394b68;border-radius:10px;padding:10px;font:inherit}
  .zb-mod select{min-width:110px}.zb-mod textarea{width:100%;min-height:100px}
  .zb-stat{background:#0c1728;border:1px solid #31425d;border-radius:10px;padding:10px;min-width:120px;flex:1}
  .zb-stat small{display:block;color:#9eacc4;font-size:11px}.zb-stat b{display:block;margin-top:5px;overflow-wrap:anywhere}
  .zb-mod pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#08111f;border:1px solid #293953;border-radius:10px;padding:12px;direction:ltr;text-align:left;max-height:360px;overflow:auto;font:12px/1.6 ui-monospace,monospace}
  .zb-mod button{margin-top:8px}
  .zb-good{color:#8de0b9}.zb-warn{color:#f4c77d}
  </style>
  <article class="zb-mod" id="zbTrading">
    <h2>تحلیل بازار و معاملات</h2>
    <p>داده‌های بازار از CoinGecko دریافت می‌شود. شاخص‌ها ابزار کمکی‌اند، نه سیگنال قطعی. این بخش فعلاً فقط تحلیل و پایش است و سفارش خریدوفروش ثبت نمی‌کند.</p>
    <div class="line"><select id="zbSymbol" aria-label="نماد بازار">
      <option>BTC</option><option>ETH</option><option>SOL</option><option>XRP</option><option>DOGE</option><option>ADA</option><option>TON</option><option>BNB</option><option>LTC</option><option>TRX</option>
    </select><button class="primary" id="zbAnalyze">تحلیل لحظه‌ای</button><span id="zbTradeStatus" class="zb-mod p">آماده دریافت داده</span></div>
    <div id="zbTradeStats" class="line" style="margin-top:10px"></div>
    <div id="zbTradeDetail"></div>
    <p class="zb-warn">مدیریت ریسک: پیش از هر تصمیم، حد ضرر، اندازه موقعیت، کارمزد، نقدشوندگی و امکان از دست‌رفتن کل سرمایه را بررسی کن.</p>
  </article>
  <article class="zb-mod" id="zbCodeLab">
    <h2>کارگاه برنامه‌نویسی و ساخت ابزار</h2>
    <p>شرح برنامه یا قابلیتی را بنویس تا دستیار طرح فنی و کد اولیه تولید کند. کد تولیدشده در این نسخه اجرا یا خودکار روی گوشی/سرور نصب نمی‌شود؛ قبل از استفاده باید بازبینی و آزمایش شود.</p>
    <textarea id="zbCodeRequest" maxlength="5000" placeholder="مثلاً یک صفحه مدیریت هزینه با ذخیره‌سازی محلی و رابط فارسی بساز..."></textarea>
    <div class="line"><button class="primary" id="zbGenerateCode">طراحی و تولید کد</button><button id="zbDownloadCode" disabled>ذخیره خروجی کد</button></div>
    <div id="zbCodeStatus" class="p"></div><pre id="zbCodeOutput" hidden></pre>
  </article>
  `;
  const chat = document.getElementById("chat");
  if (chat?.parentNode) chat.parentNode.insertBefore(host, chat);
  let latestCode = "";
  const fmt = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US",{maximumFractionDigits:8}) : "—";
  const stat = (label,value) => '<div class="zb-stat"><small>'+label+'</small><b>'+value+'</b></div>';
  $("zbAnalyze").addEventListener("click", async () => {
    const symbol = $("zbSymbol").value;
    const status = $("zbTradeStatus");
    const button = $("zbAnalyze");
    button.disabled = true; status.textContent = "در حال دریافت داده...";
    $("zbTradeStats").textContent = ""; $("zbTradeDetail").textContent = "";
    try {
      const response = await fetch("/api/trading/analysis?symbol="+encodeURIComponent(symbol));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "دریافت داده ناموفق بود.");
      const m = data.market || {}, i = data.indicators || {};
      $("zbTradeStats").innerHTML =
        stat("قیمت (دلار)", "$"+fmt(m.price))+
        stat("تغییر ۲۴ ساعت", fmt(m.change24h)+"٪")+
        stat("تغییر ۷ روز", fmt(m.change7d)+"٪")+
        stat("ارزش بازار", "$"+fmt(m.marketCap))+
        stat("RSI ۱۴", fmt(i.rsi14))+
        stat("روند محاسباتی", i.trend || "—");
      const lines = [
        "میانگین ۲۰ روزه: "+fmt(i.sma20),
        "میانگین ۵۰ روزه: "+fmt(i.sma50),
        "MACD: "+fmt(i.macd),
        "خط سیگنال MACD: "+fmt(i.macdSignal),
        "حجم ۲۴ ساعته: $"+fmt(m.volume24h),
        "زمان دریافت: "+new Date(data.fetchedAt).toLocaleString("fa-IR"),
        "منبع: "+data.source+" — "+data.sourceUrl
      ];
      const detail = document.createElement("pre"); detail.textContent = lines.join("\\n");
      $("zbTradeDetail").append(detail);
      status.textContent = "داده دریافت شد؛ تحلیل به‌روزرسانی شد.";
    } catch(error) { status.textContent = error.message || "خطا در دریافت داده"; }
    finally { button.disabled = false; }
  });
  $("zbGenerateCode").addEventListener("click", async () => {
    const request = $("zbCodeRequest").value.trim();
    if (!request) { $("zbCodeStatus").textContent = "شرح برنامه را وارد کن."; return; }
    const button = $("zbGenerateCode"); button.disabled = true;
    $("zbCodeStatus").textContent = "در حال طراحی و تولید کد...";
    $("zbCodeOutput").hidden = true; $("zbDownloadCode").disabled = true;
    try {
      const messages = [
        {role:"system",content:"تو مهندس ارشد نرم‌افزار هستی. به فارسی پاسخ بده. نیازمندی را خلاصه کن، معماری و ملاحظات امنیتی را مشخص کن و سپس کد کامل و قابل بازبینی ارائه بده. هیچ‌گاه ادعا نکن کد اجرا یا آزمایش شده مگر واقعاً اجرا شده باشد. از درج کلید، رمز یا اطلاعات محرمانه در کد خودداری کن. خروجی را با نام فایل و بلوک کد مشخص کن."},
        {role:"user",content:request}
      ];
      const response = await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "سرویس هوش مصنوعی پاسخ نداد.");
      latestCode = String(data.reply || "");
      if (!latestCode) throw new Error("پاسخ خالی دریافت شد.");
      $("zbCodeOutput").textContent = latestCode;
      $("zbCodeOutput").hidden = false; $("zbDownloadCode").disabled = false;
      $("zbCodeStatus").textContent = "پیش‌نویس آماده شد؛ پیش از اجرا بازبینی و آزمایش کن.";
    } catch(error) { $("zbCodeStatus").textContent = error.message || "تولید کد ناموفق بود."; }
    finally { button.disabled = false; }
  });
  $("zbDownloadCode").addEventListener("click", () => {
    if (!latestCode) return;
    const blob = new Blob([latestCode],{type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download="zehn-bartar-code-draft.txt"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
})();
