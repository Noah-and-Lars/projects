// The water flow budget (BUILD_BRIEF 3.5). Pure data in, numbers out, so it
// unit-tests without a browser.
//
// Nodes are machines and pipes; edges join matched sockets. Each connected
// network adds up its sources (intakes, wheels, a header tank above 10%),
// boosts intake flow if a fuelled booster pump is on it, and shares the
// supply among consumers: satisfaction = min(1, supply / demand). A consumer
// can't draw more than the narrowest pipe on its best path from a source
// (a widest-path search, which also copes with loops), and silt drops by 3
// for each settling tank on the network.
//
// node: { id, kind: 'source'|'consumer'|'pipe'|'tank'|'settle'|'booster',
//         flow (sources), demand (consumers), cap (pipes, L/s), on (bool),
//         tank: { level, cap } }
//
// Pressure (the second number a network carries): water leaves an intake at
// 100%, plus 10% for each fuelled booster pump, and every metre of pipe loses
// some of it (`loss` per metre on pipe nodes: copper loses most, glimmer
// least). A header tank that is above 10% puts the line back to full
// pressure. Machines run slower on low pressure (`pressureFactor`).

export const RIVER_SILT = 6;
export const MAX_BOOSTERS = 4, BOOST_EACH = 0.2;
// Pipe pressure lost per metre, by tier.
export const PIPE_LOSS = { copper: 0.01, steel: 0.006, glimmer: 0.0035 };

export function solveFlow(nodes, edges, dt = 0) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const [a, b] of edges) { if (adj.has(a) && adj.has(b)) { adj.get(a).push(b); adj.get(b).push(a); } }
  const seen = new Set(), networks = [], result = new Map();
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp = []; const stack = [n.id]; seen.add(n.id);
    while (stack.length) { const id = stack.pop(); comp.push(byId.get(id)); for (const m of adj.get(id)) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
    networks.push(comp);
  }
  for (const comp of networks) {
    const sources = comp.filter(x => x.kind === 'source' && x.on !== false);
    const tanks = comp.filter(x => x.kind === 'tank');
    const consumers = comp.filter(x => x.kind === 'consumer' && x.on !== false);
    const boosters = comp.filter(x => x.kind === 'booster' && x.on !== false && x.fuelled).slice(0, MAX_BOOSTERS);
    const settles = comp.filter(x => x.kind === 'settle').length;
    let intake = 0; for (const s of sources) intake += s.flow;
    // Boosters: +20% of the network's intake flow each, up to four.
    const boost = intake * BOOST_EACH * boosters.length;
    const P0 = 1 + 0.1 * boosters.length;
    let supply = intake + boost;
    let demand = 0; for (const c of consumers) demand += c.demand;
    // Header tanks: give up to 60 L/s while above 10%, store any surplus.
    let tankOut = 0;
    for (const t of tanks) if (t.tank.level > t.tank.cap * 0.1 && demand > supply) tankOut += Math.min(60, demand - supply - tankOut);
    supply += tankOut;
    // Widest path from any source (or a tank that is giving) to each node.
    const width = new Map();
    const heap = [];
    for (const s of sources) { width.set(s.id, Infinity); heap.push([Infinity, s.id]); }
    for (const t of tanks) if (tankOut > 0) { width.set(t.id, Infinity); heap.push([Infinity, t.id]); }
    while (heap.length) {
      heap.sort((a, b) => b[0] - a[0]);
      const [w, id] = heap.shift();
      if (w < (width.get(id) ?? -1)) continue;
      for (const m of adj.get(id)) {
        const mn = byId.get(m);
        const w2 = Math.min(w, mn.kind === 'pipe' ? mn.cap : Infinity);
        if (w2 > (width.get(m) ?? -1)) { width.set(m, w2); heap.push([w2, m]); }
      }
    }
    // Pressure: the least pipe loss from any source (or a giving tank).
    const lost = new Map(), ph = [];
    for (const s of sources) { lost.set(s.id, 0); ph.push([0, s.id]); }
    for (const t of tanks) if (t.tank.level > t.tank.cap * 0.1) { lost.set(t.id, 0); ph.push([0, t.id]); }
    while (ph.length) {
      ph.sort((a, b) => a[0] - b[0]);
      const [l, id] = ph.shift();
      if (l > (lost.get(id) ?? Infinity)) continue;
      for (const m of adj.get(id)) {
        const mn = byId.get(m);
        const l2 = mn.kind === 'tank' && mn.tank.level > mn.tank.cap * 0.1 ? 0 : l + (mn.kind === 'pipe' ? (mn.len || 0) * (mn.loss || 0) : 0);
        if (l2 < (lost.get(m) ?? Infinity)) { lost.set(m, l2); ph.push([l2, m]); }
      }
    }
    const pressureOf = (id) => sources.length || tanks.some(t => lost.get(t.id) === 0) ? Math.max(0, P0 - (lost.get(id) ?? P0)) : 0;
    const sat = demand > 0 ? Math.min(1, supply / demand) : (supply > 0 ? 1 : 0);
    let used = 0;
    for (const c of consumers) {
      const capW = width.get(c.id) ?? 0;
      const got = Math.min(c.demand * sat, capW);
      used += got;
      result.set(c.id, { satisfaction: c.demand > 0 ? got / c.demand : 0, flow: got, network: comp[0].id, pressure: pressureOf(c.id) });
    }
    // Tank level: fill from surplus, drain by what it gave.
    const surplus = Math.max(0, intake + boost - demand);
    for (const t of tanks) {
      const share = tankOut / Math.max(1, tanks.length);
      t.tank.level = Math.max(0, Math.min(t.tank.cap, t.tank.level + (surplus / tanks.length - share) * dt));
      result.set(t.id, { level: t.tank.level, giving: share });
    }
    // Silt: the flow-weighted mean of the intakes' water (cleaner upstream,
    // muddier below the town), less 3 per settling tank.
    let sw = 0, sf = 0; for (const s of sources) { const f = Math.max(0.001, s.flow || 0); sw += f; sf += f * (s.silt ?? RIVER_SILT); }
    const silt = Math.max(0, (sources.length ? Math.round(sf / sw) : 0) - 3 * settles);
    const info = { supply, demand, satisfaction: sat, silt, intake, boost, tankOut, used, boosters: boosters.length };
    for (const x of comp) { const r = result.get(x.id) || {}; result.set(x.id, { pressure: pressureOf(x.id), ...r, net: info }); }
  }
  return result;
}

// Machine speed from satisfaction (BUILD_BRIEF 3.5): never stops, just slows.
// Low pressure slows a machine down to 55% (it never stops for it).
export const pressureFactor = (p) => 0.55 + 0.45 * Math.max(0, Math.min(1, p ?? 1));
export const speedFrom = (satisfaction) => 0.2 + 0.8 * Math.max(0, Math.min(1, satisfaction));
// Wear per second from silt: 1% per minute per point above 4.
export const wearRate = (silt) => Math.max(0, silt - 4) / 100 / 60;
