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
  ddSteamUrl: "https://downdetector.fr/statut/steam/",
  steamstatUrl: "https://steamstat.us/",
};

const $ = (id) => document.getElementById(id);
const I18N = (window.GameChangelogI18n && window.GameChangelogI18n.I18N) || { fr: {}, en: {} };
const LEGAL_FILES = {
  terms: { fr: "legal/terms.fr.md", en: "legal/terms.en.md" },
  privacy: { fr: "legal/privacy.fr.md", en: "legal/privacy.en.md" },
  mentions: { fr: "legal/mentions.fr.md", en: "legal/mentions.en.md" },
  notices: { fr: "legal/notices.fr.md", en: "legal/notices.en.md" },
};
const REPO_URL = "https://github.com/Mr-Aurevo-X/GameChangelog";

let lang = "fr";
let appVersion = "";
let lastReleaseInfo = null;
const legalCache = {};

function api() {
  return window.pywebview?.api;
}

function pack() {
  return I18N[lang] || I18N.fr || {};
}

function t(key, vars) {
  let s = pack()[key] || (I18N.fr && I18N.fr[key]) || key;
  if (vars != null && typeof vars === "object" && !Array.isArray(vars)) {
    Object.keys(vars).forEach((k) => {
      s = String(s).split(`{${k}}`).join(String(vars[k] == null ? "" : vars[k]));
    });
  }
  return s;
}

function localeTag() {
  return lang === "en" ? "en-US" : "fr-FR";
}

function syncLangSwitch() {
  const root = $("langSwitch");
  if (!root) return;
  root.querySelectorAll("[data-lang]").forEach((btn) => {
    const on = btn.getAttribute("data-lang") === lang;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  root.setAttribute("aria-label", t("langSwitchAria"));
}

function applyI18n() {
  document.documentElement.lang = lang === "en" ? "en" : "fr";
  const overlay = $("loadingOverlay");
  const overlayBusy = overlay && !overlay.hidden;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (overlayBusy && el.id === "loadingText") return;
    const key = el.getAttribute("data-i18n");
    if (key && pack()[key]) el.textContent = pack()[key];
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key && pack()[key]) el.setAttribute("aria-label", pack()[key]);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key && pack()[key]) el.setAttribute("title", pack()[key]);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && pack()[key]) el.setAttribute("placeholder", pack()[key]);
  });
  syncLangSwitch();
  const hint = $("aboutUpdateHint");
  const chk = $("chkGithubUpdates");
  if (hint && chk) {
    hint.textContent = chk.checked ? t("aboutUpdateHintOn") : t("aboutUpdateHintOff");
  }
  if ($("watchlist")) renderWatchlist();
  if ($("feedList")) renderFeed();
  updateBugHint();
  if ($("bugsList")) renderBugs();
  if (state.statusData) renderStatusDashboard(state.statusData);
  void updateLastSync();
  if (lastReleaseInfo && lastReleaseInfo.updateAvailable) {
    paintReleaseBanner(lastReleaseInfo);
  }
  const dlg = $("aboutDialog");
  if (dlg && (dlg.open || dlg.hasAttribute("open"))) {
    void refreshAboutLocalPaths();
  }
}

async function persistLanguage(next) {
  try {
    const a = api();
    if (a && typeof a.set_suite_language === "function") {
      await a.set_suite_language(next);
    }
  } catch (_) {}
}

