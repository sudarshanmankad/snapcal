const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const PORT = 8797;

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath.startsWith("/snapcal/")) urlPath = urlPath.slice("/snapcal".length) || "/";
  const file = path.join(root, urlPath.replace(/^\//, ""));
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  let ct = "application/octet-stream";
  if (file.endsWith(".html")) ct = "text/html; charset=utf-8";
  if (file.endsWith(".js")) ct = "application/javascript";
  res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", {
    waitUntil: "domcontentloaded"
  });
  await page.evaluate(async () => {
    localStorage.setItem(
      "snapcal-settings",
      JSON.stringify({
        geminiKey: "AIzaSyTESTKEYFORLOCALMOCKONLY000",
        model: "gemini-3.5-flash",
        useLlm: true
      })
    );
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#logBtn");

  // Patch confirm by wrapping fetch and also monkeypatch after load via exposed hook
  await page.evaluate(() => {
    window.__calls = [];
    window.fetch = async function (url, opts) {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const parts = (((body.contents || [])[0] || {}).parts) || [];
      const text = parts.map((p) => p.text || "").join(" ");
      if (/Reply with exactly:\s*OK/i.test(text)) {
        return new Response(
          JSON.stringify({
            candidates: [
              { finishReason: "STOP", content: { parts: [{ text: "OK" }] } }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      const half = /typed how much they ate:\s*"[^"]*\bhalf\b/i.test(text);
      window.__calls.push({
        half: half,
        note: (text.match(/typed how much they ate:\s*"([^"]*)"/i) || [])[1] || null
      });
      const mult = half ? 0.5 : 1;
      const item = {
        name: "KIND",
        detail: (half ? "0.5" : "1") + " serving",
        kcal: Math.round(200 * mult),
        protein: 5,
        carbs: 8,
        fat: 7.5,
        grade: "said",
        warn: "mock"
      };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify([item]) }] }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
  });

  const input = await page.$("#chatCam");
  await input.uploadFile(path.join(root, "artifacts/fake-label.jpg"));
  await page.waitForFunction(
    () => !document.getElementById("chatPhotoWrap").classList.contains("hide")
  );
  await page.evaluate(() => {
    document.getElementById("text").value = "half a serving";
  });
  console.log(
    "pre",
    await page.evaluate(() => document.getElementById("text").value)
  );
  await page.click("#logBtn");
  await page.waitForFunction(
    () => !document.getElementById("sheet").classList.contains("hide"),
    { timeout: 15000 }
  );
  const out = await page.evaluate(() => ({
    sheet: document.getElementById("sheetBody").innerText.slice(0, 300),
    calls: window.__calls,
    text: document.getElementById("text").value,
    // detect which branch string is in HTML
    html: document.getElementById("sheetBody").innerHTML.slice(0, 400)
  }));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
