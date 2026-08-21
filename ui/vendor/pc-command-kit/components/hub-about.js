/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub À propos — légal + chemins locaux + vérif. GitHub (PC Command hubs).
 * Contract: docs/ABOUT-CONTRACT.md
 *
 * Usage:
 *   PcCommandAbout.wire({
 *     title: "À propos — Hub System",
 *     blurb: "…",
 *     repoUrl: "https://github.com/Mr-Aurevo-X/Hub-Systeme",
 *     openBtn: "#btnAbout",
 *     dialog: "#aboutDialog",
 *     api: window.pywebview?.api,
 *     onGithubUpdatesDisabled: () => {},
 *   });
 */
(function (global) {
  const DEFAULT_LEGAL = [
    { file: "terms.fr.md", label: "CGU" },
    { file: "privacy.fr.md", label: "Confidentialité" },
    { file: "mentions.fr.md", label: "Mentions" },
    { file: "notices.fr.md", label: "Notices" },
  ];

  const DEFAULT_FALLBACK_PATHS = [
    {
      id: "version",
      label: "Métadonnées / version",
      path: "%LOCALAPPDATA%\\PCCommand",
      hint: "version.json et métadonnées suite.",
    },
    {
      id: "settings",
      label: "Préférences (accent, langue, vérif. maj)",
      path: "%LOCALAPPDATA%\\Mr-Aurevo-X\\user-settings.json",
      hint: "Fichier partagé Mr-Aurevo-X — à garder si d’autres apps l’utilisent.",
    },
  ];

  function $(sel, root) {
    if (!sel) return null;
    if (typeof sel !== "string") return sel;
    return (root || document).querySelector(sel);
  }

  function ensureCss() {
    if (document.getElementById("pcd-hub-about-css")) return;
    const link = document.createElement("link");
    link.id = "pcd-hub-about-css";
    link.rel = "stylesheet";
    let href = "vendor/pc-command-kit/components/hub-about.css";
    try {
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || "";
        if (src.indexOf("hub-about.js") !== -1) {
          href = src.replace(/hub-about\.js(?:\?.*)?$/i, "hub-about.css");
          break;
        }
      }
    } catch (_) {}
    link.href = href;
    document.head.appendChild(link);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildDialogHtml(opts) {
    const title = opts.title || "À propos";
    const blurb = opts.blurb || "";
    const repoUrl = opts.repoUrl || "";
    const legalDocs = opts.legalDocs || DEFAULT_LEGAL;
    const legalBtns = legalDocs
      .map(
        (d) =>
          `<button type="button" class="btn ghost" data-legal="${esc(d.file)}">${esc(
            d.label || d.file
          )}</button>`
      )
      .join("");
    return `
<dialog class="about-dialog" id="aboutDialog">
  <form method="dialog" class="about-card">
    <h3>${esc(title)}</h3>
    <p>${esc(blurb)}</p>
    <ul class="legal-strip" id="aboutLegalList">
      <li><strong>100 % local-first</strong> — pas de télémétrie</li>
      <li>Seule connexion hors machine : <strong>vérif. version GitHub</strong> (option ci-dessous)</li>
      <li>Si vérif. désactivée : <strong>zéro</strong> réseau hors actions utilisateur (modules)</li>
    </ul>
    <label class="about-toggle">
      <input type="checkbox" id="chkGithubUpdates" checked />
      <span>Vérifier les nouvelles versions sur GitHub</span>
    </label>
    <p class="about-note" id="aboutUpdateHint">Quand activé : un appel API GitHub au démarrage (lecture seule, pas de téléchargement).</p>
    <div class="about-repo" aria-label="Dépôt GitHub">
      <label class="about-repo-label" for="aboutRepoUrl">Repo GitHub (releases)</label>
      <div class="about-repo-row">
        <input type="text" id="aboutRepoUrl" class="about-repo-input" readonly
          value="${esc(repoUrl)}" spellcheck="false" />
        <button type="button" class="btn accent" id="btnCopyRepo" title="Copier l’URL">Copier</button>
      </div>
      <p class="about-note" id="aboutCopyHint" hidden>Lien copié.</p>
    </div>
    <div class="about-paths" id="aboutPaths" aria-label="Chemins locaux">
      <p class="about-repo-label">Chemins locaux (désinstall / ménage)</p>
      <p class="about-note">Identifie clairement quoi supprimer. Les préférences Mr-Aurevo-X sont partagées entre apps.</p>
      <div class="about-paths-list" id="aboutPathsList"></div>
      <p class="about-note" id="aboutPathCopyHint" hidden>Chemin copié.</p>
    </div>
    <div class="about-legal-links" role="group" aria-label="Documents légaux">
      ${legalBtns}
    </div>
    <pre class="about-legal-body" id="aboutLegalBody" hidden></pre>
    <p class="copyright">Copyright © 2026 Mr-Aurevo-X — tous droits réservés</p>
    <p class="about-note">Redistribution, reverse engineering ou suppression du copyright interdits sans accord écrit.</p>
    <button type="submit" class="btn accent">Fermer</button>
  </form>
</dialog>`;
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
        hintEl.textContent = okMsg || "Copié.";
        setTimeout(() => {
          hintEl.hidden = true;
        }, 1800);
      }
    } catch (_) {
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = "Sélectionne et Ctrl+C.";
      }
    }
  }

  function resolveApi(opts) {
    if (opts.api) return opts.api;
    try {
      return global.pywebview && global.pywebview.api;
    } catch (_) {
      return null;
    }
  }

  /**
   * Wire an existing (or inject) About dialog.
   * @returns {{ open: Function, refresh: Function }|null}
   */
  function wire(opts) {
    opts = opts || {};
    ensureCss();

    let dlg = $(opts.dialog || "#aboutDialog");
    if (!dlg && opts.inject !== false) {
      const wrap = document.createElement("div");
      wrap.innerHTML = buildDialogHtml(opts).trim();
      dlg = wrap.firstElementChild;
      document.body.appendChild(dlg);
    }
    const btn = $(opts.openBtn || "#btnAbout");
    if (!btn || !dlg) return null;

    if (opts.title) {
      const h3 = dlg.querySelector(".about-card h3");
      if (h3) h3.textContent = opts.title;
    }
    if (opts.blurb) {
      const p = dlg.querySelector(".about-card > p");
      if (p) p.textContent = opts.blurb;
    }
    const repoInput = dlg.querySelector("#aboutRepoUrl");
    if (repoInput && opts.repoUrl) repoInput.value = opts.repoUrl;

    const chk = dlg.querySelector("#chkGithubUpdates");
    const hint = dlg.querySelector("#aboutUpdateHint");
    const body = dlg.querySelector("#aboutLegalBody");
    const legalBase = (opts.legalBase || "legal/").replace(/\/?$/, "/");
    const fallbackPaths = opts.fallbackPaths || DEFAULT_FALLBACK_PATHS;

    async function refreshPref() {
      const a = resolveApi(opts);
      try {
        if (a?.get_update_check_pref) {
          const r = await a.get_update_check_pref();
          if (chk) chk.checked = r?.checkGithubUpdates !== false;
        }
      } catch (_) {}
      if (hint && chk) {
        hint.textContent = chk.checked
          ? "Quand activé : un appel API GitHub au démarrage (lecture seule, pas de téléchargement)."
          : "Désactivé : aucune requête GitHub. Local-first strict hors actions modules.";
      }
    }

    async function refreshLocalPaths() {
      const list = dlg.querySelector("#aboutPathsList");
      const pathHint = dlg.querySelector("#aboutPathCopyHint");
      if (!list) return;
      list.replaceChildren();
      const a = resolveApi(opts);
      let paths = [];
      try {
        if (a?.get_about_local_paths) {
          const r = await a.get_about_local_paths();
          if (Array.isArray(r?.paths)) paths = r.paths;
        }
      } catch (_) {}
      if (!paths.length) paths = fallbackPaths.slice();

      for (const entry of paths) {
        const item = document.createElement("div");
        item.className = "about-path-item";
        const label = document.createElement("div");
        label.className = "about-path-label";
        label.textContent =
          (entry.label || entry.id || "Chemin") + (entry.optional ? " (optionnel)" : "");
        const row = document.createElement("div");
        row.className = "about-repo-row";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "about-repo-input";
        input.readOnly = true;
        input.spellcheck = false;
        input.value = entry.path || "";
        input.title = entry.hint || "";
        input.addEventListener("focus", () => input.select());
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn accent";
        copyBtn.title = "Copier le chemin";
        copyBtn.textContent = "Copier";
        copyBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          await copyText(input.value, pathHint, "Chemin copié.");
        });
        row.append(input, copyBtn);
        item.appendChild(label);
        if (entry.hint) {
          const note = document.createElement("p");
          note.className = "about-note";
          note.textContent = entry.hint;
          item.appendChild(note);
        }
        item.appendChild(row);
        list.appendChild(item);
      }
    }

    async function open() {
      await refreshPref();
      await refreshLocalPaths();
      if (typeof dlg.showModal === "function") dlg.showModal();
    }

    btn.addEventListener("click", () => {
      void open();
    });

    chk?.addEventListener("change", async () => {
      const a = resolveApi(opts);
      const enabled = !!chk.checked;
      try {
        if (a?.set_update_check_pref) await a.set_update_check_pref(enabled);
      } catch (_) {}
      if (hint) {
        hint.textContent = enabled
          ? "Quand activé : un appel API GitHub au démarrage (lecture seule, pas de téléchargement)."
          : "Désactivé : aucune requête GitHub. Local-first strict hors actions modules.";
      }
      if (!enabled && typeof opts.onGithubUpdatesDisabled === "function") {
        try {
          opts.onGithubUpdatesDisabled();
        } catch (_) {}
      }
    });

    const btnCopy = dlg.querySelector("#btnCopyRepo");
    const copyHint = dlg.querySelector("#aboutCopyHint");
    btnCopy?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const url = (repoInput?.value || opts.repoUrl || "").trim();
      await copyText(url, copyHint, "Lien copié.");
    });
    repoInput?.addEventListener("focus", () => repoInput.select());

    dlg.querySelectorAll("[data-legal]").forEach((el) => {
      el.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const file = el.getAttribute("data-legal");
        if (!file || !body) return;
        try {
          const res = await fetch(legalBase + file, { cache: "no-store" });
          body.textContent = res.ok ? await res.text() : `Impossible de charger ${file}`;
          body.hidden = false;
        } catch (err) {
          body.textContent = String(err);
          body.hidden = false;
        }
      });
    });

    return {
      open,
      refresh: async () => {
        await refreshPref();
        await refreshLocalPaths();
      },
      dialog: dlg,
    };
  }

  const api = {
    wire,
    ensureCss,
    buildDialogHtml,
    DEFAULT_LEGAL,
    DEFAULT_FALLBACK_PATHS,
  };

  global.PcCommandAbout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
