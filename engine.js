/* Static preflop-trainer engine — browser port of spot.py + grade.py + route helpers.
   Reads web/ranges.json (generated from poker/ranges/ by build.py), so data is identical
   to the server-side auditor; only the small logic is ported. Behaviour mirrors grade.py
   exactly: correct iff GTO frequency of the chosen action >= TRAINER_THRESHOLD (0.08). */
const Engine = (() => {
  const RANK_ORDER = "AKQJT98765432";
  const RANKS = "AKQJT98765432", SUITS = "shdc";
  const DECK = []; for (const r of RANKS) for (const s of SUITS) DECK.push(r + s);
  const TRAINER_THRESHOLD = 0.08;
  const GRID_ORDER = ["allin", "raise", "call", "fold"];   // jam→raise→call→fold

  let NODES = [], INDEX = [];

  function holeToKey(c1, c2) {
    const r1 = c1[0].toUpperCase(), s1 = c1[1].toLowerCase();
    const r2 = c2[0].toUpperCase(), s2 = c2[1].toLowerCase();
    const i1 = RANK_ORDER.indexOf(r1), i2 = RANK_ORDER.indexOf(r2);
    if (i1 === i2) return r1 + r1;
    const [hi, lo] = i1 < i2 ? [r1, r2] : [r2, r1];
    return hi + lo + (s1 === s2 ? "s" : "o");
  }
  const asMix = cell => (typeof cell === "string") ? { [cell]: 1.0 } : cell;
  const handClass = k => k.length === 2 ? "pairs" : (k.endsWith("s") ? "suited" : "offsuit");

  function actionLabel(a, spot_type) {
    if (a === "fold") return "Fold";
    if (a === "allin") return "Jam";
    if (a === "call") return (spot_type === "rfi" || spot_type === "jam_or_fold") ? "Limp" : "Call";
    if (a === "raise") return ({ vs_rfi: "3-Bet", vs_3bet: "4-Bet" })[spot_type] || "Raise";
    return a;
  }
  function contextLine(s) {
    const d = `${s.depth}bb`;
    if (s.spot_type === "rfi" || s.spot_type === "jam_or_fold")
      return s.hero_pos === "UTG" ? `You're first to act from UTG. ${d} effective.`
                                  : `Folds to you in the ${s.hero_pos}. ${d} effective.`;
    if (s.spot_type === "vs_rfi") return `${s.vs_pos} opens. You're in the ${s.hero_pos} with ${d}.`;
    if (s.spot_type === "bb_defend") return `${s.vs_pos} opens. You're in the BB with ${d}.`;
    if (s.spot_type === "vs_3bet") {
      const sz = s.threebet_to_bb != null ? ` to ${s.threebet_to_bb}bb` : "";
      return `You open from ${s.hero_pos}; ${s.vs_pos} 3-bets${sz}. ${d} deep.`;
    }
    return `${s.hero_pos} ${d}`;
  }
  function villainAction(s) {
    if (s.spot_type === "vs_rfi" || s.spot_type === "bb_defend") return "opens";
    if (s.spot_type === "vs_3bet") return s.threebet_to_bb != null ? `3-bets to ${s.threebet_to_bb}bb` : "3-bets";
    return null;
  }

  async function load(url = "ranges.json") {
    NODES = (await fetch(url).then(r => r.json())).nodes;
    // No separate "jam_or_fold" mode — short-stack jam/fold is just RFI at 10/14bb,
    // reachable via the RFI spot + a short stack filter.
    INDEX = NODES.slice();
  }
  const distinct = a => [...new Set(a)];
  function filters() {
    return {
      spot_types: distinct(INDEX.map(n => n.spot_type)),
      depths: distinct(INDEX.map(n => n.depth)).sort((a, b) => a - b),
      positions: distinct(INDEX.map(n => n.hero_pos)),
    };
  }
  function candidates({ spot_types, depths, hero_pos, vs_pos } = {}) {
    let c = INDEX;
    if (spot_types && spot_types.length) { const s = new Set(spot_types); c = c.filter(n => s.has(n.spot_type)); }
    if (depths && depths.length) { const s = new Set(depths.map(Number)); c = c.filter(n => s.has(n.depth)); }
    if (hero_pos && hero_pos.length) { const s = new Set(hero_pos); c = c.filter(n => s.has(n.hero_pos)); }
    if (vs_pos && vs_pos.length) { const s = new Set(vs_pos); c = c.filter(n => s.has(n.vs_pos)); }
    return c;
  }
  function generate(f = {}) {
    const c = candidates(f);
    if (!c.length) return null;
    const node = c[Math.floor(Math.random() * c.length)];
    const i1 = Math.floor(Math.random() * 52); let i2; do { i2 = Math.floor(Math.random() * 52); } while (i2 === i1);
    const cards = [DECK[i1], DECK[i2]];
    return {
      spot_type: node.spot_type, hero_pos: node.hero_pos, vs_pos: node.vs_pos,
      depth: node.depth, threebet_to_bb: node.threebet_to_bb,
      cards, hand_key: holeToKey(cards[0], cards[1]),
      legal_actions: node.legal_actions, node,
    };
  }
  function grade(spot, action, threshold = TRAINER_THRESHOLD) {
    const mix = asMix(spot.node.ranges[spot.hand_key] ?? "fold");
    const freq = mix[action] ?? 0;
    let best = null, bf = -1; for (const a in mix) if (mix[a] > bf) { bf = mix[a]; best = a; }
    return { correct: freq >= threshold, chosen: action, chosen_freq: freq,
             gto_best: best, is_pure: Object.keys(mix).length === 1, mix, threshold };
  }
  function findNode(spot_type, hero_pos, vs_pos, depth, threebet_to_bb) {
    return NODES.find(n => n.spot_type === spot_type && n.hero_pos === hero_pos
      && (n.vs_pos || null) === (vs_pos || null) && n.depth == depth
      && (spot_type !== "vs_3bet" || threebet_to_bb == null
          || Math.abs((n.threebet_to_bb || 0) - threebet_to_bb) < 0.05)) || null;
  }
  function buildGrid(node) {
    const rows = [];
    for (let i = 0; i < 13; i++) {
      const row = [];
      for (let j = 0; j < 13; j++) {
        const r1 = RANKS[i], r2 = RANKS[j];
        const key = i === j ? r1 + r1 : (i < j ? r1 + r2 + "s" : r2 + r1 + "o");
        const mix = asMix(node.ranges[key] ?? "fold");
        row.push({ key, mix: GRID_ORDER.filter(a => a in mix).map(a => ({ action: a, freq: mix[a] })) });
      }
      rows.push(row);
    }
    return rows;
  }
  return { load, filters, generate, grade, findNode, buildGrid, nodes: () => NODES,
           actionLabel, contextLine, villainAction, handClass };
})();
