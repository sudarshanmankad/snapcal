# SnapCal

Personal calorie tracker PWA for iPhone Home Screen.

**Live:** https://sudarshanmankad.github.io/snapcal/

## Install (no App Store)

1. Safari → open the live URL  
2. Share → **Add to Home Screen**  
3. Reopen from the icon after updates (pull to refresh if needed)

## What it does (v1)

- **1800 kcal** daily **food** budget (intake, not net — workouts do not auto-add calories back)
- **Chat log:** `I ate 1 idli, 2 cookies, 50g cooked rice` → line items → confirm → save on device
- **Snap:** plate photo + food chips; label kcal × servings; Fitness Move typed from screenshot
- **Fitness Move:** chips, typed Active Energy, or Shortcuts `?move=420`
- **Lifting note:** optional conservative adjustment — not stacked as a full second workout on top of Move
- **History** by day in `localStorage` (this phone only)

## Honest accuracy

| Input | Role |
|---|---|
| Nutrition label + servings | High — packaged source of truth |
| Grams + named food (cooked vs raw explicit) | High for homemade staples |
| Chat counts | Good everyday path |
| Plate photo alone | Often ~20–40% off — never barcode-grade |

## Deploy

GitHub Pages: branch `main`, folder `/ (root)`. Keep `index.html` lowercase.

No build step. Static files only: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.

## Out of scope (for now)

App Store binary, HealthKit auto-read, accounts/cloud sync, eating back all exercise kcal. Native HealthKit needs Apple Developer ($99) — ask before charging that.
