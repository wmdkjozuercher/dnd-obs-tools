const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./state.js');
const combatant = (id, initiative) => ({ id, name: id, initiative, faction: 'enemy' });
const encounter = () => model.add(model.add(model.empty(), combatant('A', 20)), combatant('B', 10));

test('existing combatants receive faction priority defaults and initiative ties use lower priority', () => {
  const state = model.normalize({ combatants: [
    combatant('Enemy', 15),
    { ...combatant('Neutral', 15), faction: 'neutral' },
    { ...combatant('Friendly', 15), faction: 'friendly' },
    combatant('Fast enemy', 20)
  ] });
  assert.deepEqual(state.combatants.map(c => [c.name, c.priority]), [
    ['Fast enemy', 100], ['Friendly', 10], ['Neutral', 50], ['Enemy', 100]
  ]);
});

test('custom priority overrides defaults, persists, and keeps the active turn when edited', () => {
  let state = model.add(model.empty(), { ...combatant('Enemy', 15), priority: 0 });
  state = model.add(state, { ...combatant('Hero', 15), faction: 'friendly' });
  assert.deepEqual(state.combatants.map(c => c.id), ['Enemy', 'Hero']);
  state = model.normalize({ ...state, combatants: state.combatants.map(c => c.id === 'Enemy' ? { ...c, priority: 200 } : c) });
  assert.deepEqual(state.combatants.map(c => c.id), ['Hero', 'Enemy']);
  assert.equal(state.activeId, 'Enemy');
  assert.deepEqual(model.normalize(JSON.parse(JSON.stringify(state))), state);
});

test('equal initiative and priority retain their relative order', () => {
  const state = model.add(model.add(model.empty(), combatant('A', 15)), combatant('B', 15));
  assert.deepEqual(state.combatants.map(c => c.id), ['A', 'B']);
});

test('initiative sorts descending; adding a combatant preserves the active turn', () => {
  const state = model.add(encounter(), combatant('C', 30));
  assert.deepEqual(state.combatants.map(c => c.id), ['C', 'A', 'B']);
  assert.equal(state.activeId, 'A');
});
test('next and previous wrap and update rounds', () => {
  const first = encounter();
  const second = model.advance(first, 1);
  assert.equal(second.activeId, 'B');
  assert.equal(second.round, 1);
  const wrapped = model.advance(second, 1);
  assert.equal(wrapped.activeId, 'A');
  assert.equal(wrapped.round, 2);
  assert.deepEqual(model.advance(wrapped, -1), second);
  assert.equal(model.advance(first, -1).round, 1);
});
test('removing active chooses successor; removing last chooses first', () => {
  assert.equal(model.remove(encounter(), 'A').activeId, 'B');
  assert.equal(model.remove(model.advance(encounter(), 1), 'B').activeId, 'A');
  const empty = model.remove(model.remove(encounter(), 'A'), 'B');
  assert.equal(empty.activeId, null);
  assert.equal(empty.round, 1);
  assert.deepEqual(model.advance(empty, 1), empty);
});
test('single combatant supports round navigation', () => {
  const state = model.add(model.empty(), combatant('A', 10));
  assert.equal(model.advance(state, 1).round, 2);
  assert.equal(model.advance(model.advance(state, 1), -1).round, 1);
});
test('malformed saved state is repaired and duplicate IDs removed', () => {
  const state = model.normalize({ combatants: [null, combatant('A', 3), combatant('A', 2)], activeId: 'missing', round: -2, layout: 'invalid' });
  assert.equal(state.combatants.length, 1);
  assert.equal(state.activeId, 'A');
  assert.equal(state.round, 1);
  assert.equal(state.layout, 'vertical');
});

const legendaryEncounter = (count = 3) => model.normalize({
  combatants: [
    { ...combatant('Dragon', 25), legendaryActions: count },
    { ...combatant('Rogue', 20), faction: 'friendly' },
    { ...combatant('Cleric', 15), faction: 'friendly' },
    { ...combatant('Wizard', 10), faction: 'friendly' },
    { ...combatant('Guard', 5), faction: 'neutral' }
  ], seed: 123456, round: 1
});

test('legendary actions have the exact requested count and follow other combatants', () => {
  for (const count of [0, 1, 3, 12]) {
    const state = legendaryEncounter(count);
    const turns = model.turns(state);
    assert.equal(turns.filter(t => t.legendary).length, count);
    assert.deepEqual(turns.filter(t => !t.legendary).map(t => t.name), state.combatants.map(c => c.name));
    let precedingCombatant;
    const gaps = new Set();
    for (const turn of turns) {
      if (!turn.legendary) precedingCombatant = turn.id;
      else { assert.notEqual(precedingCombatant, turn.ownerId); gaps.add(precedingCombatant); }
    }
    assert.equal(gaps.size, Math.min(4, count));
    assert.equal(new Set(turns.map(t => t.id)).size, turns.length);
  }
});

