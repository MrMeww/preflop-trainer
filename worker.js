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
      const sid = str(body.session, 40), now = Date.now();
      const stmt = env.DB.prepare(
        "INSERT INTO attempts (session,spot_type,hero_pos,vs_pos,depth,threebet_to_bb,hand_key,action,gto_best,correct,ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
      const batch = rows.slice(0, 100).map(r => stmt.bind(
        sid, str(r.spot_type, 16), str(r.hero_pos, 8), str(r.vs_pos, 8),
        int(r.depth), flt(r.threebet_to_bb), str(r.hand_key, 4),
        str(r.action, 8), str(r.gto_best, 8), r.correct ? 1 : 0, now));
      try { await env.DB.batch(batch); } catch { return J({ error: "db write failed" }, 500); }
      return J({ ok: true, stored: batch.length });
    }

    // Quick aggregate read (anonymous totals only — no raw rows exposed)
    if (url.pathname === "/api/stats" && req.method === "GET") {
      if (!env.DB) return J({ error: "no db binding" }, 500);
      const tot = await env.DB.prepare(
        "SELECT COUNT(*) n, COALESCE(SUM(correct),0) c, COUNT(DISTINCT session) s FROM attempts").first();
      const top = await env.DB.prepare(
        "SELECT spot_type, COUNT(*) n, ROUND(100.0*SUM(correct)/COUNT(*)) pct FROM attempts GROUP BY spot_type ORDER BY n DESC").all();
      return J({ attempts: tot.n, correct: tot.c, sessions: tot.s,
        accuracy_pct: tot.n ? Math.round(100 * tot.c / tot.n) : null, by_spot_type: top.results });
    }

    return env.ASSETS.fetch(req);     // everything else = the static site
  }
};
