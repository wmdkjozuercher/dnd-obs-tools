(function () {
  const DEFAULT_API_BASE =
    "https://dnd-obs-tools-a7qur8hvi-revengesystem-9895s-projects.vercel.app/api/character";
  const DEFAULT_REFRESH_MS = 10000;

  function getAllModifiers(data) {
    const withSource = (source, mods) =>
      (mods || []).map((mod) => ({ ...mod, sourceType: source }));

    return [
      ...withSource("race", data.modifiers?.race),
      ...withSource("class", data.modifiers?.class),
      ...withSource("background", data.modifiers?.background),
      ...withSource("feat", data.modifiers?.feat),
      ...withSource("item", data.modifiers?.item)
    ];
  }

  function getStatName(statId) {
    return {
      1: "strength",
      2: "dexterity",
      3: "constitution",
      4: "intelligence",
      5: "wisdom",
      6: "charisma"
    }[statId];
  }

  function getAllOptions(data) {
    return [
      ...(data.choices?.race || []),
      ...(data.choices?.class || []),
      ...(data.choices?.background || []),
      ...(data.choices?.feat || []),
      ...(data.choices?.item || []),
      ...(data.options?.race || []),
      ...(data.options?.class || []),
      ...(data.options?.background || []),
      ...(data.options?.feat || []),
      ...(data.options?.item || [])
    ];
  }

  function getChoiceIdSuffix(choiceId) {
    return String(choiceId || "").split("-").pop();
  }

  function isSelectedChoiceModifier(data, modifier) {
    const modifierId = String(modifier.id || "");
    if (!modifierId) return false;

    return getAllOptions(data).some(
      (choice) => getChoiceIdSuffix(choice.id) === modifierId
    );
  }

  function isActiveItemModifier(data, modifier) {
    const items = data.inventory || [];
    const matchingItems = items.filter(
      (item) =>
        item.id === modifier.componentId ||
        item.definition?.id === modifier.componentId
    );

    if (!matchingItems.length) return modifier.isGranted !== false;

    return matchingItems.some(
      (item) =>
        item.equipped && (!modifier.requiresAttunement || item.isAttuned)
    );
  }

  function isActiveModifier(data, modifier) {
    if (modifier.sourceType === "item" && !isActiveItemModifier(data, modifier)) {
      return false;
    }

    return modifier.isGranted !== false || isSelectedChoiceModifier(data, modifier);
  }

  function isStatModifier(modifier, statId) {
    const statName = getStatName(statId);
    const abilityScoreEntityTypeId = 1472902489;

    return (
      modifier.subType === `${statName}-score` ||
      (modifier.entityTypeId === abilityScoreEntityTypeId &&
        modifier.entityId === statId)
    );
  }

  function getStatModifiers(data, statId) {
    let total = 0;

    for (const modifier of getAllModifiers(data)) {
      if (!isActiveModifier(data, modifier)) continue;

      const value = Number(modifier.value ?? modifier.fixedValue ?? 0);
      if (!value || !isStatModifier(modifier, statId)) continue;

      total += value;
    }

    return total;
  }

  function getStat(data, statId) {
    const base = data.stats?.find((stat) => stat.id === statId)?.value ?? 10;
    const rawBonus = data.bonusStats?.find((stat) => stat.id === statId)?.value;
    const bonus = rawBonus == null ? 0 : rawBonus;
    const override = data.overrideStats?.find((stat) => stat.id === statId)?.value;
    const modifierBonus = getStatModifiers(data, statId);

    if (override != null) return override;

    return base + bonus + modifierBonus;
  }

  function getStatBreakdown(data, statId) {
    const base = data.stats?.find((stat) => stat.id === statId)?.value ?? 10;
    const rawBonus = data.bonusStats?.find((stat) => stat.id === statId)?.value;
    const bonus = rawBonus == null ? 0 : rawBonus;
    const override = data.overrideStats?.find((stat) => stat.id === statId)?.value;
    const contributions = [];
    let modifierTotal = 0;

    for (const modifier of getAllModifiers(data)) {
      if (!isActiveModifier(data, modifier)) continue;

      const value = Number(modifier.value ?? modifier.fixedValue ?? 0);
      if (!value || !isStatModifier(modifier, statId)) continue;

      modifierTotal += value;
      contributions.push({
        source: modifier.friendlySubtypeName || modifier.subType || "unknown",
        value,
        selectedChoice: modifier.isGranted === false
      });
    }

    return {
      base,
      bonus,
      modifierTotal,
      contributions,
      total: override != null ? override : base + bonus + modifierTotal
    };
  }

  function getModifiers(data, subType) {
    return getAllModifiers(data)
      .filter((modifier) => modifier.subType === subType && isActiveModifier(data, modifier))
      .reduce((sum, modifier) => {
        const value = modifier.value ?? modifier.fixedValue ?? 0;
        return sum + Number(value || 0);
      }, 0);
  }

  function getLevel(data) {
    if (!data.classes) return 1;
    return data.classes.reduce((sum, cls) => sum + (cls.level || 0), 0);
  }

  function getHpBreakdown(data) {
    const level = getLevel(data);
    const conTotal = getStat(data, 3);
    const conMod = Math.floor((conTotal - 10) / 2);
    const perLevel = getModifiers(data, "hit-points-per-level");
    const flat = getModifiers(data, "hit-points");
    const base = data.baseHitPoints ?? 0;
    const bonus = Number(data.bonusHitPoints ?? 0);

    return {
      level,
      base,
      bonus,
      conMod,
      conBonus: conMod * level,
      perLevelBonus: perLevel * level,
      flatBonus: flat,
      total: base + bonus + conMod * level + perLevel * level + flat
    };
  }

  function calculateMaxHp(data) {
    if (data.overrideHitPoints) {
      return data.overrideHitPoints;
    }

    const level = getLevel(data);
    const conTotal = getStat(data, 3);
    const conMod = Math.floor((conTotal - 10) / 2);
    const base = data.baseHitPoints ?? 0;
    const bonus = Number(data.bonusHitPoints ?? 0);
    const perLevelBonus = getModifiers(data, "hit-points-per-level");
    const flatBonus = getModifiers(data, "hit-points");

    return base + bonus + conMod * level + perLevelBonus * level + flatBonus;
  }

  async function fetchCharacter(id, apiBase) {
    try {
      const res = await fetch(`${apiBase}/${id}`);
      const json = await res.json();
      const data = json.data;
      const maxHp = Number(calculateMaxHp(data) ?? 1);
      const damage = Number(data.removedHitPoints ?? 0);
      const tempHp = Number(data.temporaryHitPoints ?? 0);
      const hp = maxHp - damage;

      return {
        name: data.name,
        hp,
        maxHp,
        tempHp,
        debug: {
          con: getStatBreakdown(data, 3),
          hp: getHpBreakdown(data)
        }
      };
    } catch (err) {
      console.error("Failed:", id, err);
      return null;
    }
  }

  function getHealthColor(percent) {
    if (percent < 30) return "#e53935";
    if (percent < 70) return "#fbc02d";
    return "#4caf50";
  }

  function clampPercent(percent) {
    return Math.max(0, Math.min(100, percent));
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function render(container, chars) {
    container.innerHTML = chars
      .map((character) => {
        const percent = character.maxHp > 0 ? (character.hp / character.maxHp) * 100 : 0;
        const width = clampPercent(percent);
        const color = getHealthColor(percent);

        return `
          <div class="ddb-hp-bar">
            <div class="ddb-hp-bar__name">${escapeHtml(character.name)}</div>
            <div class="ddb-hp-bar__track">
              <div class="ddb-hp-bar__fill" style="width:${width}%;background:${color};"></div>
              ${
                character.tempHp
                  ? '<div class="ddb-hp-bar__temp"></div>'
                  : ""
              }
              <div class="ddb-hp-bar__label">
                ${character.hp} / ${character.maxHp}
                ${character.tempHp ? `(+${character.tempHp})` : ""}
              </div>
            </div>
            <div class="ddb-hp-bar__debug">
              <div><strong>CON:</strong> ${character.debug.con.total}</div>
              <div>
                ${character.debug.con.base} (base)
                ${character.debug.con.bonus ? `+ ${character.debug.con.bonus}` : ""}
                ${character.debug.con.contributions.map((item) => `+ ${item.value}`).join(" ")}
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderDndBeyondHpBars(options) {
    const config = Array.isArray(options)
      ? { characterIds: options }
      : options || {};
    const characterIds = config.characterIds || [];
    const container =
      typeof config.container === "string"
        ? document.querySelector(config.container)
        : config.container || document.getElementById(config.elementId || "app");
    const apiBase = config.apiBase || DEFAULT_API_BASE;
    const refreshMs = config.refreshMs ?? DEFAULT_REFRESH_MS;

    if (!container) {
      throw new Error("HP bars container was not found.");
    }

    container.classList.add("ddb-hp-bars");

    async function update() {
      const chars = await Promise.all(
        characterIds.map((id) => fetchCharacter(id, apiBase))
      );

      render(container, chars.filter(Boolean));
    }

    update();

    if (refreshMs === false || refreshMs <= 0) {
      return { update };
    }

    const intervalId = setInterval(update, refreshMs);
    return {
      update,
      stop: () => clearInterval(intervalId)
    };
  }

  window.renderDndBeyondHpBars = renderDndBeyondHpBars;
})();
