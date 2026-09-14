/**
 * E2E: Today note + label photo → mocked Gemini → confirm → save.
 */
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = __dirname;
const PORT = 8791;

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webmanifest") || p.endsWith(".json")) return "application/manifest+json";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath.startsWith("/snapcal/")) urlPath = urlPath.slice("/snapcal".length) || "/";
  const file = path.join(root, urlPath.replace(/^\//, ""));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("missing " + urlPath);
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

async function attachLabelPhoto(page, labelPath) {
  const input = await page.$("#chatCam");
  if (!input) throw new Error("#chatCam missing");
  await input.uploadFile(labelPath);
  await page.waitForFunction(() => {
    const wrap = document.getElementById("chatPhotoWrap");
    const img = document.getElementById("chatPhotoPreview");
    return wrap && !wrap.classList.contains("hide") && img && img.getAttribute("src");
  }, { timeout: 10000 });
}

function todayKeyLocal() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--window-size=430,900"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2, isMobile: true });
  const errors = [];
  page.on("pageerror", (e) => {
    const msg = String(e.message || e);
    // SW register/update noise is fine in the local static server.
    if (/service\s*worker/i.test(msg)) return;
    errors.push(msg);
  });

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "snapcal-settings",
      JSON.stringify({
        geminiKey: "AIzaSyTESTKEYFORLOCALMOCKONLY000",
        model: "gemini-3.5-flash",
        useLlm: true
      })
    );
    localStorage.setItem("snapcal-v1", JSON.stringify({ schema: 1, days: {} }));
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#logBtn", { timeout: 10000 });

  // Disable SW so reloads stay stable in the test server.
  await page.evaluate(async () => {
    if (!navigator.serviceWorker) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  });

  await page.evaluate(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf("generativelanguage.googleapis.com") >= 0) {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        const parts = ((((body.contents || [])[0] || {}).parts) || []);
        const hasImage = parts.some(function (p) {
          return !!(p.inlineData || p.inline_data);
        });
        const text = parts.map(function (p) { return p.text || ""; }).join(" ");
        let payload;
        if (/Reply with exactly:\s*OK/i.test(text)) {
          payload = {
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: "OK" }] } }]
          };
        } else if (hasImage) {
          // Match the user's typed note only — the prompt itself mentions "half" as an example.
          const half =
            /typed how much they ate:\s*"[^"]*\bhalf\b/i.test(text) ||
            /typed how much they ate:\s*"[^"]*0\.5/i.test(text) ||
            /typed how much they ate:\s*"[^"]*1\/2/i.test(text);
          const mult = half ? 0.5 : 1;
          payload = {
            candidates: [{
              finishReason: "STOP",
              content: {
                parts: [{
                  text: JSON.stringify([{
                    name: "KIND Dark Chocolate Nuts & Sea Salt",
                    detail: (half ? "0.5 serving" : "1 serving") + " · 1 bar (40g)",
                    kcal: Math.round(200 * mult),
                    grams: Math.round(40 * mult),
                    protein: Math.round(10 * mult * 10) / 10,
                    carbs: Math.round(16 * mult * 10) / 10,
                    fat: Math.round(15 * mult * 10) / 10,
                    grade: "said",
                    warn: "From mocked label photo"
                  }])
                }]
              }
            }]
          };
        } else {
          payload = {
            candidates: [{
              finishReason: "STOP",
              content: {
                parts: [{
                  text: JSON.stringify([{
                    name: "Oats",
                    detail: "35g dry",
                    kcal: 130,
                    grams: 35,
                    protein: 5,
                    carbs: 23,
                    fat: 2.5,
                    grade: "grams",
                    warn: ""
                  }])
                }]
              }
            }]
          };
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return realFetch(url, opts);
    };
  });

  const labelPath = path.join(outDir, "fake-label.jpg");
  if (!fs.existsSync(labelPath) || fs.statSync(labelPath).size < 500) {
    throw new Error("fake-label.jpg missing or too small");
  }

  await attachLabelPhoto(page, labelPath);
  await page.evaluate(() => {
    document.getElementById("text").value = "half a serving";
  });

  await page.screenshot({ path: path.join(outDir, "today-label-before-parse.png") });
  await page.click("#logBtn");
  await page.waitForFunction(() => {
    const sheet = document.getElementById("sheet");
    return sheet && !sheet.classList.contains("hide");
  }, { timeout: 15000 });

  const confirmText = await page.evaluate(() => document.getElementById("sheetBody").innerText);
  await page.screenshot({ path: path.join(outDir, "today-label-confirm.png") });

  if (!/KIND Dark Chocolate/i.test(confirmText)) {
    throw new Error("Confirm missing product: " + confirmText.slice(0, 240));
  }
  if (!/\b100\b/.test(confirmText)) {
    throw new Error("Expected half of 200 kcal (=100): " + confirmText.slice(0, 300));
  }
  if (!/note \+ label photo/i.test(confirmText)) {
    throw new Error("Expected note+label confirm copy: " + confirmText.slice(0, 200));
  }

  await page.click("#sheetOk");
  await page.waitForFunction(
    () => document.getElementById("sheet").classList.contains("hide"),
    { timeout: 5000 }
  );

  const key = todayKeyLocal();
  const saved = await page.evaluate((dayKey) => {
    const db = JSON.parse(localStorage.getItem("snapcal-v1") || "{}");
    const d = (db.days && db.days[dayKey]) || { meals: [] };
    const last = (d.meals || [])[(d.meals || []).length - 1];
    return {
      mealCount: (d.meals || []).length,
      source: last && last.source,
      hasPhoto: !!(last && last.photo),
      name: last && last.items && last.items[0] && last.items[0].name,
      kcal: last && last.items && last.items[0] && last.items[0].kcal,
      protein: last && last.items && last.items[0] && last.items[0].protein,
      chatPhotoCleared: document.getElementById("chatPhotoWrap").classList.contains("hide"),
      textCleared: !document.getElementById("text").value
    };
  }, key);
  await page.screenshot({ path: path.join(outDir, "today-label-saved.png") });

  if (!saved.hasPhoto) throw new Error("Saved meal missing photo");
  if (saved.source !== "chat-ai") throw new Error("Bad source " + saved.source);
  if (saved.kcal !== 100) throw new Error("Expected 100 kcal saved, got " + saved.kcal);
  if (!saved.chatPhotoCleared || !saved.textCleared) {
    throw new Error("Chat not cleared after save: " + JSON.stringify(saved));
  }

  // Text-only
  await page.evaluate(() => {
    document.getElementById("text").value = "35g oats";
  });
  await page.click("#logBtn");
  await page.waitForFunction(
    () => !document.getElementById("sheet").classList.contains("hide"),
    { timeout: 10000 }
  );
  const textOnly = await page.evaluate(() => document.getElementById("sheetBody").innerText);
  if (!/Oats/i.test(textOnly)) throw new Error("Text-only parse failed");
  await page.click("#sheetNo");

  // Photo-only (no typed note → 1 serving / 200 kcal)
  await page.evaluate(() => {
    document.getElementById("text").value = "";
  });
  await attachLabelPhoto(page, labelPath);
  await page.click("#logBtn");
  await page.waitForFunction(
    () => !document.getElementById("sheet").classList.contains("hide"),
    { timeout: 10000 }
  );
  const photoOnly = await page.evaluate(() => document.getElementById("sheetBody").innerText);
  if (!/KIND Dark Chocolate/i.test(photoOnly)) throw new Error("Photo-only parse failed");
  if (!/\b200\b/.test(photoOnly)) throw new Error("Photo-only should be 200 kcal");
  await page.click("#sheetNo");

  // Nav still works
  await page.click('button[data-tab="snap"]');
  await page.waitForFunction(
    () => !document.getElementById("snapView").classList.contains("hide"),
    { timeout: 3000 }
  );
  await page.click('button[data-tab="today"]');
  await page.waitForFunction(() => {
    const main = document.getElementById("todayView");
    return main && !main.classList.contains("hide");
  }, { timeout: 3000 });

  if (errors.length) throw new Error("Page errors: " + errors.join(" | "));

  console.log(JSON.stringify({ ok: true, saved, textOnlyOk: true, photoOnlyOk: true, navOk: true }, null, 2));
  await browser.close();
  server.close();
  process.exit(0);
})().catch((err) => {
  console.error("TEST_FAIL", err && err.stack || err);
  process.exit(1);
});
