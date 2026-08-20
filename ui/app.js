/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
const state = {
  watchlist: [],
  feed: [],
  bugs: [],
  selectedAppid: null,
  selectedEntryId: null,
  patchOnly: false,
  favoritesOnly: false,
  activeTab: "feed",
  searchTimer: null,
  refreshTimer: null,
  importTimer: null,
  detailUrl: "",
  steamdbUrl: "",
  statusData: null,
};

const $ = (id) => document.getElementById(id);

function api() {
  return window.pywebview?.api;
}

function waitForApi() {
  return new Promise((resolve) => {
    if (api()) {
      resolve(api());
      return;
    }
    window.addEventListener("pywebviewready", () => resolve(api()), { once: true });
  });
}

function formatDate(epoch) {
  if (!epoch) return "Date inconnue";
  const date = new Date(Number(epoch) * 1000);
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDate(epoch) {
  if (!epoch) return "";
  const diff = Date.now() - Number(epoch) * 1000;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

function setAccent(accent) {
  if (accent) {
    document.documentElement.style.setProperty("--accent", accent);
  }
}

function showLoading(show, text = "Chargement…", percent = 0) {
  const overlay = $("loadingOverlay");
  overlay.hidden = !show;
  $("loadingText").textContent = text;
  $("loadingBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function loadSettings() {
  const res = await api().get_suite_settings();
  if (res?.ok) setAccent(res.accent);
}

async function loadWatchlist() {
  const res = await api().get_watchlist();
  if (!res?.ok) return;
  state.watchlist = res.games || [];
  renderWatchlist();
}

async function loadFeed() {
  const res = await api().get_feed({
    appid: state.selectedAppid,
    patch_only: state.patchOnly,
    favorites_only: state.favoritesOnly,
    limit: 200,
  });
  if (!res?.ok) return;
  state.feed = res.entries || [];
  renderFeed();
}

function renderWatchlist() {
  const root = $("watchlist");
  const visible = state.favoritesOnly
    ? state.watchlist.filter((g) => Number(g.favorite || 0) === 1)
    : state.watchlist;
  $("gameCount").textContent = String(visible.length);
  if (!visible.length) {
    root.innerHTML = `<p class="empty-hint">${state.favoritesOnly ? "Aucun favori pour le moment." : "Recherchez un jeu ou saisissez un AppID Steam."}</p>`;
    return;
  }

  root.innerHTML = visible
    .map((game) => {
      const active = state.selectedAppid === game.appid ? "active" : "";
      const unread = Number(game.unread_count || 0);
      const installed = Number(game.installed || 0) === 1;
      const fav = Number(game.favorite || 0) === 1;
      const bugs = Number(game.open_bugs || 0);
      const unreadLabel = [
        installed ? (unread > 0 ? `${unread} nouveau(x)` : "installé") : "non installé",
        bugs > 0 ? `${bugs} bug(s)` : null,
      ].filter(Boolean).join(" · ");
      const icon = game.icon_url
        ? `<img src="${escapeHtml(game.icon_url)}" alt="" />`
        : '<div class="brand-icon" style="width:40px;height:40px;font-size:.8rem;">GC</div>';
      return `
        <div class="game-item ${active}" data-appid="${game.appid}">
          ${icon}
          <div>
            <strong>${escapeHtml(game.name)}</strong>
            <small>${unreadLabel}</small>
          </div>
          <button class="fav-btn ${fav ? "on" : ""}" data-fav="${game.appid}" title="Favori">${fav ? "★" : "☆"}</button>
          <button class="game-remove" data-remove="${game.appid}" title="Retirer">✕</button>
        </div>
      `;
    })
    .join("");

  root.querySelectorAll(".game-item").forEach((item) => {
    item.addEventListener("click", async (event) => {
      if (event.target.closest("[data-remove]") || event.target.closest("[data-fav]")) return;
      const appid = Number(item.dataset.appid);
      const same = state.selectedAppid === appid;
      state.selectedAppid = same ? null : appid;
      renderWatchlist();
      updateBugHint();
      if (!same && state.activeTab === "feed") {
        showLoading(true, "Mise à jour des patch notes…", 20);
        try {
          await api().refresh_game(appid);
        } catch (_) {
          /* keep cached feed */
        }
        showLoading(false);
      }
      await loadFeed();
      await loadBugs();
      await updateLastSync();
    });
  });

  root.querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const appid = Number(btn.dataset.fav);
      const game = state.watchlist.find((g) => Number(g.appid) === appid);
      const next = !(Number(game?.favorite || 0) === 1);
      await api().set_favorite(appid, next);
      await loadWatchlist();
      await loadFeed();
    });
  });

  root.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const appid = Number(btn.dataset.remove);
      await api().remove_game(appid);
      if (state.selectedAppid === appid) state.selectedAppid = null;
      await loadWatchlist();
      await loadFeed();
      await loadBugs();
    });
  });
}

