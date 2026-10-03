/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 *
 * Crypto tips modal: list allowlisted addresses + copy via bridge (or clipboard fallback).
 */
(function (global) {
  "use strict";

  const NOTE_LABELS = {
    fr: {
      same_as_eth: "même adresse qu’ETH",
      same_as_sol: "même adresse que SOL",
    },
    en: {
      same_as_eth: "same address as ETH",
      same_as_sol: "same address as SOL",
    },
  };

  const I18N = {
    fr: {
      title: "Dons crypto",
      blurb:
        "Tips facultatifs pour l’atelier. Copie l’adresse depuis ce tableau — jamais depuis une capture d’écran.",
      asset: "Actif",
      network: "Réseau",
      address: "Adresse",
      copy: "Copier",
      close: "Fermer",
      copied: "Adresse copiée.",
      fail: "Copie impossible.",
      empty: "Aucune adresse disponible.",
      btn: "Dons crypto",
    },
    en: {
      title: "Crypto tips",
      blurb:
        "Optional tips for the workshop. Copy the address from this table — never from a screenshot.",
      asset: "Asset",
      network: "Network",
      address: "Address",
      copy: "Copy",
      close: "Close",
      copied: "Address copied.",
      fail: "Could not copy.",
      empty: "No addresses available.",
      btn: "Crypto tips",
    },
  };

  function lang() {
    const html = (document.documentElement.lang || "fr").toLowerCase();
    return html.startsWith("en") ? "en" : "fr";
  }

  function t(key) {
    return (I18N[lang()] || I18N.fr)[key] || key;
  }

  function noteLabel(note) {
    if (!note) return "";
    return (NOTE_LABELS[lang()] || NOTE_LABELS.fr)[note] || note;
  }

  async function ensureApi() {
    if (global.pywebview && global.pywebview.api) return global.pywebview.api;
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        if (global.pywebview && global.pywebview.api) {
          resolve(global.pywebview.api);
          return;
        }
        if (++tries > 40) {
          resolve(null);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function fetchAssets() {
    try {
      const api = await ensureApi();
      if (api && typeof api.list_crypto_donations === "function") {
        const res = await api.list_crypto_donations();
        if (res && res.ok && Array.isArray(res.assets)) return res.assets;
      }
    } catch (_) {}
    if (global.MrAurevoXCrypto && Array.isArray(global.MrAurevoXCrypto.FALLBACK_ASSETS)) {
      return global.MrAurevoXCrypto.FALLBACK_ASSETS;
    }
    return [];
  }

  async function copyAsset(id, address) {
    try {
      const api = await ensureApi();
      if (api && typeof api.copy_crypto_address === "function") {
        const res = await api.copy_crypto_address(id);
        if (res && res.ok) return true;
      }
    } catch (_) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(address);
        return true;
      }
    } catch (_) {}
    try {
      const tmp = document.createElement("textarea");
      tmp.value = address;
      tmp.setAttribute("readonly", "");
      tmp.style.position = "fixed";
      tmp.style.left = "-9999px";
      document.body.appendChild(tmp);
      tmp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(tmp);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function ensureDialog() {
    let dlg = document.getElementById("cryptoDialog");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "cryptoDialog";
    dlg.className = "crypto-dialog";
    dlg.innerHTML =
      '<div class="crypto-card">' +
      '<h3 id="cryptoTitle"></h3>' +
      '<p class="crypto-note" id="cryptoBlurb"></p>' +
      '<div class="crypto-table-wrap"><table class="crypto-table">' +
      "<thead><tr>" +
      '<th id="cryptoThAsset"></th><th id="cryptoThNet"></th>' +
      '<th id="cryptoThAddr"></th><th></th>' +
      "</tr></thead><tbody id=\"cryptoTbody\"></tbody></table></div>" +
      '<p class="crypto-toast" id="cryptoToast" aria-live="polite"></p>' +
      '<div class="crypto-actions">' +
      '<button type="button" class="btn" id="cryptoClose"></button>' +
      "</div></div>";
    document.body.appendChild(dlg);
    dlg.querySelector("#cryptoClose")?.addEventListener("click", () => {
      if (typeof dlg.close === "function") dlg.close();
    });
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg && typeof dlg.close === "function") dlg.close();
    });
    return dlg;
  }

  function applyLabels(dlg) {
    const set = (id, val) => {
      const el = dlg.querySelector("#" + id);
      if (el) el.textContent = val;
    };
    set("cryptoTitle", t("title"));
    set("cryptoBlurb", t("blurb"));
    set("cryptoThAsset", t("asset"));
    set("cryptoThNet", t("network"));
    set("cryptoThAddr", t("address"));
    set("cryptoClose", t("close"));
  }

  function renderRows(tbody, assets, toast) {
    tbody.innerHTML = "";
    if (!assets.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = t("empty");
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    assets.forEach((row) => {
      const tr = document.createElement("tr");
      const tdMeta = document.createElement("td");
      tdMeta.innerHTML =
        '<div class="crypto-meta"><strong></strong><span></span></div>';
      tdMeta.querySelector("strong").textContent =
        (row.symbol || row.id || "").toString();
      tdMeta.querySelector("span").textContent = (row.name || "").toString();
      const note = noteLabel(row.note);
      if (note) {
        const n = document.createElement("span");
        n.className = "crypto-note-inline";
        n.textContent = note;
        tdMeta.querySelector(".crypto-meta").appendChild(n);
      }
      const tdNet = document.createElement("td");
      tdNet.textContent = (row.network || "").toString();
      const tdAddr = document.createElement("td");
      tdAddr.className = "crypto-addr";
      tdAddr.textContent = (row.address || "").toString();
      const tdAct = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crypto-copy-btn";
      btn.textContent = t("copy");
      btn.addEventListener("click", async () => {
        const ok = await copyAsset(row.id, row.address);
        if (toast) toast.textContent = ok ? t("copied") : t("fail");
      });
      tdAct.appendChild(btn);
      tr.appendChild(tdMeta);
      tr.appendChild(tdNet);
      tr.appendChild(tdAddr);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  async function open() {
    const dlg = ensureDialog();
    applyLabels(dlg);
    const tbody = dlg.querySelector("#cryptoTbody");
    const toast = dlg.querySelector("#cryptoToast");
    if (toast) toast.textContent = "";
    const assets = await fetchAssets();
    if (tbody) renderRows(tbody, assets, toast);
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    dlg.querySelector("#cryptoClose")?.focus();
  }

  function wireSupportStrip(root) {
    const host = root || document;
    host.querySelectorAll(".hub-support").forEach((el) => {
      if (el.dataset.cryptoWired === "1") return;
      el.dataset.cryptoWired = "1";
      el.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("[data-support]");
        if (!btn) return;
        const kind = (btn.dataset.support || "").toLowerCase();
        if (kind === "crypto") {
          ev.preventDefault();
          ev.stopPropagation();
          await open();
          return;
        }
        if (kind === "discord") {
          try {
            const api = await ensureApi();
            if (api && typeof api.open_support_url === "function") {
              await api.open_support_url("discord");
              return;
            }
          } catch (_) {}
          const url =
            (global.MrAurevoXSupport && global.MrAurevoXSupport.url("discord")) ||
            "";
          if (url) global.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });
    host.querySelectorAll('[data-support="crypto"]').forEach((btn) => {
      if (!btn.textContent || /paypal|revolut/i.test(btn.textContent)) {
        btn.textContent = t("btn");
      }
      btn.setAttribute("title", t("btn"));
    });
  }

  global.MrAurevoXCrypto = {
    open: open,
    wire: wireSupportStrip,
    FALLBACK_ASSETS: [
      {
        id: "btc",
        symbol: "BTC",
        name: "Bitcoin",
        network: "Bitcoin",
        address: "bc1ql2wj4spehf2zu40329lspr9a3thzuy9gyy4xm7",
      },
      {
        id: "eth",
        symbol: "ETH",
        name: "Ethereum",
        network: "Ethereum",
        address: "0x21daa0434976FDA8C4Ce6fA494602e734f051e21",
      },
      {
        id: "hype",
        symbol: "HYPE",
        name: "Hyperliquid",
        network: "Hyperliquid (EVM)",
        address: "0x21daa0434976FDA8C4Ce6fA494602e734f051e21",
        note: "same_as_eth",
      },
      {
        id: "sol",
        symbol: "SOL",
        name: "Solana",
        network: "Solana",
        address: "E1MoayFrzC6Phe4g17Qfswub8hk1ytnp8Db8qguqPdv1",
      },
      {
        id: "usdt",
        symbol: "USDT",
        name: "Tether",
        network: "Tron (TRC-20)",
        address: "TKVvKinR4Ksrs2f8AN5NuVeysmizmh42Ch",
      },
      {
        id: "usdc",
        symbol: "USDC",
        name: "USD Coin",
        network: "Solana",
        address: "E1MoayFrzC6Phe4g17Qfswub8hk1ytnp8Db8qguqPdv1",
        note: "same_as_sol",
      },
      {
        id: "bch",
        symbol: "BCH",
        name: "Bitcoin Cash",
        network: "Bitcoin Cash",
        address: "bitcoincash:qrdwzcg372fvahkk0rz7y8mrr0fnaw2ygg5fk6mfke",
      },
      {
        id: "ltc",
        symbol: "LTC",
        name: "Litecoin",
        network: "Litecoin",
        address: "ltc1qmnm2j2nn59ycnhk3x0t33c24fpxlxjxrxha2mj",
      },
      {
        id: "doge",
        symbol: "DOGE",
        name: "Dogecoin",
        network: "Dogecoin",
        address: "D7649yHmrYMCGcfFfoKVxyAAot45HCmAVp",
      },
      {
        id: "xrp",
        symbol: "XRP",
        name: "XRP",
        network: "XRP Ledger",
        address: "rEtVrJSb3BTANFKT2aTCS9jUahp74v3U6K",
      },
      {
        id: "xlm",
        symbol: "XLM",
        name: "Stellar",
        network: "Stellar",
        address: "GDISSPFVTPNKMVMX5OSNJBLS2DYBMP4ZTBPRSORHWXI4NJHFS5KKSBRN",
      },
    ],
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => wireSupportStrip());
  } else {
    wireSupportStrip();
  }
})(typeof window !== "undefined" ? window : globalThis);
