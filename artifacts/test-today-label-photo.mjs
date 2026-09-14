/**
 * End-to-end test: Today note + label photo → mocked Gemini → confirm → save.
 * Uses puppeteer-core + system Chrome. No real API key required.
 */
import puppeteer from "puppeteer-core";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = 8791;

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript";
  if (p.endsWith(".webmanifest") || p.endsWith(".json")) return "application/manifest+json";
  if (p.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.join(root, urlPath.replace(/^\//, ""));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=430,900"]
});

const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2, isMobile: true });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console:" + msg.text());
});

// 1x1 red JPEG
const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLSUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKgBLAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EADkQAAIBAwIEBAMFBwUBAAAAAAECAwAEERIhBTFBBhMiUWEycYGRFEKhsQcjQlLB0fAVYnKC/8QAGQEBAQEBAQEAAAAAAAAAAAAAAAECAwQF/8QAIhEBAQEAAgICAgMBAAAAAAAAAAECEQMSITFBBFFhInEy/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==";

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });

// Seed settings + mock Gemini generateContent
await page.evaluate((jpeg) => {
  localStorage.setItem(
    "snapcal-settings",
    JSON.stringify({
      geminiKey: "AIzaTESTKEYFORLOCALMOCK000000",
      model: "gemini-3.5-flash",
      useLlm: true
    })
  );
  // Bypass health check by stubbing after reload — inject after reload below
  window.__mockJpeg = jpeg;
}, tinyJpeg);

await page.reload({ waitUntil: "domcontentloaded" });

await page.evaluate(() => {
  // Stub health + multimodal parse at network layer
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    const u = String(url);
    if (u.indexOf("generativelanguage.googleapis.com") >= 0) {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const parts = ((((body.contents || [])[0] || {}).parts) || []);
      const hasImage = parts.some(function (p) { return p.inlineData || p.inline_data; });
      const text = parts.map(function (p) { return p.text || ""; }).join(" ");
      let reply;
      if (/Reply with exactly: OK/i.test(text)) {
        reply = { candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }] };
      } else if (hasImage) {
        // Simulate label read with half-serving note
        const half = /half|0\.5|1\/2/i.test(text);
        const mult = half ? 0.5 : 1;
        reply = {
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
        reply = {
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
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return realFetch(url, opts);
  };
});

// Attach photo via setChatPhotoFromFile path (set chatPhotoData directly + UI)
await page.evaluate((jpeg) => {
  chatPhotoData = jpeg;
  document.getElementById("chatPhotoPreview").src = jpeg;
  document.getElementById("chatPhotoWrap").classList.remove("hide");
  document.getElementById("chatPhotoHint").textContent = "Label attached (test)";
  document.getElementById("text").value = "half a serving";
}, tinyJpeg);

// Screenshot before parse
await page.screenshot({ path: path.join(__dirname, "today-label-before-parse.png"), fullPage: false });

await page.click("#logBtn");
await page.waitForFunction(() => {
  const sheet = document.getElementById("sheet");
  return sheet && !sheet.classList.contains("hide");
}, { timeout: 8000 });

const confirmText = await page.evaluate(() => document.getElementById("sheetBody").innerText);
await page.screenshot({ path: path.join(__dirname, "today-label-confirm.png"), fullPage: false });

if (!/KIND Dark Chocolate/i.test(confirmText)) throw new Error("Confirm missing product name: " + confirmText.slice(0, 200));
if (!/100\s*kcal/i.test(confirmText) && !/\b100\b/.test(confirmText)) {
  throw new Error("Expected half of 200 kcal (=100) in confirm: " + confirmText.slice(0, 300));
}
if (!/From your note \+ label photo/i.test(confirmText)) {
  throw new Error("Expected label+note confirm copy");
}

await page.click("#sheetOk");
await page.waitForFunction(() => {
  const sheet = document.getElementById("sheet");
  return sheet && sheet.classList.contains("hide");
}, { timeout: 5000 });

const saved = await page.evaluate(() => {
  const d = day();
  const last = (d.meals || [])[(d.meals || []).length - 1];
  return {
    mealCount: (d.meals || []).length,
    source: last && last.source,
    hasPhoto: !!(last && last.photo),
    name: last && last.items && last.items[0] && last.items[0].name,
    kcal: last && last.items && last.items[0] && last.items[0].kcal,
    protein: last && last.items && last.items[0] && last.items[0].protein,
    chatPhotoCleared: chatPhotoData == null,
    textCleared: !document.getElementById("text").value
  };
});

await page.screenshot({ path: path.join(__dirname, "today-label-saved.png"), fullPage: false });

// Text-only still works
await page.evaluate(() => { document.getElementById("text").value = "35g oats"; });
await page.click("#logBtn");
await page.waitForFunction(() => {
  const sheet = document.getElementById("sheet");
  return sheet && !sheet.classList.contains("hide");
}, { timeout: 8000 });
const textOnly = await page.evaluate(() => document.getElementById("sheetBody").innerText);
if (!/Oats/i.test(textOnly)) throw new Error("Text-only parse failed");
await page.click("#sheetNo");

// Photo-only (no text) works
await page.evaluate((jpeg) => {
  document.getElementById("text").value = "";
  chatPhotoData = jpeg;
  document.getElementById("chatPhotoPreview").src = jpeg;
  document.getElementById("chatPhotoWrap").classList.remove("hide");
}, tinyJpeg);
await page.click("#logBtn");
await page.waitForFunction(() => {
  const sheet = document.getElementById("sheet");
  return sheet && !sheet.classList.contains("hide");
}, { timeout: 8000 });
const photoOnly = await page.evaluate(() => document.getElementById("sheetBody").innerText);
if (!/KIND Dark Chocolate/i.test(photoOnly)) throw new Error("Photo-only parse failed");
if (!/\b200\b/.test(photoOnly)) throw new Error("Photo-only should be full serving 200 kcal");

await page.click("#sheetNo");

if (errors.length) {
  console.log("PAGE_ERRORS", errors);
  throw new Error("Page errors: " + errors.join(" | "));
}

console.log(JSON.stringify({ ok: true, saved, textOnlyOk: /Oats/i.test(textOnly), photoOnlyOk: /KIND/i.test(photoOnly) }, null, 2));

await browser.close();
server.close();
process.exit(0);