async function setLang(next) {
  if (next !== "fr" && next !== "en") return;
  if (next === lang) {
    syncLangSwitch();
    return;
  }
  lang = next;
  await persistLanguage(lang);
  Object.keys(legalCache).forEach((k) => { delete legalCache[k]; });
  applyI18n();
  const dlg = $("aboutDialog");
  if (dlg && (dlg.open || dlg.hasAttribute("open"))) {
    const active = document.querySelector(".about-legal-links [data-doc].active");
    loadLegal(active?.getAttribute("data-doc") || "terms").catch(() => {});
  }
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
  if (!epoch) return t("dateUnknown");
  const date = new Date(Number(epoch) * 1000);
  return date.toLocaleString(localeTag(), {
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
  if (days <= 0) return t("relToday");
  if (days === 1) return t("relYesterday");
  return t("relDaysAgo", { days });
}

function setAccent(accent) {
  if (accent) {
    document.documentElement.style.setProperty("--accent", accent);
  }
}

function showLoading(show, text = t("loadingGeneric"), percent = 0) {
  const overlay = $("loadingOverlay");
  overlay.hidden = !show;
  $("loadingText").textContent = text;
  $("loadingBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function loadSettings() {
  const res = await api().get_suite_settings();
  if (res?.ok) {
    setAccent(res.accent);
    if (res.language === "en" || res.language === "fr") lang = res.language;
    if (res.version) appVersion = String(res.version);
  }
  applyI18n();
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
  if (!root) return;
  const visible = state.favoritesOnly
    ? state.watchlist.filter((g) => Number(g.favorite || 0) === 1)
    : state.watchlist;
  $("gameCount").textContent = String(visible.length);
  if (!visible.length) {
    root.innerHTML = `<p class="empty-hint">${state.favoritesOnly ? t("emptyFavorites") : t("emptyWatchlist")}</p>`;
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
        installed ? (unread > 0 ? t("unreadNew", { n: unread }) : t("installed")) : t("notInstalled"),
        bugs > 0 ? t("bugsCount", { n: bugs }) : null,
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
          <button class="fav-btn ${fav ? "on" : ""}" data-fav="${game.appid}" title="${escapeHtml(t("favTitle"))}">${fav ? "★" : "☆"}</button>
          <button class="game-remove" data-remove="${game.appid}" title="${escapeHtml(t("removeTitle"))}">✕</button>
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
        showLoading(true, t("loadingPatchUpdate"), 20);
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
  if (!root) return;
  const countEl = $("feedCount");
  if (countEl) countEl.textContent = t("feedCount", { n: state.feed.length });
  if (!state.feed.length) {
    const emptyKey = state.watchlist.length ? "emptyFeedNone" : "emptyFeedList";
    root.innerHTML = `<p class="empty-hint">${t(emptyKey)}</p>`;
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
  $("detailContent").innerHTML = entry.content_html || `<p>${escapeHtml(t("detailNoContent"))}</p>`;
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

const DD_STEAM_URL = "https://downdetector.fr/statut/steam/";
const STEAMSTAT_URL = "https://steamstat.us/";

function allowedStatusUrl(value, fallback) {
  const href = safeHttpUrl(value);
  if (!href) return fallback;
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if ((host === "downdetector.fr" || host === "www.downdetector.fr") && u.pathname.startsWith("/statut/")) {
      return href;
    }
    if (host === "steamstat.us" || host === "www.steamstat.us") {
      return href;
    }
  } catch (_) {}
  return fallback;
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
          <div class="muted">${escapeHtml(t("searchAppId", { id: game.appid }))}</div>
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
    showLoading(true, t("loadingPatchNotes"), 20);
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
    alert(String(err?.message || err || t("errAddGame")));
  }
}

async function addGameByAppId(raw) {
  const trimmed = String(raw || "").trim();
  if (!/^\d{1,8}$/.test(trimmed)) {
    alert(t("errBadAppId"));
    return;
  }
  const appid = Number(trimmed);
  const res = await api().add_game_by_appid(appid);
  if (!res?.ok) {
    alert(res?.error || t("errAddAppId"));
    return;
  }
  $("addAppIdInput").value = "";
  await loadWatchlist();
  showLoading(true, t("loadingPatchNotes"), 20);
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
      ? t("loadingProgressNamed", { current, total, name: res.game_name })
      : t("loadingProgress", { current, total });
    showLoading(true, label, percent);
    return;
  }

  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  showLoading(false);
  if (res.error) {
    alert(t("errRefreshNamed", { err: res.error }));
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
      el.textContent = t("lastSyncValue", { when: res.last_fetched });
    } else {
      el.textContent = t("lastSyncDash");
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
    alert(res?.error || t("errRefresh"));
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
    installedOnly ? t("loadingRefreshInstalled") : t("loadingRefreshAll"),
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
    const label = res.phase === "import" ? t("loadingImport") : t("loadingDetect");
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
          error: t("errImportTimeout"),
        });
        return;
      }
      try {
        const res = await api().get_import_progress();
        if (!res) return;
        if (res.running) {
          sawRunning = true;
          const label = res.phase === "import" ? t("loadingImport") : t("loadingDetect");
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
  showLoading(true, force ? t("loadingSyncLib") : t("loadingDetect"), 8);
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
    if (force) alert(start?.error || t("errImportLib"));
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
    const msg = res?.error || t("errImportLib");
    if (force) alert(msg);
    else console.warn("[GameChangelog] import:", msg);
    return { ok: false, imported: 0, error: msg };
  }

  if (Number(res.imported || 0) > 0) {
    showLoading(true, t("loadingImported", { n: res.imported }), 20);
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
      alert(t("errImportSteam", { err: res.error }));
    }
    return res;
  } catch (err) {
    showLoading(false);
    const msg = String(err);
    alert(t("errImportSteam", { err: msg }));
    return { ok: false, imported: 0, error: msg };
  }
}

function updateBugHint() {
  const hint = $("bugGameHint");
  if (!hint) return;
  if (!state.selectedAppid) {
    hint.textContent = t("bugHintSelect");
    return;
  }
  const game = state.watchlist.find((g) => Number(g.appid) === Number(state.selectedAppid));
  hint.textContent = game
    ? t("bugHintGame", { name: game.name })
    : t("bugHintAppId", { id: state.selectedAppid });
}

async function loadBugs() {
  const res = await api().get_bugs(state.selectedAppid);
  if (!res?.ok) return;
  state.bugs = res.bugs || [];
  renderBugs();
}

function renderBugs() {
  const root = $("bugsList");
  if (!root) return;
  const count = $("bugCount");
  if (count) count.textContent = `${state.bugs.length}`;
  if (!state.bugs.length) {
    root.innerHTML = `<p class="empty-hint">${t("emptyBugsFilter")}</p>`;
    return;
  }
  root.innerHTML = state.bugs
    .map((bug) => `
      <div class="bug-item" data-bug="${bug.id}">
        <h3>${escapeHtml(bug.title)}</h3>
        <p class="muted">${escapeHtml(bug.game_name)} · ${escapeHtml(bug.status)} · ${escapeHtml(bug.updated_at || "")}</p>
        <p>${escapeHtml(bug.body || "")}</p>
        <div class="bug-actions">
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="open">${escapeHtml(t("bugOpen"))}</button>
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="watching">${escapeHtml(t("bugWatching"))}</button>
          <button type="button" class="btn ghost" data-bug-status="${bug.id}" data-status="done">${escapeHtml(t("bugDone"))}</button>
          <button type="button" class="btn ghost" data-bug-del="${bug.id}">${escapeHtml(t("bugDelete"))}</button>
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
    state.statusData = null;
    $("statusOverall").textContent = res?.error || t("errStatusLoad");
    return;
  }
  state.statusData = res;
  renderStatusDashboard(res);
}

function renderStatusDashboard(res) {
  const steam = res.steam || {};
  const overall = steam.overall || "—";
  const label = overall === "ok"
    ? t("statusAllOk")
    : overall === "degraded"
      ? t("statusDegraded")
      : t("statusIncident");
  $("statusOverall").textContent = `${label} · ${steam.checked_at || ""}`;
  const callout = $("ddCallout");
  if (callout) {
    callout.classList.toggle("is-alert", overall === "down" || overall === "degraded");
  }
  state.ddSteamUrl = allowedStatusUrl(steam.downdetector_steam_url, DD_STEAM_URL);
  state.steamstatUrl = allowedStatusUrl(steam.steamstatus_url, STEAMSTAT_URL);
  $("steamServices").innerHTML = (steam.services || [])
    .map((s) => `
      <div class="status-card">
        <div><span class="dot ${escapeHtml(s.status)}"></span><strong>${escapeHtml(s.name)}</strong></div>
        <p class="muted">${escapeHtml(s.status)} · ${s.ms || 0} ms</p>
      </div>
    `)
    .join("");
  const list = $("gameStatusList");
  if (!list) return;
  const games = res.games || [];
  if (!games.length) {
    list.innerHTML = `<p class="empty-hint">${t("emptyStatusNone")}</p>`;
    return;
  }
  list.innerHTML = games
    .map((g) => `
      <div class="game-status-item">
        <strong>${g.favorite ? "★ " : ""}${escapeHtml(g.name)}</strong>
        <p class="muted">${g.installed ? t("installed") : t("notInstalled")}</p>
        <div class="game-status-actions">
          <button type="button" class="btn ${g.downdetector_exact ? "accent" : "ghost"}" data-open-url="${escapeHtml(allowedStatusUrl(g.downdetector_url, DD_STEAM_URL))}" title="${escapeHtml(g.downdetector_exact ? t("ddGamePage") : t("ddSteamFallback"))}">${escapeHtml(g.downdetector_exact ? t("ddGame") : t("ddSteam"))}</button>
          <button type="button" class="btn ghost" data-open-url="${escapeHtml(g.steam_discussions_url)}">${escapeHtml(t("btnDiscussions"))}</button>
          <button type="button" class="btn ghost" data-open-url="${escapeHtml(g.steam_news_url)}">${escapeHtml(t("btnSteamNews"))}</button>
        </div>
      </div>
    `)
    .join("");
  list.querySelectorAll("[data-open-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = allowedStatusUrl(btn.dataset.openUrl, "") || safeHttpUrl(btn.dataset.openUrl);
      if (url) window.open(url, "_blank");
    });
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

async function loadLegal(doc) {
  const key = doc && LEGAL_FILES[doc] ? doc : "terms";
  const file = LEGAL_FILES[key][lang] || LEGAL_FILES[key].fr;
  const body = $("aboutLegalBody");
  if (!body) return;
  document.querySelectorAll(".about-legal-links [data-doc]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-doc") === key);
  });
  try {
    if (!legalCache[file]) {
      const res = await fetch(file, { cache: "no-store" });
      legalCache[file] = res.ok ? await res.text() : t("legalLoadFail", { file });
    }
    body.textContent = legalCache[file];
    body.hidden = false;
  } catch (err) {
    body.textContent = String(err);
    body.hidden = false;
  }
}

async function copyText(value, hintEl, okMsg) {
  const text = (value || "").trim();
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = okMsg || t("aboutCopyLink");
      setTimeout(() => { hintEl.hidden = true; }, 1800);
    }
  } catch (_) {
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = t("aboutCopyFail");
    }
  }
}

async function refreshAboutLocalPaths() {
  const list = $("aboutPathsList");
  const pathHint = $("aboutPathCopyHint");
  if (!list) return;
  list.replaceChildren();
  let paths = [];
  try {
    const a = api();
    if (a?.get_about_local_paths) {
      const r = await a.get_about_local_paths();
      if (Array.isArray(r?.paths)) paths = r.paths;
    }
  } catch (_) {}
  if (!paths.length) {
    paths = [
      {
        id: "data",
        label: t("aboutPathData"),
        path: "%LOCALAPPDATA%\\ChangeLog-Central",
        hint: t("aboutPathDataHint"),
      },
      {
        id: "settings",
        label: t("aboutPathSettings"),
        path: "%LOCALAPPDATA%\\Mr-Aurevo-X\\user-settings.json",
        hint: t("aboutPathSettingsHint"),
      },
    ];
  }
  for (const entry of paths) {
    const id = String(entry.id || "");
    const labelKey = id === "app" ? "aboutPathApp"
      : id === "data" ? "aboutPathData"
      : id === "settings" ? "aboutPathSettings"
      : "";
    const hintKey = id === "app" ? "aboutPathAppHint"
      : id === "data" ? "aboutPathDataHint"
      : id === "settings" ? "aboutPathSettingsHint"
      : "";
    const item = document.createElement("div");
    item.className = "about-path-item";
    const label = document.createElement("div");
    label.className = "about-path-label";
    const baseLabel = (labelKey && pack()[labelKey]) || entry.label || entry.id || "Path";
    label.textContent = baseLabel + (entry.optional ? t("aboutPathOptional") : "");
    const row = document.createElement("div");
    row.className = "about-repo-row";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "about-repo-input";
    input.readOnly = true;
    input.spellcheck = false;
    input.value = entry.path || "";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn accent";
    copyBtn.textContent = t("btnCopy");
    copyBtn.addEventListener("click", () => {
      copyText(input.value, pathHint, t("aboutCopyPath"));
    });
    row.appendChild(input);
    row.appendChild(copyBtn);
    item.appendChild(label);
    item.appendChild(row);
    const hintText = (hintKey && pack()[hintKey]) || entry.hint;
    if (hintText) {
      const note = document.createElement("p");
      note.className = "about-note";
      note.textContent = hintText;
      item.appendChild(note);
    }
    list.appendChild(item);
  }
}

function wireAboutDialog() {
  const btn = $("btnAbout");
  const dlg = $("aboutDialog");
  const chk = $("chkGithubUpdates");
  const hint = $("aboutUpdateHint");
  if (!btn || !dlg) return;

  async function refreshPref() {
    try {
      const a = api();
      if (a?.get_update_check_pref) {
        const r = await a.get_update_check_pref();
        if (chk) chk.checked = r?.checkGithubUpdates !== false;
        const repo = $("aboutRepoUrl");
        if (repo && r?.repoUrl) repo.value = r.repoUrl;
      }
    } catch (_) {}
    if (hint && chk) {
      hint.textContent = chk.checked ? t("aboutUpdateHintOn") : t("aboutUpdateHintOff");
    }
  }

  btn.addEventListener("click", async () => {
    const aboutVer = $("aboutVersion");
    if (aboutVer) aboutVer.textContent = appVersion ? `v${String(appVersion).replace(/^v/i, "")}` : "";
    await refreshPref();
    await refreshAboutLocalPaths();
    loadLegal("terms").catch(() => {});
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  });

  if (chk) {
    chk.addEventListener("change", async () => {
      try {
        const a = api();
        if (a?.set_update_check_pref) await a.set_update_check_pref(!!chk.checked);
      } catch (_) {}
      await refreshPref();
      if (chk.checked) checkReleaseNotice().catch(() => {});
      else {
        lastReleaseInfo = null;
        const bar = document.getElementById("hubReleaseBanner");
        if (bar) {
          bar.hidden = true;
          bar.innerHTML = "";
        }
      }
    });
  }

  $("btnCopyRepo")?.addEventListener("click", () => {
    const repo = $("aboutRepoUrl");
    copyText(repo?.value || REPO_URL, $("aboutCopyHint"), t("aboutCopyLink"));
  });

  document.querySelector(".about-legal-links")?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-doc]");
    if (!tab) return;
    document.querySelectorAll(".about-legal-links [data-doc]").forEach((node) => {
      node.classList.toggle("active", node === tab);
    });
    loadLegal(tab.dataset.doc).catch(() => {});
  });
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
      alert(res?.error || t("errMarkRead"));
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
      alert(t("errSelectGameFirst"));
      return;
    }
    const title = $("bugTitle").value.trim();
    const body = $("bugBody").value.trim();
    const res = await api().add_bug(state.selectedAppid, title, body);
    if (!res?.ok) {
      alert(res?.error || t("errAddBug"));
      return;
    }
    $("bugTitle").value = "";
    $("bugBody").value = "";
    await loadBugs();
    await loadWatchlist();
  });

  $("openBugForumBtn").addEventListener("click", async () => {
    if (!state.selectedAppid) {
      alert(t("errSelectGame"));
      return;
    }
    const res = await api().get_bug_links(state.selectedAppid);
    if (res?.ok && res.discussions_url) window.open(res.discussions_url, "_blank");
  });

  $("refreshStatusBtn").addEventListener("click", () => loadStatusDashboard());
  $("openSteamStatusBtn").addEventListener("click", () => {
    window.open(allowedStatusUrl(state.steamstatUrl, STEAMSTAT_URL), "_blank");
  });
  $("openDdSteamBtn").addEventListener("click", () => {
    window.open(allowedStatusUrl(state.ddSteamUrl, DD_STEAM_URL), "_blank");
  });

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

  const langSwitch = $("langSwitch");
  if (langSwitch) {
    langSwitch.addEventListener("click", (ev) => {
      const seg = ev.target.closest("[data-lang]");
      if (!seg || !langSwitch.contains(seg)) return;
      setLang(seg.getAttribute("data-lang") === "en" ? "en" : "fr").catch(() => {});
    });
  }

  document.querySelector(".hub-support")?.addEventListener("click", async (ev) => {
    const supportBtn = ev.target.closest("[data-support]");
    if (!supportBtn) return;
    const kind = supportBtn.dataset.support;
    try {
      const a = api();
      if (a && typeof a.open_support_url === "function") {
        await a.open_support_url(kind);
      }
    } catch (_) {}
  });

  wireAboutDialog();
}

function lockToolTitle() {
  const titleEl = document.getElementById("toolTitleText");
  if (!titleEl) return;
  titleEl.dataset.locked = "1";
  titleEl.textContent = "Game Changelog";
}

function paintReleaseBanner(info) {
  /* Prefer i18n — host message is FR-only and must not be shown as primary. */
  const bar = document.getElementById("hubReleaseBanner");
  if (!bar || !info?.ok || !info.updateAvailable) return;
  const remote = String(info.remote || "");
  const local = String(info.local || appVersion || "");
  const a = api();
  bar.hidden = false;
  bar.setAttribute("role", "status");
  bar.innerHTML =
    `<div class="hub-release-text"><strong>${t("releaseNew")}</strong><span></span></div>` +
    '<div class="hub-release-actions">' +
    `<button type="button" class="hub-release-btn" id="hubReleaseOpen">${t("releaseOpen")}</button>` +
    `<button type="button" class="hub-release-dismiss" id="hubReleaseDismiss" aria-label="${t("releaseClose")}">×</button>` +
    "</div>";
  const span = bar.querySelector(".hub-release-text span");
  if (span) {
    span.textContent = local
      ? t("releaseMsgLocal", { ver: remote, local })
      : t("releaseMsg", { ver: remote });
  }
  document.getElementById("hubReleaseDismiss")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("hubReleaseDismissed", remote);
    } catch (_) {}
    bar.hidden = true;
    bar.innerHTML = "";
    lastReleaseInfo = null;
  });
  document.getElementById("hubReleaseOpen")?.addEventListener("click", async () => {
    try {
      if (a && typeof a.open_release_page === "function") {
        await a.open_release_page(info.releaseUrl || "");
      }
    } catch (_) {}
  });
}

async function checkReleaseNotice() {
  const a = api();
  if (!a || typeof a.check_latest_release !== "function") return;
  try {
    if (a.get_update_check_pref) {
      const pref = await a.get_update_check_pref();
      if (pref && pref.checkGithubUpdates === false) return;
    }
  } catch (_) {}
  let info;
  try {
    info = await a.check_latest_release();
  } catch (_) {
    return;
  }
  if (info && info.skipped) return;
  if (!info?.ok || !info.updateAvailable) return;
  const remote = String(info.remote || "");
  try {
    if (sessionStorage.getItem("hubReleaseDismissed") === remote) return;
  } catch (_) {}
  lastReleaseInfo = info;
  paintReleaseBanner(info);
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