test('legendary turns participate in navigation and round order survives reload and going back', () => {
  let state = legendaryEncounter();
  const order = model.turns(state);
  const restored = model.normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(model.turns(restored), order);
  for (const turn of order) {
    assert.equal(state.activeId, turn.id);
    state = model.advance(state, 1);
  }
  assert.equal(state.round, 2);
  assert.notDeepEqual(model.turns(state).map(t => t.id), order.map(t => t.id));
  state = model.advance(state, -1);
  assert.equal(state.round, 1);
  assert.equal(state.activeId, order.at(-1).id);
  assert.deepEqual(model.turns(state), order);
});

test('removing an enemy removes all its legendary turns including an active one', () => {
  let state = legendaryEncounter();
  state.activeId = model.turns(state).find(t => t.legendary).id;
  state = model.remove(state, 'Dragon');
  assert.ok(model.turns(state).every(t => t.ownerId !== 'Dragon'));
  assert.ok(model.turns(state).some(t => t.id === state.activeId));
});

test('count edits, rename, and reducing active legendary actions remain valid', () => {
  let state = legendaryEncounter();
  state.activeId = model.turns(state).find(t => t.legendary).id;
  state = model.normalize({ ...state, combatants: state.combatants.map(c => c.id === 'Dragon' ? { ...c, name: 'Ancient dragon' } : c) });
  assert.ok(model.turns(state).filter(t => t.ownerId === 'Dragon').every(t => t.name === 'Ancient dragon'));
  state = model.setLegendary(state, 'Dragon', 0);
  assert.equal(model.turns(state).filter(t => t.legendary).length, 0);
  assert.ok(model.turns(state).some(t => t.id === state.activeId));
});

test('only enemies have legendary actions; lone enemies wait for another combatant', () => {
  let state = model.add(model.empty(), { ...combatant('Dragon', 20), legendaryActions: 3 });
  assert.equal(model.turns(state).length, 1);
  state = model.add(state, { ...combatant('Hero', 10), faction: 'friendly', legendaryActions: 5 });
  assert.equal(model.turns(state).filter(t => t.legendary).length, 3);
  assert.equal(state.combatants.find(c => c.id === 'Hero').legendaryActions, 0);
});

test('multiple legendary enemies retain their individual action counts', () => {
  const state = model.add(legendaryEncounter(3), { ...combatant('Lich', 18), legendaryActions: 2 });
  const turns = model.turns(state);
  assert.equal(turns.filter(t => t.legendary && t.ownerId === 'Dragon').length, 3);
  assert.equal(turns.filter(t => t.legendary && t.ownerId === 'Lich').length, 2);
  let preceding;
  for (const turn of turns) {
    if (!turn.legendary) preceding = turn.id;
    else assert.notEqual(preceding, turn.ownerId);
  }
});

test('display order keeps the current turn first and moves completed turns to the end', () => {
  const start = legendaryEncounter();
  const order = model.turns(start).map(c => c.id);
  let state = start;
  for (let i = 0; i < order.length; i++) {
    assert.deepEqual(model.displayTurns(state).map(c => c.id), [...order.slice(i), ...order.slice(0, i)]);
    state = model.advance(state, 1);
  }
  assert.equal(state.round, 2);
  assert.equal(model.displayTurns(state)[0].id, state.activeId);
  state = model.advance(state, -1);
  assert.deepEqual(model.displayTurns(state).map(c => c.id), [order.at(-1), ...order.slice(0, -1)]);
});

