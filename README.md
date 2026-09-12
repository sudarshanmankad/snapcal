# SnapCal

Personal calorie tracker PWA for iPhone Home Screen.

**Live:** https://sudarshanmankad.github.io/snapcal/

## Install (no App Store)

1. Safari → open the live URL  
2. Share → **Add to Home Screen**  
3. Reopen from the icon after updates (pull to refresh if needed)

## What it does (v1)

- **1800 kcal** daily **food** budget (intake, not net — workouts do not auto-add calories back)
- **Chat log:** counts/grams → confirm → save on device
- **Smart chat (optional):** built-in starter foods + a **personal dictionary** that learns foods you confirm. Paste a free **Gemini API key** in Setup (stored only on the phone) so unknown foods get an AI estimate — still confirm before save. No API keys in GitHub.
- **Snap:** plate photo + food chips; label kcal × servings; Fitness Move typed from screenshot
- **Fitness Move:** chips, typed Active Energy, or Shortcuts `?move=420`
- **Lifting note:** optional conservative adjustment — not stacked as a full second workout on top of Move
- **History** by day in `localStorage` (this phone only)

## Honest accuracy

| Input | Role |
|---|---|
| Nutrition label + servings | High — packaged source of truth |
| Grams + named food (cooked vs raw explicit) | High for homemade staples |
| Chat counts / personal dictionary | Good everyday path |
| Gemini estimate for unknowns | Helpful; confirm before trusting |
| Plate photo alone | Often ~20–40% off — never barcode-grade |

## Data permanence

Your meals, personal food dictionary, and Gemini key live in **Safari localStorage on the phone**.

- App updates **must not** rename storage keys or wipe history.
- **Clear today** only clears that day — not other days, dictionary, or settings.
- **Setup → Copy full backup** saves a JSON you can keep in Notes/Files and restore later.

Going forward: features can change; your logged data should survive.
