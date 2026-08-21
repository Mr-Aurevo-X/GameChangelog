/* Apply atelier-theme.json tokens onto :root */
(function (global) {
  const KEYS = ["bg", "panel", "panel2", "text", "muted", "accent", "cyan", "ok", "warn"];

  const PRESETS = {
    "amber-ops": {
      preset: "amber-ops",
      bg: "#0a0907",
      panel: "#15120e",
      panel2: "#1c1812",
      text: "#f4efe6",
      muted: "#9a8f7c",
      accent: "#e03545",
      cyan: "#e8a54b",
      ok: "#5cbc7a",
      warn: "#f0b429",
      glowAccent: "0 0 16px rgba(224, 53, 69, .26)",
      glowCyan: "0 0 14px rgba(232, 165, 75, .22)"
    },
    "graphite-minimal": {
      preset: "graphite-minimal",
      bg: "#0b0d10",
      panel: "#14171c",
      panel2: "#1a1e24",
      text: "#e8eaed",
      muted: "#8a919c",
      accent: "#d94856",
      cyan: "#7a8799",
      ok: "#4caf82",
      warn: "#c9a227",
      glowAccent: "0 0 10px rgba(217, 72, 86, .16)",
      glowCyan: "0 0 8px rgba(122, 135, 153, .1)"
    },
    "neon-precision": {
      preset: "neon-precision",
      bg: "#04060a",
      panel: "#0a0e16",
      panel2: "#0f1420",
      text: "#f0f6ff",
      muted: "#7a8aa3",
      accent: "#e03545",
      cyan: "#2ee0ff",
      ok: "#2dff9a",
      warn: "#ffb020",
      glowAccent: "0 0 22px rgba(224, 53, 69, .4)",
      glowCyan: "0 0 20px rgba(46, 224, 255, .35)"
    },
    "pc-command": {
      preset: "pc-command",
      bg: "#06070c",
      panel: "#0e1118",
      panel2: "#12161f",
      text: "#eef2f8",
      muted: "#8490a6",
      accent: "#e03545",
      cyan: "#3ec7ff",
      ok: "#3dd68c",
      warn: "#f0a33a",
      glowAccent: "0 0 18px rgba(224, 53, 69, .28)",
      glowCyan: "0 0 16px rgba(62, 199, 255, .22)"
    },
    "soft-glass": {
      preset: "soft-glass",
      bg: "#0a0c12",
      panel: "#141820",
      panel2: "#1a1f2a",
      text: "#f2f4f8",
      muted: "#8b95a8",
      accent: "#e04555",
      cyan: "#5ec8e8",
      ok: "#4ade98",
      warn: "#e8b04a",
      glowAccent: "0 0 12px rgba(224, 69, 85, .18)",
      glowCyan: "0 0 10px rgba(94, 200, 232, .14)"
    },
    "void-glow": {
      preset: "void-glow",
      label: "Void Glow",
      bg: "#030304",
      panel: "#0a0a0c",
      panel2: "#101012",
      text: "#eef1f6",
      muted: "#8b94a6",
      accent: "#e03545",
      cyan: "#6a9bb8",
      ok: "#3dd68c",
      warn: "#e0a84a",
      glowAccent: "0 0 22px rgba(224, 53, 69, .42)",
      glowCyan: "0 0 16px rgba(106, 155, 184, .28)"
    }
  };

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function soft(rgb, a) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  }

  function applyTheme(theme, targetDoc) {
    if (!theme || typeof theme !== "object") return;
    const doc = targetDoc || document;
    const root = doc.documentElement;
    if (!root) return;
    const preset = theme.preset || "void-glow";
    const merged =
      preset !== "custom" && PRESETS[preset]
        ? Object.assign({}, PRESETS[preset], theme, { preset: preset })
        : Object.assign({}, theme);

    root.setAttribute("data-preset", preset === "custom" ? "custom" : preset);
    if (doc.body) {
      doc.body.classList.remove(
        "theme-void-glow",
        "theme-pc-command",
        "theme-soft-glass",
        "theme-neon-precision",
        "theme-graphite-minimal",
        "theme-amber-ops"
      );
      if (preset !== "custom" && PRESETS[preset]) {
        doc.body.classList.add("theme-" + preset);
      }
    }

    for (const k of KEYS) {
      if (merged[k]) root.style.setProperty("--" + k, merged[k]);
    }

    const accentRgb = hexToRgb(merged.accent);
    const cyanRgb = hexToRgb(merged.cyan);
    const okRgb = hexToRgb(merged.ok);
    const warnRgb = hexToRgb(merged.warn);
    const bgRgb = hexToRgb(merged.bg);

    if (accentRgb) {
      root.style.setProperty("--accent-soft", soft(accentRgb, 0.14));
      root.style.setProperty("--accent-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
      root.style.setProperty(
        "--glow-red",
        merged.glowAccent || `0 0 18px ${soft(accentRgb, 0.28)}`
      );
      root.style.setProperty("--hub-glow-1", soft(accentRgb, 0.42));
    }
    if (cyanRgb) {
      root.style.setProperty("--cyan-soft", soft(cyanRgb, 0.12));
      root.style.setProperty("--cyan-rgb", `${cyanRgb.r}, ${cyanRgb.g}, ${cyanRgb.b}`);
      root.style.setProperty(
        "--glow-cyan",
        merged.glowCyan || `0 0 16px ${soft(cyanRgb, 0.22)}`
      );
      root.style.setProperty("--hub-glow-2", soft(cyanRgb, 0.22));
    }
    if (okRgb) {
      root.style.setProperty("--ok-soft", soft(okRgb, 0.12));
      root.style.setProperty("--glow-green", `0 0 14px ${soft(okRgb, 0.2)}`);
    }
    if (warnRgb) {
      root.style.setProperty("--warn-soft", soft(warnRgb, 0.14));
      root.style.setProperty("--glow-amber", `0 0 16px ${soft(warnRgb, 0.22)}`);
      root.style.setProperty("--hub-glow-3", soft(warnRgb, 0.16));
    }
    if (bgRgb) {
      root.style.setProperty("--bg-rgb", `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`);
    }
    if (merged.panel) root.style.setProperty("--panel", merged.panel);
    if (merged.panel2) root.style.setProperty("--panel2", merged.panel2);
  }

  function mountSettingsPanel(el, opts) {
    if (!el) return null;
    const o = opts || {};
    const presets = o.presets || [
      { id: "void-glow", label: "Void Glow" },
      { id: "pc-command", label: "PC Command" },
      { id: "soft-glass", label: "Soft Glass" },
      { id: "neon-precision", label: "Neon Precision" },
      { id: "graphite-minimal", label: "Graphite Minimal" },
      { id: "amber-ops", label: "Amber Ops" },
    ];
    let state = Object.assign({}, PRESETS["void-glow"] || PRESETS["pc-command"], o.initial || {});

    el.classList.add("pcd-settings");
    el.innerHTML = `
      <h2>Thème</h2>
      <p class="hint">Presets + couleurs manuelles. Enregistré dans %APPDATA%\\Mr-Aurevo-X\\atelier-theme.json</p>
      <div class="preset-row" id="pcdPresetRow"></div>
      <div class="color-grid" id="pcdColorGrid"></div>
      <div class="actions">
        <button type="button" class="pcd-btn primary" id="pcdThemeSave">Enregistrer</button>
        <button type="button" class="pcd-btn ghost" id="pcdThemeReset">Réinitialiser</button>
      </div>
    `;

    const row = el.querySelector("#pcdPresetRow");
    const grid = el.querySelector("#pcdColorGrid");

    function render() {
      row.innerHTML = "";
      for (const p of presets) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "preset-btn" + (state.preset === p.id ? " on" : "");
        b.textContent = p.label;
        b.addEventListener("click", () => {
          const data = PRESETS[p.id] || { preset: p.id };
          Object.assign(state, data, { preset: p.id });
          applyTheme(state);
          render();
          if (typeof o.onPreset === "function") o.onPreset(p.id, Object.assign({}, state));
        });
        row.appendChild(b);
      }
      grid.innerHTML = "";
      for (const k of KEYS) {
        const lab = document.createElement("label");
        lab.className = "color-field";
        lab.innerHTML = `<span>${k}</span>`;
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = /^#[0-9a-fA-F]{6}$/.test(state[k]) ? state[k] : "#000000";
        inp.addEventListener("input", () => {
          state[k] = inp.value;
          state.preset = "custom";
          applyTheme(state);
          render();
        });
        lab.appendChild(inp);
        grid.appendChild(lab);
      }
    }

    el.querySelector("#pcdThemeSave").addEventListener("click", () => {
      if (typeof o.onSave === "function") o.onSave(Object.assign({}, state));
    });
    el.querySelector("#pcdThemeReset").addEventListener("click", () => {
      state = Object.assign({}, o.defaultTheme || PRESETS["void-glow"] || PRESETS["pc-command"]);
      applyTheme(state);
      render();
      if (typeof o.onReset === "function") o.onReset(Object.assign({}, state));
    });

    render();
    applyTheme(state);
    return {
      getState: () => Object.assign({}, state),
      setState: (s) => {
        state = Object.assign({}, state, s || {});
        applyTheme(state);
        render();
      },
      apply: () => applyTheme(state),
      presets: PRESETS,
    };
  }

  global.PcCommandTheme = {
    applyTheme: applyTheme,
    mountSettingsPanel: mountSettingsPanel,
    PRESETS: PRESETS,
  };
})(window);
