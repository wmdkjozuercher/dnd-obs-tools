(() => {
  'use strict';
  const model = InitiativeState;
  const key = 'obs-initiative-v1';
  const $ = id => document.getElementById(id);
  let state = model.empty();
  const history = [];
  try { state = model.normalize(JSON.parse(localStorage.getItem(key))); } catch { /* OBS storage may be unavailable. */ }
  function renderOrder() {
    $('combatants').classList.toggle('horizontal', state.layouts.upcoming === 'horizontal');
    $('full-combatants').classList.toggle('horizontal', state.layouts.full === 'horizontal');
    $('now-next').classList.toggle('horizontal-widget', state.layouts.nowNext === 'horizontal');
    for (const key of ['upcoming', 'full', 'nowNext']) {
      $('layout-' + key).querySelectorAll('[data-layout]').forEach(button => {
        const active = button.dataset.layout === state.layouts[key];
        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    const style = document.documentElement.style;
    style.setProperty('--card-width', state.display.cardWidth + 'px');
    style.setProperty('--text-size', state.display.textSize + 'px');
    style.setProperty('--card-spacing', state.display.spacing + 'px');
    style.setProperty('--card-opacity', state.display.opacity / 100);
    for (const key of Object.keys(state.display)) $(key).value = state.display[key];
    $('undo').disabled = !history.length;
    $('restart').disabled = $('reset').disabled = !state.combatants.length;
    const pendingOwners = new Set(state.combatants.filter(c => model.pendingLegendary(state, c.id).length).map(c => c.id));
    document.querySelectorAll('[data-skip-owner]').forEach(button => { button.disabled = !pendingOwners.has(button.dataset.skipOwner); });
    $('round').textContent = $('full-round').textContent = $('now-round').textContent = 'Round ' + state.round;
    $('empty').hidden = state.combatants.length > 0;
    $('previous').disabled = $('next').disabled = !state.combatants.length;
    const createCard = (c, preview = false) => {
      const row = document.createElement('article');
      const active = !preview && c.id === state.activeId;
      row.className = 'combatant ' + c.faction + (c.legendary ? ' legendary' : '') + (active ? ' active' : '') + (c.skipped ? ' skipped' : '');
      if (active) row.setAttribute('aria-current', 'step');
      if (c.legendary) row.setAttribute('aria-label', c.name + ', legendary action ' + c.action);
      const identity = document.createElement('div');
      identity.className = 'identity';
      const name = document.createElement(preview ? 'span' : 'button');
      name.className = 'combatant-name';
      name.textContent = c.name + (c.legendary ? ' Legendary Action' : '');
      if (!preview) name.type = 'button';
      name.title = preview ? 'Next combatant' : 'Select this ' + (c.legendary ? 'legendary action' : 'combatant');
      if (!preview && !c.skipped) name.onclick = () => commit({ ...state, activeId: c.id });
      identity.append(name);
      if (!c.legendary) {
        const score = document.createElement('span');
        score.className = 'score';
        score.textContent = c.initiative;
        const faction = document.createElement('span');
        faction.className = 'allegiance';
        faction.textContent = c.faction;
        identity.append(faction);
        row.append(score);
      }
      row.append(identity);
      if (c.skipped) {
        const skipped = document.createElement('span'); skipped.className = 'skipped-label'; skipped.textContent = 'Skipped'; row.append(skipped);
      }
      if (active) {
        const badge = document.createElement('span');
        badge.className = 'turn';
        badge.textContent = '▶ CURRENT TURN';
        row.append(badge);
      }
      return row;
    };
    const upcoming = model.upcomingEntries(state);
    $('combatants').replaceChildren(...upcoming.map(c => {
      if (c.type !== 'round-transition') return createCard(c, c.round !== state.round);
      const marker = document.createElement('div'); marker.className = 'round-transition';
      const end = document.createElement('span'); end.textContent = 'End of Round ' + c.endRound;
      const start = document.createElement('strong'); start.textContent = 'Start Round ' + c.startRound;
      marker.append(end, start); return marker;
    }));
    $('full-combatants').replaceChildren(...model.turns(state).map(c => createCard(c)));
    const compact = model.currentAndNext(state);
    const widget = $('now-next');
    widget.classList.toggle('without-actions', !compact.legendaryActions.length);
    widget.replaceChildren();
    if (compact.current) {
      const current = document.createElement('div'); current.className = 'widget-current';
      current.append(createCard(compact.current));
      const actions = document.createElement('div'); actions.className = 'widget-actions';
      const groups = [];
      for (const action of compact.legendaryActions) {
        const last = groups[groups.length - 1];
        if (last?.ownerId === action.ownerId && last.skipped === action.skipped) last.count++;
        else groups.push({ ...action, count: 1 });
      }
      for (const group of groups) {
        const card = createCard(group, true);
        card.querySelector('.combatant-name').textContent = group.name + ' Legendary Action' + (group.count > 1 ? ' ×' + group.count : '');
        actions.append(card);
      }
      const next = document.createElement('div'); next.className = 'widget-next';
      const label = document.createElement('div'); label.className = 'next-label';
      label.textContent = 'NEXT COMBATANT' + (compact.nextRound !== state.round ? ' · ROUND ' + compact.nextRound : '');
      next.append(label, createCard(compact.next, true));
      widget.append(current);
      if (groups.length) widget.append(actions);
      widget.append(next);
    }
  }

  function render() {
    renderOrder();
    $('manage').replaceChildren(...state.combatants.map(c => {
      const management = document.createElement('div');
      management.className = 'management';
      const fields = document.createElement('div');
      fields.className = 'management-fields';
      const editName = document.createElement('input');
      editName.type = 'text';
      editName.value = c.name;
      editName.maxLength = 80;
      editName.setAttribute('aria-label', 'Combatant name');
      editName.title = 'Edit name, then press Enter or click away to save';
      editName.onchange = () => {
        const updatedName = editName.value.trim();
        if (!updatedName) { editName.value = state.combatants.find(item => item.id === c.id).name; return; }
        commit({ ...state, combatants: state.combatants.map(item => item.id === c.id ? { ...item, name: updatedName } : item) }, false);
        editName.value = updatedName;
        remove.setAttribute('aria-label', 'Remove ' + updatedName);
      };
      editName.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); editName.blur(); } };
      fields.append(editName);
      const initiativeLabel = document.createElement('label');
      initiativeLabel.className = 'action-setting';
      initiativeLabel.append('Initiative');
      const initiative = document.createElement('input');
      initiative.type = 'number'; initiative.step = '1'; initiative.value = c.initiative;
      initiative.onchange = () => {
        const value = Number(initiative.value);
        if (initiative.value === '' || !initiative.checkValidity() || !Number.isFinite(value)) {
          initiative.value = state.combatants.find(item => item.id === c.id).initiative;
          return;
        }
        commit({ ...state, combatants: state.combatants.map(item => item.id === c.id ? { ...item, initiative: value } : item) }, false);
      };
      initiative.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); initiative.blur(); } };
      initiativeLabel.append(initiative); fields.append(initiativeLabel);
      const priorityLabel = document.createElement('label');
      priorityLabel.className = 'action-setting';
      priorityLabel.append('Priority (lower first)');
      const priority = document.createElement('input');
      priority.type = 'number'; priority.step = '1'; priority.value = c.priority;
      priority.onchange = () => {
        const value = Number(priority.value);
        if (priority.value === '' || !Number.isSafeInteger(value)) {
          priority.value = state.combatants.find(item => item.id === c.id).priority;
          return;
        }
        commit({ ...state, combatants: state.combatants.map(item => item.id === c.id ? { ...item, priority: value } : item) }, false);
      };
      priority.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); priority.blur(); } };
      priorityLabel.append(priority); fields.append(priorityLabel);
      if (c.faction === 'enemy') {
        const label = document.createElement('label');
        label.className = 'action-setting';
        label.append('Legendary actions');
        const count = document.createElement('input');
        count.type = 'number'; count.min = '0'; count.max = '99'; count.step = '1'; count.value = c.legendaryActions;
        count.onchange = () => {
          if (!count.checkValidity() || count.value === '') { count.value = state.combatants.find(item => item.id === c.id).legendaryActions; return; }
          commit(model.setLegendary(state, c.id, Number(count.value)), false);
        };
        count.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); count.blur(); } };
        label.append(count); fields.append(label);
        const skipControls = document.createElement('div'); skipControls.className = 'skip-controls';
        for (const [text, all] of [['Skip Next Legendary Action', false], ['Skip Legendary Actions until next turn', true]]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
          button.dataset.skipOwner = c.id;
          button.disabled = !model.pendingLegendary(state, c.id).length;
          button.onclick = () => commit(model.skipLegendary(state, c.id, all));
          skipControls.append(button);
        }
        fields.append(skipControls);
      }
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + c.name);
      remove.onclick = () => commit(model.remove(state, c.id));
      management.append(fields, remove);
      return management;
    }));
  }
  function commit(next, rerender = true, record = true) {
    const normalized = model.normalize(next);
    if (record && JSON.stringify(normalized) !== JSON.stringify(state)) {
      history.push(state);
      if (history.length > 50) history.shift();
    }
    state = normalized;
    try { localStorage.setItem(key, JSON.stringify(state)); $('status').textContent = ''; }
    catch { $('status').textContent = 'Browser storage unavailable. Keep the source open to retain this encounter.'; }
    if (rerender) render(); else renderOrder();
  }
  $('add-form').onsubmit = event => {
    event.preventDefault();
    const name = $('name').value.trim();
    const initiative = Number($('initiative').value);
    const priority = Number($('priority').value);
    if (!name || !Number.isFinite(initiative) || !Number.isSafeInteger(priority)) return;
    const faction = new FormData(event.currentTarget).get('faction');
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
    commit(model.add(state, { id, name, initiative, faction, priority, legendaryActions: faction === 'enemy' ? Number($('legendary-actions').value) : 0 }));
    $('name').value = ''; $('name').focus();
  };
  $('add-form').addEventListener('change', event => {
    const faction = new FormData($('add-form')).get('faction');
    const enemy = faction === 'enemy';
    if (event.target.name === 'faction') $('priority').value = model.defaultPriorities[faction];
    $('legendary-field').hidden = !enemy;
    $('legendary-actions').disabled = !enemy;
  });
  $('next').onclick = () => commit(model.advance(state, 1));
  $('previous').onclick = () => commit(model.advance(state, -1));
  for (const key of ['upcoming', 'full', 'nowNext']) {
    $('layout-' + key).querySelectorAll('[data-layout]').forEach(button => {
      button.onclick = () => commit({ ...state, layouts: { ...state.layouts, [key]: button.dataset.layout } });
    });
  }
  $('save').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'initiative-round-' + state.round + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('status').textContent = 'JSON download requested. It includes the current turn, round, and legendary-action order.';
  };
  $('load').onclick = () => $('load-file').click();
  $('load-file').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const loaded = model.parseEncounter(await file.text());
      commit(loaded);
      $('status').textContent = 'Encounter loaded.';
    } catch {
      $('status').textContent = 'Could not load this encounter JSON. The current encounter was kept.';
    } finally { event.target.value = ''; }
  };
  $('reset').onclick = () => {
    commit({ ...model.empty(), layout: state.layout, layouts: state.layouts, display: state.display });
    $('status').textContent = 'Encounter cleared. Use Undo to restore it.';
  };
  $('restart').onclick = () => {
    commit(model.restart(state));
    $('status').textContent = 'Combat restarted at round 1 with the same roster.';
  };
  $('undo').onclick = () => {
    if (!history.length) return;
    commit(history.pop(), true, false);
    $('status').textContent = 'Last change undone.';
  };
  for (const setting of Object.keys(state.display)) {
    $(setting).onchange = event => {
      const input = event.target;
      if (input.value === '' || !input.checkValidity()) { input.value = state.display[setting]; return; }
      commit({ ...state, display: { ...state.display, [setting]: Number(input.value) } }, false);
    };
    $(setting).onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } };
  }
  window.addEventListener('storage', event => {
    if (event.key === key) {
      try {
        state = model.normalize(JSON.parse(event.newValue));
        history.length = 0;
        render();
      } catch { /* Ignore invalid saved data. */ }
    }
  });
  render();
})();