test('JSON load restores the exact encounter and displayed order, including active legendary actions', () => {
  const state = legendaryEncounter();
  state.activeId = model.turns(state).find(c => c.legendary).id;
  state.layout = 'horizontal';
  const restored = model.parseEncounter(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.deepEqual(model.displayTurns(restored), model.displayTurns(state));
  assert.deepEqual(model.parseEncounter('\uFEFF' + JSON.stringify(state)), state);
  assert.deepEqual(model.displayTurns(model.empty()), []);
});

test('JSON load rejects malformed and unrelated files instead of clearing the encounter', () => {
  for (const json of ['oops', 'null', '{}', '[]', '{"combatants":[{}]}']) assert.throws(() => model.parseEncounter(json));
  const duplicate = { combatants: [combatant('A', 1), combatant('A', 1)] };
  assert.throws(() => model.parseEncounter(JSON.stringify(duplicate)));
});

test('compact limit keeps the current turn first while full order includes every entry', () => {
  let state = legendaryEncounter();
  state = model.advance(state, 1);
  state.display.visibleTurns = 3;
  assert.equal(model.upcomingTurns(state).length, 3);
  assert.equal(model.upcomingTurns(state)[0].id, state.activeId);
  assert.deepEqual(model.upcomingTurns(state), model.displayTurns(state).slice(0, 3));
  assert.equal(model.turns(state).length, 8);
  state.display.visibleTurns = 50;
  assert.equal(model.upcomingTurns(state).length, 8);
});

test('restart keeps roster, priorities, legendary counts and display settings but returns to round one', () => {
  let state = legendaryEncounter();
  state = model.normalize({ ...state, round: 4, layout: 'horizontal', display: { visibleTurns: 4, cardWidth: 520, textSize: 24, spacing: 6, opacity: 80 } });
  state.activeId = model.turns(state).at(-1).id;
  const restarted = model.restart(state);
  assert.equal(restarted.round, 1);
  assert.equal(restarted.activeId, 'Dragon');
  assert.deepEqual(restarted.combatants, state.combatants);
  assert.deepEqual(restarted.display, state.display);
  assert.equal(restarted.layout, state.layout);
  assert.equal(restarted.seed, state.seed);
  assert.deepEqual(model.parseEncounter(JSON.stringify(restarted)), restarted);
});

test('initiative edits reorder both views without changing the selected legendary action', () => {
  const original = legendaryEncounter();
  original.activeId = model.turns(original).find(c => c.legendary).id;
  const changed = model.normalize({ ...original, combatants: original.combatants.map(c => c.id === 'Wizard' ? { ...c, initiative: 30 } : c) });
  assert.equal(model.turns(changed)[0].id, 'Wizard');
  assert.equal(changed.activeId, original.activeId);
  assert.equal(model.upcomingTurns(changed)[0].id, original.activeId);
});

test('display settings migrate from older saves and stay in supported bounds', () => {
  const state = model.normalize({ combatants: [], display: { visibleTurns: 0, cardWidth: 20000, textSize: -1, spacing: 100, opacity: -50 } });
  assert.deepEqual(state.display, { visibleTurns: 1, cardWidth: 1000, textSize: 12, spacing: 40, opacity: 0 });
  assert.deepEqual(model.parseEncounter('{"combatants":[]}').display, model.empty().display);
});

test('current-and-next includes intervening legendary actions and always finds the next regular turn', () => {
  let state = legendaryEncounter(12);
  const count = model.turns(state).length;
  for (let i = 0; i < count; i++) {
    const widget = model.currentAndNext(state);
    assert.equal(widget.current.id, state.activeId);
    const actions = [];
    let next = model.advance(state, 1);
    while (model.turns(next).find(c => c.id === next.activeId).legendary) {
      actions.push(next.activeId);
      next = model.advance(next, 1);
    }
    assert.deepEqual(widget.legendaryActions.map(c => c.id), actions);
    assert.equal(widget.next.id, next.activeId);
    assert.equal(widget.next.legendary, false);
    assert.equal(widget.nextRound, next.round);
    state = model.advance(state, 1);
  }
});

test('current-and-next handles empty and lone-combatant encounters', () => {
  assert.deepEqual(model.currentAndNext(model.empty()), { current: null, legendaryActions: [], next: null, nextRound: 1 });
  const state = model.add(model.empty(), combatant('Solo', 10));
  const widget = model.currentAndNext(state);
  assert.equal(widget.current.id, 'Solo');
  assert.equal(widget.next.id, 'Solo');
  assert.equal(widget.nextRound, 2);
});

test('upcoming round marker separates the current round from the actual next round schedule', () => {
  const state = legendaryEncounter();
  const order = model.turns(state);
  state.activeId = order.at(-1).id;
  const entries = model.upcomingEntries(state);
  assert.equal(entries[0].id, state.activeId);
  assert.deepEqual(entries[1], { type: 'round-transition', endRound: 1, startRound: 2 });
  assert.deepEqual(entries.slice(2).map(c => c.id), model.turns({ ...state, round: 2 }).slice(0, state.display.visibleTurns - 1).map(c => c.id));
  assert.ok(entries.slice(2).every(c => c.round === 2));
});

test('skip next marks exactly one pending action and navigation passes over it', () => {
  const original = legendaryEncounter(4);
  const pending = model.turns(original).filter(c => c.legendary);
  let state = model.skipLegendary(original, 'Dragon');
  assert.deepEqual(model.turns(state).filter(c => c.skipped).map(c => c.id), [pending[0].id]);
  for (let i = 0; i < model.turns(state).length; i++) {
    assert.equal(model.turns(state).find(c => c.id === state.activeId).skipped || false, false);
    state = model.advance(state, 1);
  }
  assert.equal(model.turns({ ...state, round: 2 }).filter(c => c.skipped).length, 0);
});

test('skipping the active action advances and skip all preserves labels until restart', () => {
  let state = legendaryEncounter(4);
  state.activeId = model.turns(state).find(c => c.legendary).id;
  const active = state.activeId;
  state = model.skipLegendary(state, 'Dragon');
  assert.notEqual(state.activeId, active);
  assert.ok(model.turns(state).find(c => c.id === active).skipped);
  state = model.skipLegendary(state, 'Dragon', true);
  const pending = model.turns(state).slice(model.turns(state).findIndex(c => c.id === state.activeId));
  assert.ok(pending.filter(c => c.legendary).every(c => c.skipped));
  assert.deepEqual(model.parseEncounter(JSON.stringify(state)), state);
  assert.equal(model.turns(model.restart(state)).filter(c => c.skipped).length, 0);
});

test('skips affect only the selected enemy and the current round, and previous preserves skip history', () => {
  let state = model.add(legendaryEncounter(3), { ...combatant('Lich', 18), legendaryActions: 2 });
  state = model.skipLegendary(state, 'Dragon', true);
  assert.equal(model.turns(state).filter(c => c.skipped).length, 3);
  assert.ok(model.turns(state).filter(c => c.ownerId === 'Lich').every(c => !c.skipped));
  while (state.round === 1) state = model.advance(state, 1);
  assert.ok(model.turns(state).every(c => !c.skipped));
  state = model.advance(state, -1);
  assert.equal(state.round, 1);
  assert.equal(model.turns(state).filter(c => c.skipped).length, 3);
  assert.ok(!model.turns(state).find(c => c.id === state.activeId).skipped);
});

test('each panel has an independent layout with migration from the former shared layout', () => {
  const legacy = model.normalize({ combatants: [], layout: 'horizontal' });
  assert.deepEqual(legacy.layouts, { upcoming: 'horizontal', full: 'horizontal', nowNext: 'horizontal' });
  const state = model.normalize({ ...legacy, layouts: { upcoming: 'vertical', full: 'horizontal', nowNext: 'vertical' } });
  assert.deepEqual(state.layouts, { upcoming: 'vertical', full: 'horizontal', nowNext: 'vertical' });
  assert.deepEqual(model.parseEncounter(JSON.stringify(state)).layouts, state.layouts);
});

const lateDragonEncounter = () => model.normalize({
  ...legendaryEncounter(12), activeId: 'Wizard',
  combatants: legendaryEncounter(12).combatants.map(c => c.id === 'Dragon' ? { ...c, initiative: 12 } : c)
});

test('skip all spans the round boundary and stops at the owner next regular turn', () => {
  const original = lateDragonEncounter();
  const order = model.turns(original);
  const nextRound = model.turns({ ...original, round: 2 });
  const stop = nextRound.findIndex(c => c.id === 'Dragon');
  const currentTail = order.slice(order.findIndex(c => c.id === original.activeId));
  const expected = [
    ...currentTail.filter(c => c.legendary).map(c => [1, c.id]),
    ...nextRound.slice(0, stop).filter(c => c.legendary).map(c => [2, c.id])
  ];
  assert.ok(expected.some(([round]) => round === 1));
  assert.ok(expected.some(([round]) => round === 2));
  const state = model.skipLegendary(original, 'Dragon', true);
  assert.deepEqual(Object.entries(state.skippedActions).flatMap(([round, ids]) => ids.map(id => [Number(round), id])), expected);
  assert.ok(model.turns({ ...state, round: 2 }).slice(stop + 1).filter(c => c.legendary).every(c => !c.skipped));
  assert.deepEqual(model.parseEncounter(JSON.stringify(state)), state);
});

test('skip next can target the next round without skipping its later actions', () => {
  let state = lateDragonEncounter();
  const ids = model.turns(state).filter(c => c.legendary).map(c => c.id);
  state = model.normalize({ ...state, skippedActions: { 1: ids } });
  const pending = model.pendingLegendary(state, 'Dragon');
  assert.ok(pending.length > 1);
  assert.ok(pending.every(c => c.round === 2));
  const skipped = model.skipLegendary(state, 'Dragon');
  assert.deepEqual(skipped.skippedActions[2], [pending[0].id]);
  assert.equal(skipped.activeId, state.activeId);
  assert.equal(skipped.round, 1);
});

test('skip window stops at the owner regular turn within the same round', () => {
  const state = model.normalize({ ...lateDragonEncounter(), activeId: 'Rogue' });
  const order = model.turns(state);
  const beforeOwner = order.slice(0, order.findIndex(c => c.id === 'Dragon')).filter(c => c.legendary);
  const result = model.skipLegendary(state, 'Dragon', true);
  assert.deepEqual(result.skippedActions[1], beforeOwner.map(c => c.id));
  assert.equal(result.skippedActions[2], undefined);
  assert.deepEqual(model.pendingLegendary(result, 'Dragon'), []);
});
