(function (root) {
  'use strict';
  const factions = ['enemy', 'neutral', 'friendly', 'none'];
  const defaultPriorities = { enemy: 100, neutral: 50, friendly: 10, none: 50 };
  const empty = () => ({ combatants: [], activeId: null, round: 1, layout: 'vertical', layouts: { upcoming: 'vertical', full: 'vertical', nowNext: 'vertical' }, skippedActions: {}, seed: 1,
    display: { visibleTurns: 6, cardWidth: 460, textSize: 19, spacing: 12, opacity: 100 } });
  const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  const actionCount = value => Number.isSafeInteger(value) ? Math.max(0, Math.min(99, value)) : 0;
  function random(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
      n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function ownerSeed(id) {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash;
  }
  // Each batch belongs to the interval after an owner's turn, not a calendar round.
  // A calendar round contains the end of the previous batch and start of the new one.
  function schedule(state) {
    const count = state.combatants.length;
    const gaps = state.combatants.map(() => []);
    state.combatants.forEach((owner, ownerIndex) => {
      if (!owner.legendaryActions || count < 3) return;
      const eligible = Array.from({ length: count - 2 }, (_, i) => (ownerIndex + i + 1) % count);
      for (const cycle of [state.round - 1, state.round]) {
        if (cycle < 1) continue; // No actions before the owner's first turn.
        const rng = random(state.seed ^ ownerSeed(owner.id) ^ Math.imul(cycle, 0x9E3779B1));
        let pool = [];
        for (let action = 1; action <= owner.legendaryActions; action++) {
          if (!pool.length) {
            pool = [...eligible];
            for (let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }
          }
          const gap = pool.pop();
          const round = cycle + (gap < ownerIndex ? 1 : 0);
          if (round !== state.round) continue;
          const id = 'legendary:' + owner.id + ':cycle:' + cycle + ':' + action;
          const legacyId = 'legendary:' + owner.id + ':' + action;
          const skipped = state.skippedActions?.[round] || [];
          gaps[gap].push({ ...owner, id, ownerId: owner.id, legendary: true, action, cycle,
            skipped: skipped.includes(id) || skipped.includes(legacyId) });
        }
      }
    });
    return state.combatants.flatMap((c, i) => [{ ...c, ownerId: c.id, legendary: false }, ...gaps[i]]);
  }
  function normalize(value) {
    const state = empty();
    if (!value || typeof value !== 'object') return state;
    const ids = new Set();
    state.combatants = (Array.isArray(value.combatants) ? value.combatants : []).filter(c => {
      if (!c || typeof c.id !== 'string' || ids.has(c.id) || typeof c.name !== 'string' || !c.name.trim()) return false;
      ids.add(c.id); return true;
    }).map(c => ({ id: c.id, name: c.name.trim().slice(0, 80), faction: factions.includes(c.faction) ? c.faction : 'enemy', initiative: Number.isFinite(c.initiative) ? c.initiative : 0, priority: Number.isSafeInteger(c.priority) ? c.priority : defaultPriorities[c.faction] ?? defaultPriorities.enemy, legendaryActions: c.faction === 'enemy' ? actionCount(c.legendaryActions) : 0 }));
    state.combatants.sort((a, b) => b.initiative - a.initiative || a.priority - b.priority);
    state.round = Number.isSafeInteger(value.round) && value.round > 0 ? value.round : 1;
    state.layout = value.layout === 'horizontal' ? 'horizontal' : 'vertical';
    state.layouts = Object.fromEntries(['upcoming', 'full', 'nowNext'].map(key => [key, value.layouts?.[key] === 'horizontal' ? 'horizontal' : value.layouts?.[key] === 'vertical' ? 'vertical' : state.layout]));
    const validActions = new Set(state.combatants.flatMap(c => Array.from({ length: c.legendaryActions }, (_, i) => 'legendary:' + c.id + ':' + (i + 1))));
    state.skippedActions = {};
    for (const [round, ids] of Object.entries(value.skippedActions || {})) {
      if (!Number.isSafeInteger(Number(round)) || Number(round) < 1 || !Array.isArray(ids)) continue;
      const valid = [...new Set(ids.filter(id => validActions.has(id) || (typeof id === 'string' && state.combatants.some(c => {
        const prefix = 'legendary:' + c.id + ':cycle:';
        if (!id.startsWith(prefix)) return false;
        const parts = id.slice(prefix.length).split(':');
        return parts.length === 2 && parts.every(part => /^\d+$/.test(part))
          && Number.isSafeInteger(Number(parts[0])) && Number(parts[0]) >= 1
          && Number(parts[1]) >= 1 && Number(parts[1]) <= c.legendaryActions;
      }))))];
      if (valid.length) state.skippedActions[round] = valid;
    }
    state.seed = Number.isInteger(value.seed) ? value.seed >>> 0 : 1;
    const display = value.display || {};
    state.display = {
      visibleTurns: bounded(display.visibleTurns, 6, 1, 50),
      cardWidth: bounded(display.cardWidth, 460, 240, 1000),
      textSize: bounded(display.textSize, 19, 12, 40),
      spacing: bounded(display.spacing, 12, 0, 40),
      opacity: bounded(display.opacity, 100, 0, 100)
    };
    const order = schedule(state);
    state.activeId = order.find(c => c.id === value.activeId || (c.legendary && 'legendary:' + c.ownerId + ':' + c.action === value.activeId))?.id ?? order[0]?.id ?? null;
    return state;
  }
  function add(state, combatant) {
    state = normalize(state);
    if (combatant.legendaryActions > 0 && !state.combatants.some(c => c.legendaryActions)) state.seed = Math.floor(Math.random() * 4294967296);
    state.combatants.push(combatant);
    return normalize(state);
  }
  function reconcile(previous, next) {
    const order = schedule(previous);
    const activeIndex = order.findIndex(c => c.id === previous.activeId);
    next = normalize(next);
    const valid = new Set(schedule(next).map(c => c.id));
    if (!valid.has(previous.activeId)) {
      for (let offset = 1; offset <= order.length; offset++) {
        const candidate = order[(activeIndex + offset) % order.length];
        if (valid.has(candidate.id)) { next.activeId = candidate.id; break; }
      }
    }
    if (!next.combatants.length) next.round = 1;
    return next;
  }
  function remove(state, id) {
    state = normalize(state);
    return reconcile(state, { ...state, combatants: state.combatants.filter(c => c.id !== id) });
  }
  function setLegendary(state, id, count) {
    state = normalize(state);
    if (count > 0 && !state.combatants.some(c => c.legendaryActions)) state.seed = Math.floor(Math.random() * 4294967296);
    return reconcile(state, { ...state, combatants: state.combatants.map(c => c.id === id ? { ...c, legendaryActions: actionCount(count) } : c) });
  }
  function advance(state, direction) {
    state = normalize(state);
    let order = schedule(state);
    if (!order.length) return state;
    let index = order.findIndex(c => c.id === state.activeId);
    do {
      index += direction > 0 ? 1 : -1;
      if (index >= order.length) { state.round++; order = schedule(state); index = 0; }
      if (index < 0) { state.round = Math.max(1, state.round - 1); order = schedule(state); index = order.length - 1; }
    } while (order[index].skipped);
    state.activeId = order[index].id;
    return state;
  }
  function pendingLegendary(state, ownerId) {
    state = normalize(state);
    if (!state.combatants.some(c => c.id === ownerId)) return [];
    const order = schedule(state);
    const index = order.findIndex(c => c.id === state.activeId);
    const pending = [];
    for (let round = state.round; round <= state.round + 1; round++) {
      const turns = round === state.round ? order : schedule({ ...state, round });
      for (let i = round === state.round ? Math.max(0, index) : 0; i < turns.length; i++) {
        const turn = turns[i];
        const current = round === state.round && i === index;
        if (!current && !turn.legendary && turn.id === ownerId) return pending;
        if (turn.legendary && turn.ownerId === ownerId && !turn.skipped) pending.push({ ...turn, round });
      }
    }
    return pending;
  }
  function skipLegendary(state, ownerId, all = false) {
    state = normalize(state);
    const pending = pendingLegendary(state, ownerId);
    const selected = all ? pending : pending.slice(0, 1);
    if (!selected.length) return state;
    const skipped = { ...state.skippedActions };
    for (const action of selected) skipped[action.round] = [...new Set([...(skipped[action.round] || []), action.id])];
    state.skippedActions = skipped;
    if (selected.some(c => c.round === state.round && c.id === state.activeId)) return advance(state, 1);
    return normalize(state);
  }
  function displayTurns(state) {
    state = normalize(state);
    const order = schedule(state);
    const index = order.findIndex(c => c.id === state.activeId);
    return index < 0 ? order : [...order.slice(index), ...order.slice(0, index)];
  }
  function parseEncounter(json) {
    const value = JSON.parse(json.replace(/^\uFEFF/, ''));
    if (!value || !Array.isArray(value.combatants)) throw new Error('Choose a tracker encounter JSON file.');
    if (!value.combatants.every(c => c && typeof c.id === 'string' && c.id && typeof c.name === 'string' && c.name.trim() && Number.isFinite(c.initiative) && factions.includes(c.faction)
      && (c.priority === undefined || Number.isSafeInteger(c.priority))
      && (c.legendaryActions === undefined || (Number.isSafeInteger(c.legendaryActions) && c.legendaryActions >= 0 && c.legendaryActions <= 99)))) {
      throw new Error('The JSON contains invalid combatant data.');
    }
    const result = normalize(value);
    if (result.combatants.length !== value.combatants.length) throw new Error('Combatant IDs must be unique.');
    return result;
  }
  function restart(state) {
    state = normalize(state);
    return normalize({ ...state, round: 1, skippedActions: {}, activeId: state.combatants[0]?.id ?? null });
  }
  function upcomingTurns(state) {
    state = normalize(state);
    return displayTurns(state).slice(0, state.display.visibleTurns);
  }
  function upcomingEntries(state) {
    state = normalize(state);
    const order = schedule(state);
    if (!order.length) return [];
    const index = order.findIndex(c => c.id === state.activeId);
    const remaining = order.slice(index);
    const count = Math.min(state.display.visibleTurns, order.length);
    const result = remaining.slice(0, count).map(c => ({ ...c, round: state.round }));
    if (remaining.length <= count) {
      result.push({ type: 'round-transition', endRound: state.round, startRound: state.round + 1 });
      result.push(...schedule({ ...state, round: state.round + 1 }).slice(0, count - remaining.length).map(c => ({ ...c, round: state.round + 1 })));
    }
    return result;
  }
  function currentAndNext(state) {
    state = normalize(state);
    const order = schedule(state);
    const index = order.findIndex(c => c.id === state.activeId);
    if (index < 0) return { current: null, legendaryActions: [], next: null, nextRound: state.round };
    const following = order.slice(index + 1);
    const nextIndex = following.findIndex(c => !c.legendary);
    return {
      current: order[index],
      legendaryActions: nextIndex < 0 ? following : following.slice(0, nextIndex),
      next: nextIndex < 0 ? schedule({ ...state, round: state.round + 1 })[0] : following[nextIndex],
      nextRound: nextIndex < 0 ? state.round + 1 : state.round
    };
  }
  const api = { empty, normalize, add, remove, advance, restart, skipLegendary, pendingLegendary, setLegendary, defaultPriorities, displayTurns, upcomingTurns, upcomingEntries, currentAndNext, parseEncounter, turns: state => schedule(normalize(state)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InitiativeState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