function renderFeed() {
  const root = $("feedList");
  $("feedCount").textContent = `${state.feed.length} entrée(s)`;
  if (!state.feed.length) {
    root.innerHTML = '<p class="empty-hint">Aucun changelog pour le moment.</p>';
    return;
  }

  root.innerHTML = state.feed
    .map((entry) => {
      const active = state.selectedEntryId === entry.entry_id ? "active" : "";
      const unread = Number(entry.is_read) === 0 ? "unread" : "";
      return `
        <button class="feed-item ${active} ${unread}" data-entry="${escapeHtml(entry.entry_id)}">
          <div class="feed-top">
            <div>
              <h3>${escapeHtml(entry.title)}</h3>
              <p class="muted">${escapeHtml(entry.game_name)} · ${relativeDate(entry.published_at)}</p>
            </div>
            <span class="badge">${escapeHtml(entry.source_label || entry.source || "Steam")}</span>
          </div>
          <p class="muted">${formatDate(entry.published_at)}</p>
        </button>
      `;
    })
    .join("");

  root.querySelectorAll(".feed-item").forEach((item) => {
    item.addEventListener("click", () => openDetail(item.dataset.entry));
  });
}

async function openDetail(entryId) {
  state.selectedEntryId = entryId;
  renderFeed();
  const res = await api().get_changelog(entryId);
  if (!res?.ok || !res.entry) return;

  const entry = res.entry;
  state.detailUrl = safeHttpUrl(entry.url || "");
  state.steamdbUrl = safeHttpUrl(
    entry.steamdb_url || (entry.appid ? `https://steamdb.info/app/${entry.appid}/patchnotes/` : "")
  );
  $("detailEmpty").hidden = true;
  $("detailView").hidden = false;
  $("detailGame").textContent = entry.game_name || "";
  $("detailTitle").textContent = entry.title || "";
  $("detailDate").textContent = formatDate(entry.published_at);
  $("detailSource").textContent = entry.source_label || entry.source || "Steam";
  // content_html is allowlist-sanitized on the host; still only assign trusted fragment.
  $("detailContent").innerHTML = entry.content_html || "<p>Contenu indisponible.</p>";
  const icon = $("detailIcon");
  const iconUrl = safeHttpUrl(entry.icon_url || "");
  if (iconUrl) {
    icon.src = iconUrl;
    icon.hidden = false;
  } else {
    icon.hidden = true;
  }

  await api().mark_read(entryId);
  await loadWatchlist();
  await loadFeed();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Allow only http(s) URLs for window.open / img src. */
function safeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch (_) {
    return "";
  }
}

function renderSearchResults(results) {
  const root = $("searchResults");
  if (!results.length) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }
  root.hidden = false;
  root.innerHTML = results
    .map(
      (game) => `
      <button class="search-item" data-appid="${game.appid}" data-name="${escapeHtml(game.name)}" data-icon="${escapeHtml(game.icon_url || "")}" data-store="${escapeHtml(game.store_url || "")}">
        ${game.icon_url ? `<img src="${escapeHtml(game.icon_url)}" alt="" />` : '<div class="brand-icon" style="width:36px;height:36px;font-size:.7rem;">GC</div>'}
        <div>
          <strong>${escapeHtml(game.name)}</strong>
          <div class="muted">Steam AppID ${game.appid}</div>
        </div>
      </button>
    `,
    )
    .join("");

  root.querySelectorAll(".search-item").forEach((item) => {
    item.addEventListener("click", () => addGameFromSearch(item));
  });
}

