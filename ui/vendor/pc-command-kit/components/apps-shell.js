/* PC Command — Apps in-hub (exclusive views + Matrix boot) */
(() => {
  const catalog = window.PC_COMMAND_CATALOG;
  if (!catalog) {
    console.error("[PC Command] catalog.js missing — Apps shell disabled");
    return;
  }

  const viewDash = document.getElementById("view-dashboard");
  const viewApps = document.getElementById("view-apps");
  const viewModule = document.getElementById("view-module");
  const catList = document.getElementById("appsCatList");
  const appGrid = document.getElementById("appsGrid");
  const appsSearch = document.getElementById("appsSearch");
  const appsCount = document.getElementById("appsCount");
  const moduleFrame = document.getElementById("moduleFrame");
  const moduleTitle = document.getElementById("moduleTitle");
  const moduleBlurb = document.getElementById("moduleBlurb");
  const moduleEmpty = document.getElementById("moduleEmpty");
  const navLinks = document.querySelectorAll("[data-view]");
  const matrixBoot = document.getElementById("matrixBoot");
  const matrixCanvas = document.getElementById("matrixCanvas");
  const bootLines = document.getElementById("bootLines");
  const bootTitle = document.getElementById("bootTitle");
  const bootBar = document.getElementById("bootBarFill");

  let activeCat = "essentials";
  let query = "";
  let matrixRaf = 0;

  function setNav(view) {
    navLinks.forEach((a) => {
      const v = a.getAttribute("data-view");
      a.classList.toggle("on", v === view || (view === "module" && v === "apps"));
    });
  }

  function showView(name) {
    document.body.classList.remove("mode-dashboard", "mode-apps", "mode-module");
    document.body.classList.add(`mode-${name === "module" ? "module" : name}`);

    if (viewDash) {
      viewDash.hidden = name !== "dashboard";
      viewDash.style.display = name === "dashboard" ? "" : "none";
    }
    if (viewApps) {
      viewApps.hidden = name !== "apps";
      viewApps.style.display = name === "apps" ? "" : "none";
    }
    if (viewModule) {
      viewModule.hidden = name !== "module";
      viewModule.style.display = name === "module" ? "" : "none";
    }

    setNav(name);
    const livePill = document.getElementById("livePill");
    if (livePill) livePill.style.visibility = name === "dashboard" ? "visible" : "hidden";

    if (name === "apps") {
      try {
        history.replaceState(null, "", "#apps");
      } catch (_) {}
    } else if (name === "dashboard") {
      try {
        history.replaceState(null, "", "#dashboard");
      } catch (_) {}
    }
  }

  function countFor(catId) {
    if (catId === "essentials") {
      return catalog.apps.filter((a) => a.essentials || a.category === "essentials").length;
    }
    return catalog.apps.filter((a) => a.category === catId).length;
  }

  function filteredApps() {
    const q = query.trim().toLowerCase();
    return catalog.apps.filter((a) => {
      const inCat =
        activeCat === "essentials"
          ? a.essentials || a.category === "essentials"
          : a.category === activeCat;
      if (!inCat) return false;
      if (!q) return true;
      return [a.name, a.blurb, a.id, a.category].join(" ").toLowerCase().includes(q);
    });
  }

  function renderCats() {
    if (!catList) return;
    catList.innerHTML = "";
    for (const c of catalog.categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "apps-cat" + (c.id === activeCat ? " on" : "");
      btn.innerHTML = `<span>${c.label}</span><b>${countFor(c.id)}</b>`;
      btn.addEventListener("click", () => {
        activeCat = c.id;
        renderCats();
        renderGrid();
      });
      catList.appendChild(btn);
    }
  }

  function renderGrid() {
    if (!appGrid) return;
    const list = filteredApps();
    if (appsCount) appsCount.textContent = `${list.length} outil${list.length > 1 ? "s" : ""}`;
    appGrid.innerHTML = "";
    if (!list.length) {
      appGrid.innerHTML = `<p class="apps-empty">Aucun outil dans cette catégorie.</p>`;
      return;
    }
    for (const a of list) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `app-card tint-${a.tint || "red"}`;
      card.innerHTML = `
        <span class="app-ico ${a.tint || "red"}">${a.ico || "?"}</span>
        <strong>${a.name}</strong>
        <span class="app-blurb">${a.blurb || ""}</span>
        <span class="app-go">${a.href ? "Lancer module →" : "Aperçu bientôt"}</span>`;
      card.addEventListener("click", () => openModule(a));
      appGrid.appendChild(card);
    }
  }

  function stopMatrix() {
    if (matrixRaf) cancelAnimationFrame(matrixRaf);
    matrixRaf = 0;
    matrixBoot?.classList.remove("on");
  }

  function runMatrixBoot(appName) {
    return new Promise((resolve) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !matrixBoot) {
        resolve();
        return;
      }

      matrixBoot.classList.add("on");
      if (bootTitle) bootTitle.textContent = appName;
      if (bootBar) bootBar.style.width = "0%";

      const lines = [
        "> mount /atelier/modules",
        `> resolve ${appName.toLowerCase().replace(/\s+/g, "_")}.mod`,
        "> handshake tls · local shell",
        "> inject ui chrome · vision_b",
        "> ready.",
      ];
      let li = 0;
      let buf = "";
      if (bootLines) bootLines.textContent = "";

      const ctx = matrixCanvas?.getContext("2d");
      let cols = [];
      let w = 0;
      let h = 0;
      const glyphs = "01アカサタナハマヤラワ<>$#*+ABCDEF";

      function resize() {
        if (!matrixCanvas || !ctx) return;
        w = matrixCanvas.width = window.innerWidth;
        h = matrixCanvas.height = window.innerHeight;
        const font = 14;
        const n = Math.floor(w / font);
        cols = Array.from({ length: n }, () => Math.random() * h);
      }
      resize();

      let start = performance.now();
      const DURATION = 1600;

      function frame(t) {
        const elapsed = t - start;
        const p = Math.min(1, elapsed / DURATION);
        if (bootBar) bootBar.style.width = `${Math.round(p * 100)}%`;

        if (ctx && cols.length) {
          ctx.fillStyle = "rgba(4,6,10,0.18)";
          ctx.fillRect(0, 0, w, h);
          ctx.font = "14px JetBrains Mono, Consolas, monospace";
          cols.forEach((y, i) => {
            const ch = glyphs[(Math.random() * glyphs.length) | 0];
            const x = i * 14;
            ctx.fillStyle = i % 7 === 0 ? "#e03545" : "#3dd68c";
            ctx.fillText(ch, x, y);
            cols[i] = y > h + Math.random() * 80 ? 0 : y + 14 + Math.random() * 8;
          });
        }

        const lineProgress = Math.min(lines.length, Math.floor(p * (lines.length + 0.5)));
        if (bootLines && lineProgress !== li) {
          li = lineProgress;
          buf = lines.slice(0, li).join("\n");
          bootLines.textContent = buf;
        }

        if (p < 1) {
          matrixRaf = requestAnimationFrame(frame);
        } else {
          stopMatrix();
          resolve();
        }
      }
      matrixRaf = requestAnimationFrame(frame);
    });
  }

  async function openModule(app) {
    await runMatrixBoot(app.name);
    showView("module");
    if (moduleTitle) moduleTitle.textContent = app.name;
    if (moduleBlurb) moduleBlurb.textContent = app.blurb || "";
    if (app.href) {
      if (moduleEmpty) moduleEmpty.hidden = true;
      if (moduleFrame) {
        moduleFrame.hidden = false;
        const sep = app.href.includes("?") ? "&" : "?";
        moduleFrame.src = `${app.href}${sep}embed=1`;
      }
    } else {
      if (moduleFrame) {
        moduleFrame.hidden = true;
        moduleFrame.removeAttribute("src");
      }
      if (moduleEmpty) {
        moduleEmpty.hidden = false;
        moduleEmpty.innerHTML = `<strong>${app.name}</strong><p>Mock module à brancher — même chrome PC Command (vision B).</p>`;
      }
    }
  }

  function closeModule() {
    stopMatrix();
    if (moduleFrame) {
      moduleFrame.removeAttribute("src");
      moduleFrame.hidden = true;
    }
    showView("apps");
    renderCats();
    renderGrid();
  }

  function goApps() {
    showView("apps");
    renderCats();
    renderGrid();
  }

  navLinks.forEach((a) => {
    a.addEventListener("click", (e) => {
      const view = a.getAttribute("data-view");
      if (!view) return;
      e.preventDefault();
      e.stopPropagation();
      if (view === "dashboard") {
        showView("dashboard");
        const hash = a.getAttribute("data-hash");
        if (hash) {
          requestAnimationFrame(() => {
            document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        return;
      }
      if (view === "apps") goApps();
    });
  });

  document.getElementById("moduleBack")?.addEventListener("click", closeModule);
  document.getElementById("moduleClose")?.addEventListener("click", closeModule);

  appsSearch?.addEventListener("input", () => {
    query = appsSearch.value || "";
    renderGrid();
  });

  renderCats();
  renderGrid();

  const hash = (location.hash || "").replace("#", "").toLowerCase();
  if (hash === "apps") goApps();
  else showView("dashboard");
})();
