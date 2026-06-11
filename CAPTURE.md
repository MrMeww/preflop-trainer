# Anonymous practice capture (Cloudflare Worker + D1)

Records every answered spot to a free Cloudflare **D1** database via the same Worker that
serves the site. **Fully anonymous** — no login, no IP stored; `session` is a random
client id only used to group one play session.

Files: `worker.js` (handler), `wrangler.toml` (config + D1 binding), `schema.sql` (table),
`.assetsignore` (keeps these out of the public static assets). The trainer page posts each
answer to `/api/attempt`.

## One-time setup

1. **Create the D1 database**
   - Cloudflare dashboard → **Workers & Pages → D1** → **Create database**
   - Name it **`trainer_data`** → Create
   - Copy the **Database ID** it shows you

2. **Paste the ID into `wrangler.toml`**
   - Open `wrangler.toml`, replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with that ID, save

3. **Create the table** — D1 → `trainer_data` → **Console** tab → paste the contents of
   `schema.sql` → **Execute**

4. **Deploy** — commit + push these files (VS Code → Source Control → Sync). Cloudflare reads
   `wrangler.toml`, binds D1, and redeploys the Worker. (If the build doesn't pick up the D1
   binding, add it manually: project → **Settings → Bindings → Add → D1**, name `DB`,
   database `trainer_data`.)

## Verify it works

- Play a few spots on the live site, then open **`/api/stats`** in your browser, e.g.
  `https://preflop-trainer.mrmew.workers.dev/api/stats` — you should see totals climb.

## Read your data (D1 → Console)

```sql
-- usage at a glance
SELECT COUNT(*) attempts, COUNT(DISTINCT session) sessions,
       ROUND(100.0*SUM(correct)/COUNT(*)) accuracy_pct FROM attempts;

-- where players struggle most (lowest accuracy, enough samples)
SELECT spot_type, hero_pos, depth, COUNT(*) n,
       ROUND(100.0*SUM(correct)/COUNT(*)) pct
FROM attempts GROUP BY spot_type, hero_pos, depth
HAVING n >= 20 ORDER BY pct ASC LIMIT 25;

-- most-drilled hands
SELECT hand_key, COUNT(*) n, ROUND(100.0*SUM(correct)/COUNT(*)) pct
FROM attempts GROUP BY hand_key ORDER BY n DESC LIMIT 25;

-- activity over time (per day)
SELECT date(ts/1000,'unixepoch') day, COUNT(*) n, COUNT(DISTINCT session) sessions
FROM attempts GROUP BY day ORDER BY day DESC;
```

## Notes
- This is **synthetic practice data** (what people drill / where they miss) — useful product
  signal, but NOT the population moat (that's real-hand uploads in the server-side auditor).
  Keep them separate.
- Free tier limits are generous (D1: 5 GB + millions of reads/day; Workers: 100k req/day).
- On static-only hosts (e.g. GitHub Pages) `/api/attempt` 404s and the app silently skips
  capture — the trainer still works.