async function addGameFromSearch(item) {
  const appid = Number(item.dataset.appid);
  const name = item.dataset.name;
  const icon = item.dataset.icon;
  const store = item.dataset.store;
  const root = $("searchResults");
  try {
    await api().add_game(appid, name, icon, store);
    if (root) {
      root.hidden = true;
    }
    $("searchInput").value = "";
    await loadWatchlist();
    showLoading(true, "Chargement des patch notes…", 20);
    try {
      await api().refresh_game(appid);
    } catch (_) {
      /* cached feed if any */
    }
    showLoading(false);
    state.selectedAppid = appid;
    renderWatchlist();
    await loadFeed();
    await updateLastSync();
  } catch (err) {
    alert(String(err?.message || err || "Impossible d'ajouter le jeu."));
  }
}

async function addGameByAppId(raw) {
  const trimmed = String(raw || "").trim();
  if (!/^\d{1,8}$/.test(trimmed)) {
    alert("Saisissez un AppID Steam valide (chiffres uniquement, ex. 570).");
    return;
  }
  const appid = Number(trimmed);
  const res = await api().add_game_by_appid(appid);
  if (!res?.ok) {
    alert(res?.error || "Impossible d'ajouter ce jeu.");
    return;
  }
  $("addAppIdInput").value = "";
  await loadWatchlist();
  showLoading(true, "Chargement des patch notes…", 20);
  try {
    await api().refresh_game(appid);
  } catch (_) {
    /* keep going */
  }
  showLoading(false);
  state.selectedAppid = appid;
  renderWatchlist();
  await loadFeed();
  await updateLastSync();
}

async function runSearch(query) {
  const trimmed = (query || "").trim();
  if (trimmed.length < 2) {
    renderSearchResults([]);
    return;
  }
  const res = await api().search_games(trimmed);
  renderSearchResults(res?.results || []);
}

async function pollRefreshProgress() {
  const res = await api().get_refresh_progress();
  if (!res) return;

  if (res.running) {
    const total = Number(res.total || 0);
    const current = Number(res.current || 0);
    const percent = total > 0 ? Math.round((current / total) * 100) : 5;
    const label = res.game_name
      ? `Chargement ${current}/${total} — ${res.game_name}`
      : `Chargement ${current}/${total}…`;
    showLoading(true, label, percent);
    return;
  }

  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  showLoading(false);
  if (res.error) {
    alert(`Erreur d'actualisation : ${res.error}`);
  }
  await loadWatchlist();
  await loadFeed();
  await updateLastSync();
}

async function updateLastSync() {
  try {
    const res = await api().get_last_refresh_info();
    const el = $("lastSync");
    if (!el) return;
    if (res?.ok && res.last_fetched) {
      el.textContent = `Sync ${res.last_fetched}`;
    } else {
      el.textContent = "Sync —";
    }
  } catch (_) {
    /* ignore */
  }
}

async function startRefresh(installedOnly = false) {
  // Guard against accidental Event objects from onclick handlers.
  if (typeof installedOnly !== "boolean") {
    installedOnly = true;
  }
  const res = await api().refresh_all(!!installedOnly);
  if (!res?.ok) {
    showLoading(false);
    alert(res?.error || "Impossible d'actualiser.");
    return;
  }
  if (!res.started) {
    showLoading(false);
    await loadFeed();
    await updateLastSync();
    return;
  }
  showLoading(
    true,
    installedOnly ? "Actualisation des jeux installés…" : "Actualisation de toute la liste…",
    4,
  );
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(pollRefreshProgress, 500);
  pollRefreshProgress();
}

function dismissLoading() {
  if (state.importTimer) {
    clearInterval(state.importTimer);
    state.importTimer = null;
  }
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  showLoading(false);
}

async function pollImportProgress() {
  const res = await api().get_import_progress();
  if (!res) return null;

  // Wait until a real import session has started or finished.
  if (res.running) {
    const label =
      res.phase === "import"
        ? "Import de vos jeux Steam…"
        : "Détection de votre bibliothèque Steam…";
    showLoading(true, label, res.phase === "import" ? 35 : 12);
    return null;
  }

  if (!res.done) {
    return null;
  }

  clearInterval(state.importTimer);
  state.importTimer = null;

  if (res.error) {
    return { ok: false, imported: 0, error: res.error };
  }

  return { ok: true, imported: Number(res.imported || 0) };
}

