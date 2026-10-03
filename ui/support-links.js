/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 *
 * Optional support URLs (not a license fee). Forks must strip branding (TRADEMARK.md).
 * Fiat (PayPal / Revolut) removed — crypto tips use MrAurevoXCrypto / bridge copy APIs.
 */
(function (global) {
  "use strict";

  const SUPPORT_LINKS = {
    discord: "https://discord.com/users/406891052516114442",
  };

  global.MrAurevoXSupport = {
    SUPPORT_LINKS: SUPPORT_LINKS,
    url: function (kind) {
      const key = String(kind || "").toLowerCase();
      return SUPPORT_LINKS[key] || "";
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
