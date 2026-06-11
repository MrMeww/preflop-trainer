# Preflop Trainer — MTT 8-max (Chip-EV)

A free, fully-static preflop **trainer** + **range viewer** for MTT 8-max.
No server, no database — just static files. Deploys on Cloudflare Pages / any static host.

**Disclaimer:** ranges are **MTT · 8-max · Chip-EV** and do **NOT** model **ICM**
(bubble / pay-jump effects). Study tool, not advice.

## Files
- `index.html` — Trainer (drill spots, instant feedback, session summary)
- `range.html` — Range Viewer (13×13 grid per spot / position / stack / 3-bet size)
- `engine.js` — grading logic (correct iff GTO frequency of your action ≥ 8%)
- `ranges.json` — range data bundle (313 nodes, 8-max chip-EV)
- `.nojekyll` — serve files as-is on GitHub Pages

## Local preview
```
python3 -m http.server 8090   # then open http://localhost:8090/
```

## Deploy (Cloudflare Pages, free)
Connect this repo in Cloudflare → Pages → framework preset **None**, no build command,
output directory **`/`**. Every push auto-redeploys.

> Data is regenerated from a private range DB; to update, replace `ranges.json` and push.