function waitForImport(timeoutMs = 12000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let sawRunning = false;

    const finish = (result) => {
      if (state.importTimer) {
        clearInterval(state.importTimer);
        state.importTimer = null;
      }
      resolve(result);
    };

    const tick = async () => {
      if (Date.now() - startedAt > timeoutMs) {
        finish({
          ok: false,
          imported: 0,
          error: "Délai dépassé — disque externe trop lent. Utilisez Sync plus tard.",
        });
        return;
      }
      try {
        const res = await api().get_import_progress();
        if (!res) return;
        if (res.running) {
          sawRunning = true;
          const label =
            res.phase === "import"
              ? "Import de vos jeux Steam…"
              : "Détection de votre bibliothèque Steam…";
          showLoading(true, label, res.phase === "import" ? 35 : 12);
          return;
        }
        // Ignore the initial idle state until we have seen running=true once,
        // or until enough time passed that the API never started.
        if (!sawRunning && Date.now() - startedAt < 1500) {
          return;
        }
        if (res.done || sawRunning) {
          finish({
            ok: !res.error,
            imported: Number(res.imported || 0),
            error: res.error || null,
          });
        }
      } catch (err) {
        finish({ ok: false, imported: 0, error: String(err) });
      }
    };

    if (state.importTimer) clearInterval(state.importTimer);
    state.importTimer = setInterval(tick, 250);
    tick();
  });
}

async function importSteamLibrary(force = false) {
  showLoading(true, force ? "Synchronisation de la bibliothèque Steam…" : "Détection de votre bibliothèque Steam…", 8);
  let start;
  try {
    start = await api().import_steam_library(!!force);
  } catch (err) {
    showLoading(false);
    if (force) alert(String(err));
    return { ok: false, imported: 0 };
  }
  if (!start?.ok) {
    showLoading(false);
    if (force) alert(start?.error || "Impossible d'importer la bibliothèque Steam.");
    return { ok: false, imported: 0 };
  }
  if (!start.started) {
    showLoading(false);
    return { ok: true, imported: 0 };
  }

  const res = await waitForImport(12000);
  await loadWatchlist();

  if (!res?.ok) {
    showLoading(false);
    const msg = res?.error || "Impossible d'importer la bibliothèque Steam.";
    if (force) alert(msg);
    else console.warn("[GameChangelog] import:", msg);
    return { ok: false, imported: 0, error: msg };
  }

  if (Number(res.imported || 0) > 0) {
    showLoading(true, `${res.imported} jeu(x) trouvé(s) — changelogs des jeux installés…`, 20);
    await startRefresh(true);
    return res;
  }

  showLoading(false);
  return res;
}

async function maybeImportSteamLibraryOnFirstLaunch() {
  try {
    const check = await api().should_import_steam_library();
    if (!check?.ok || !check.should_import) {
      if (check?.last_import_error) {
        console.warn("[GameChangelog] previous import:", check.last_import_error);
      }
      return { imported: 0 };
    }
    const res = await importSteamLibrary(false);
    if (res?.error) {
      alert(`Import Steam : ${res.error}`);
    }
    return res;
  } catch (err) {
    showLoading(false);
    const msg = String(err);
    alert(`Import Steam : ${msg}`);
    return { ok: false, imported: 0, error: msg };
  }
}

function updateBugHint() {
  const hint = $("bugGameHint");
  if (!hint) return;
  if (!state.selectedAppid) {
    hint.textContent = "Sélectionnez un jeu dans la sidebar.";
    return;
  }
  const game = state.watchlist.find((g) => Number(g.appid) === Number(state.selectedAppid));
  hint.textContent = game ? `Jeu ciblé : ${game.name}` : `AppID ${state.selectedAppid}`;
}

async function loadBugs() {
  const res = await api().get_bugs(state.selectedAppid);
  if (!res?.ok) return;
  state.bugs = res.bugs || [];
  renderBugs();
}

function renderBugs() {
  const root = $("bugsList");
  const count = $("bugCount");
  if (count) count.textContent = `${state.bugs.length}`;
  if (!state.bugs.length) {
    root.innerHTML = '<p class="empty-hint">Aucun bug enregistré pour ce filtre.</p>';
    return;
  }
  root.innerHTML = state.bugs
    .map((bug) => `
      <div class="bug-item" data-bug="${bug.id}">
        <h3>${escapeHtml(bug.title)}</h3>
        <p class="muted">${escapeHtml(bug.game_name)} · ${escapeHtml(bug.status)} · ${escapeHtml(bug.updated_at || "")}</p>
        <p>${escapeHtml(bug.body || "")}</p>
        <div class="bug-actions">
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="open">Ouvert</button>
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="watching">En suivi</button>
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="done">Résolu</button>
          <button type="button" class="btn ghost" data-bug-del="${bug.id}">Supprimer</button>
        </div>
      </div>
    `)
    .join("");

  root.querySelectorAll("[data-bug-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api().update_bug_status(Number(btn.dataset.bugStatus), btn.dataset.status);
      await loadBugs();
      await loadWatchlist();
    });
  });
  root.querySelectorAll("[data-bug-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api().delete_bug(Number(btn.dataset.bugDel));
      await loadBugs();
      await loadWatchlist();
    });
  });
}

