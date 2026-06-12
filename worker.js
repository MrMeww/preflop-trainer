/* Cloudflare Worker: serves the static trainer + captures anonymous practice attempts to D1.
   Same Worker that hosts the site — /api/* is handled here, everything else falls through to
   the static assets binding. No personal data is stored (no login, no IP persisted; `session`
   is a random client-generated id only used to group one play session). */

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const str = (v, n) => (v == null ? null : String(v).slice(0, n));
const int = v => (v == null || v === "" ? null : parseInt(v, 10));
const flt = v => (v == null || v === "" ? null : parseFloat(v));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Record practice answers (one row per answer, or a batch under {attempts:[...]})
    if (url.pathname === "/api/attempt" && req.method === "POST") {
      if (!env.DB) return J({ error: "no db binding" }, 500);
      let body; try { body = await req.json(); } catch { return J({ error: "bad json" }, 400); }
      const rows = Array.isArray(body.attempts) ? body.attempts : [body];
      const sid = str(body.session, 40), cid = str(body.client, 40), ver = str(body.ver, 16), now = Date.now();
      const stmt = env.DB.prepare(
        "INSERT INTO attempts (session,client,ver,spot_type,hero_pos,vs_pos,depth,threebet_to_bb,hand_key,action,gto_best,correct,chosen_freq,extra,ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      const batch = rows.slice(0, 100).map(r => stmt.bind(
        sid, cid, ver, str(r.spot_type, 16), str(r.hero_pos, 8), str(r.vs_pos, 8),
        int(r.depth), flt(r.threebet_to_bb), str(r.hand_key, 4),
        str(r.action, 8), str(r.gto_best, 8), r.correct ? 1 : 0, flt(r.chosen_freq),
        r.extra ? JSON.stringify(r.extra).slice(0, 500) : null, now));
      try { await env.DB.batch(batch); } catch { return J({ error: "db write failed" }, 500); }
      return J({ ok: true, stored: batch.length });
    }

    // Quick aggregate read (anonymous totals only — no raw rows exposed)
    if (url.pathname === "/api/stats" && req.method === "GET") {
      if (!env.DB) return J({ error: "no db binding" }, 500);
      const q = sql => env.DB.prepare(sql).all().then(r => r.results);
      const acc = "ROUND(100.0*SUM(correct)/COUNT(*)) pct";
      const tot = await env.DB.prepare(
        "SELECT COUNT(*) n, COALESCE(SUM(correct),0) c, COUNT(DISTINCT session) s FROM attempts").first();
      // chosen_freq = GTO frequency of the action the player picked (only on rows after the
      // capture upgrade; older rows are NULL and excluded). Lower = more off-tree = worse.
      const W = "correct=0 AND chosen_freq IS NOT NULL";   // wrong answers with severity data
      const [by_spot_type, by_depth, by_depth_spot, by_depth_position, hardest_depths,
             worst_by_depth, worst_spots] = await Promise.all([
        q(`SELECT spot_type, COUNT(*) n, ${acc} FROM attempts GROUP BY spot_type ORDER BY n DESC`),
        q(`SELECT depth, COUNT(*) n, ${acc} FROM attempts GROUP BY depth ORDER BY depth`),
        q(`SELECT depth, spot_type, COUNT(*) n, ${acc} FROM attempts GROUP BY depth, spot_type ORDER BY depth, spot_type`),
        q(`SELECT depth, hero_pos, COUNT(*) n, ${acc} FROM attempts GROUP BY depth, hero_pos ORDER BY depth, hero_pos`),
        q(`SELECT depth, COUNT(*) n, ${acc} FROM attempts GROUP BY depth HAVING n >= 10 ORDER BY pct ASC`),
        // severity by depth: avg GTO-freq of WRONG picks (lower = more severe), + blunder count
        q(`SELECT depth, COUNT(*) wrong, ROUND(AVG(chosen_freq),3) avg_freq,
              SUM(CASE WHEN chosen_freq<0.01 THEN 1 ELSE 0 END) blunders
           FROM attempts WHERE ${W} GROUP BY depth HAVING wrong>=5 ORDER BY avg_freq ASC`),
        // most-severe leak spots: spot × position × depth, worst avg-freq first
        q(`SELECT spot_type, hero_pos, depth, COUNT(*) wrong, ROUND(AVG(chosen_freq),3) avg_freq
           FROM attempts WHERE ${W} GROUP BY spot_type, hero_pos, depth HAVING wrong>=5 ORDER BY avg_freq ASC LIMIT 25`),
      ]);
      const sev = await env.DB.prepare(
        `SELECT ROUND(AVG(chosen_freq),3) avg_all,
            SUM(CASE WHEN correct=0 THEN 1 ELSE 0 END) wrong,
            SUM(CASE WHEN chosen_freq<0.01 THEN 1 ELSE 0 END) blunders
         FROM attempts WHERE chosen_freq IS NOT NULL`).first();
      return J({ attempts: tot.n, correct: tot.c, sessions: tot.s,
        accuracy_pct: tot.n ? Math.round(100 * tot.c / tot.n) : null,
        by_spot_type, by_depth, by_depth_spot, by_depth_position, hardest_depths,
        severity: { avg_chosen_freq: sev.avg_all, wrong: sev.wrong, blunders: sev.blunders },
        worst_by_depth, worst_spots });
    }

    return env.ASSETS.fetch(req);     // everything else = the static site
  }
};