async function loadStatusDashboard() {
  const res = await api().get_status_dashboard();
  if (!res?.ok) {
    $("statusOverall").textContent = res?.error || "Impossible de charger le statut.";
    return;
  }
  state.statusData = res;
  const steam = res.steam || {};
  const overall = steam.overall || "—";
  const label = overall === "ok" ? "Tous les services Steam répondent" : overall === "degraded" ? "Perturbations détectées" : "Incident probable";
  $("statusOverall").textContent = `${label} · ${steam.checked_at || ""}`;
  $("steamServices").innerHTML = (steam.services || [])
    .map((s) => `
      <div class="status-card">
        <div><span class="dot ${escapeHtml(s.status)}"></span><strong>${escapeHtml(s.name)}</strong></div>
        <p class="muted">${escapeHtml(s.status)} · ${s.ms || 0} ms</p>
      </div>
    `)
    .join("");
  const list = $("gameStatusList");
  const games = res.games || [];
  if (!games.length) {
    list.innerHTML = '<p class="empty-hint">Aucun jeu à afficher.</p>';
    return;
  }
  list.innerHTML = games
    .map((g) => `
      <div class="game-status-item">
        <strong>${g.favorite ? "★ " : ""}${escapeHtml(g.name)}</strong>
        <p class="muted">${g.installed ? "installé" : "non installé"}</p>
        <div class="game-status-actions">
          <button type="button" class="btn ghost" data-open-url="${escapeHtml(g.downdetector_url)}" title="${g.downdetector_exact ? "Page Downdetector du jeu" : "Pas de page jeu connue → Steam"}">${g.downdetector_exact ? "Downdetector" : "Downdetector Steam"}</button>
          <button type="button" class="btn ghost" data-open-url="${escapeHtml(g.steam_discussions_url)}">Discussions</button>
          <button type="button" class="btn ghost" data-open-url="${escapeHtml(g.steam_news_url)}">News Steam</button>
        </div>
      </div>
    `)
    .join("");
  list.querySelectorAll("[data-open-url]").forEach((btn) => {
    btn.addEventListener("click", () => window.open(btn.dataset.openUrl, "_blank"));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  $("panelFeed").hidden = tab !== "feed";
  $("panelBugs").hidden = tab !== "bugs";
  $("panelStatus").hidden = tab !== "status";
  $("panelFeed").classList.toggle("active", tab === "feed");
  $("panelBugs").classList.toggle("active", tab === "bugs");
  $("panelStatus").classList.toggle("active", tab === "status");
  if (tab === "bugs") {
    updateBugHint();
    loadBugs();
  }
  if (tab === "status") {
    loadStatusDashboard();
  }
}

function bindEvents() {
  $("searchInput").addEventListener("input", (event) => {
    clearTimeout(state.searchTimer);
    const value = event.target.value;
    state.searchTimer = setTimeout(() => runSearch(value), 300);
  });

  $("patchOnlyToggle").addEventListener("change", async (event) => {
    state.patchOnly = event.target.checked;
    await loadFeed();
  });

  $("favoritesOnlyToggle").addEventListener("change", async (event) => {
    state.favoritesOnly = event.target.checked;
    renderWatchlist();
    await loadFeed();
  });

  $("refreshBtn").addEventListener("click", () => startRefresh(false));

  $("readAllBtn").addEventListener("click", async () => {
    const filters = {
      appid: state.selectedAppid || null,
      patch_only: !!state.patchOnly,
      favorites_only: !!state.favoritesOnly,
    };
    const res = await api().mark_all_read(filters.appid, filters);
    if (!res?.ok) {
      alert(res?.error || "Impossible de tout marquer comme lu.");
      return;
    }
    await loadWatchlist();
    await loadFeed();
  });

  $("syncLibraryBtn").addEventListener("click", async () => {
    await importSteamLibrary(true);
  });

  $("addAppIdForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addGameByAppId($("addAppIdInput")?.value);
  });

  $("skipLoadingBtn").addEventListener("click", async () => {
    dismissLoading();
    await loadWatchlist();
    await loadFeed();
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("addBugBtn").addEventListener("click", async () => {
    if (!state.selectedAppid) {
      alert("Sélectionnez d'abord un jeu dans la sidebar.");
      return;
    }
    const title = $("bugTitle").value.trim();
    const body = $("bugBody").value.trim();
    const res = await api().add_bug(state.selectedAppid, title, body);
    if (!res?.ok) {
      alert(res?.error || "Impossible d'ajouter le bug.");
      return;
    }
    $("bugTitle").value = "";
    $("bugBody").value = "";
    await loadBugs();
    await loadWatchlist();
  });

  $("openBugForumBtn").addEventListener("click", async () => {
    if (!state.selectedAppid) {
      alert("Sélectionnez un jeu.");
      return;
    }
    const res = await api().get_bug_links(state.selectedAppid);
    if (res?.ok && res.discussions_url) window.open(res.discussions_url, "_blank");
  });

  $("refreshStatusBtn").addEventListener("click", () => loadStatusDashboard());
  $("openSteamStatusBtn").addEventListener("click", () => window.open("https://steamstat.us/", "_blank"));
  $("openDdSteamBtn").addEventListener("click", () => window.open("https://downdetector.fr/statut/steam/", "_blank"));

  $("openSteamBtn").addEventListener("click", () => {
    const url = safeHttpUrl(state.detailUrl);
    if (url) window.open(url, "_blank");
  });

  $("openSteamDbBtn").addEventListener("click", () => {
    const url = safeHttpUrl(state.steamdbUrl);
    if (url) window.open(url, "_blank");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) {
      $("searchResults").hidden = true;
    }
  });
}

function lockToolTitle() {
  const titleEl = document.getElementById("toolTitleText");
  if (!titleEl) return;
  titleEl.dataset.locked = "1";
  titleEl.textContent = "Game Changelog";
}

async function checkReleaseNotice() {
  const a = api();
  if (!a || typeof a.check_latest_release !== "function") return;
  let info;
  try {
    info = await a.check_latest_release();
  } catch (_) {
    return;
  }
  const bar = document.getElementById("hubReleaseBanner");
  if (!bar || !info?.ok || !info.updateAvailable) return;
  const remote = String(info.remote || "");
  try {
    if (sessionStorage.getItem("hubReleaseDismissed") === remote) return;
  } catch (_) {}
  bar.hidden = false;
  bar.setAttribute("role", "status");
  const msg = info.message || `Nouvelle version ${remote}`;
  bar.innerHTML =
    '<div class="hub-release-text"><strong>Nouvelle version</strong><span></span></div>' +
    '<div class="hub-release-actions">' +
    '<button type="button" class="hub-release-btn" id="hubReleaseOpen">Ouvrir la release</button>' +
    '<button type="button" class="hub-release-dismiss" id="hubReleaseDismiss" aria-label="Fermer">×</button>' +
    "</div>";
  const span = bar.querySelector(".hub-release-text span");
  if (span) span.textContent = msg;
  document.getElementById("hubReleaseDismiss")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("hubReleaseDismissed", remote);
    } catch (_) {}
    bar.hidden = true;
    bar.innerHTML = "";
  });
  document.getElementById("hubReleaseOpen")?.addEventListener("click", async () => {
    try {
      if (typeof a.open_release_page === "function") {
        await a.open_release_page(info.releaseUrl || "");
      }
    } catch (_) {}
  });
}

async function boot() {
  lockToolTitle();
  bindEvents();
  showLoading(false);
  await waitForApi();
  await loadSettings();
  await loadWatchlist();
  await loadFeed();
  await updateLastSync();

  // Never block the UI forever: import/refresh in background with timeouts.
  if (!state.watchlist.length) {
    maybeImportSteamLibraryOnFirstLaunch().then(async () => {
      await loadWatchlist();
      await loadFeed();
    });
  } else {
    const progress = await api().get_refresh_progress();
    if (!progress?.running) {
      startRefresh(true);
    } else if (!state.refreshTimer) {
      state.refreshTimer = setInterval(pollRefreshProgress, 500);
      pollRefreshProgress();
    }
  }
  void checkReleaseNotice();
}

boot();
