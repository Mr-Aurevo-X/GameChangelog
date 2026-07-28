/* PC Command 14 — cyber home UI + live poll (1s) */

(() => {
  const API = (() => {
    try {
      if (location.protocol.startsWith("http") && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
        return `${location.origin}/api/metrics`;
      }
    } catch (_) {}
    return "http://127.0.0.1:8765/api/metrics";
  })();
  const HISTORY = 60;
  const ARC_LEN = 283;

  const hist = { cpu: [], ram: [], gpu: [], netUp: [], netDown: [] };
  let lastNet = null;
  let lastTs = null;

  const el = (id) => document.getElementById(id);

  const density = el("densityMap");
  if (density && !density.childElementCount) {
    for (let i = 0; i < 128; i++) {
      const s = document.createElement("span");
      if (i % 3 === 0) s.classList.add("cyan");
      s.style.setProperty("--o", String(0.08 + Math.random() * 0.2));
      density.appendChild(s);
    }
  }

  function fmtUptime(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
  }

  function push(key, val) {
    hist[key].push(val == null || Number.isNaN(val) ? 0 : Number(val));
    while (hist[key].length > HISTORY) hist[key].shift();
  }

  function setArc(pct) {
    const offset = ARC_LEN * (1 - Math.min(100, Math.max(0, pct)) / 100);
    const arc = el("cpuArc");
    if (arc) arc.style.strokeDashoffset = String(offset);
  }

  function levelClass(label) {
    const L = (label || "").toUpperCase();
    if (L === "LOW") return "ok";
    if (L === "MEDIUM" || L === "MED") return "warn";
    return "";
  }

  function drawHistory(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const series = [
      { key: "cpu", color: "#e03545", glow: "rgba(224,53,69,0.55)" },
      { key: "ram", color: "#f0a33a", glow: "rgba(240,163,58,0.45)" },
      { key: "gpu", color: "#3ec7ff", glow: "rgba(62,199,255,0.45)" },
    ];
    for (const s of series) {
      const data = hist[s.key];
      if (data.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.25;
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = 10;
      data.forEach((v, i) => {
        const x = (i / (HISTORY - 1)) * (w - 4) + 2;
        const y = h - (Math.min(100, v) / 100) * (h - 8) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawArea(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(1, ...hist.netUp, ...hist.netDown, 10);
    function paint(data, top, bot) {
      if (data.length < 2) return;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(1, bot);
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / Math.max(1, data.length - 1)) * w;
        const y = h - (v / max) * (h * 0.85) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
    paint(hist.netDown, "rgba(62,199,255,0.55)", "rgba(62,199,255,0.03)");
    paint(hist.netUp, "rgba(224,53,69,0.5)", "rgba(224,53,69,0.03)");
  }

  function renderCores(perCore) {
    const box = el("coreBars");
    if (!box) return;
    const n = (perCore && perCore.length) || 1;
    while (box.children.length < n) box.appendChild(document.createElement("i"));
    while (box.children.length > n) box.lastChild.remove();
    [...box.children].forEach((node, i) => {
      node.style.height = `${Math.max(6, perCore[i] ?? 0)}%`;
    });
  }

  function diskKey(d) {
    return (d.device || d.mount || "").replace(/\\+$/, "").toUpperCase();
  }

  function fillClass(pct) {
    if (pct >= 90) return "c";
    if (pct >= 75) return "w";
    return "ok";
  }

  function pressureClass(pct) {
    if (pct >= 90) return "crit";
    if (pct >= 75) return "warn";
    return "";
  }

  function renderDisks(disks) {
    const box = el("diskCards");
    const countEl = el("diskCount");
    const list = Array.isArray(disks) ? disks : [];

    if (countEl) {
      const usb = list.filter((d) => d.removable).length;
      countEl.innerHTML =
        usb > 0
          ? `<b>${list.length}</b> volumes · <b>${usb}</b> USB`
          : `<b>${list.length}</b> volumes`;
    }

    if (!box) return;

    if (!list.length) {
      box.innerHTML = `<div class="disk-empty">Aucun volume détecté</div>`;
      if (el("diskTopPct")) el("diskTopPct").textContent = "—";
      return;
    }

    const prevKeys = new Set(
      [...box.querySelectorAll("[data-disk]")].map((n) => n.getAttribute("data-disk"))
    );
    const nextKeys = new Set(list.map(diskKey));

    box.innerHTML = list
      .map((d) => {
        const pct = d.percent ?? d.pct ?? 0;
        const key = diskKey(d);
        const letter = (d.device || d.mount || "?").replace(/\\+$/, "");
        const label = d.label && d.label !== letter ? d.label : d.fstype || "Volume";
        const isUsb = !!d.removable || d.drive_type === "removable";
        const isNet = d.drive_type === "network";
        const badge = isUsb
          ? `<span class="disk-badge usb">USB</span>`
          : isNet
            ? `<span class="disk-badge network">NET</span>`
            : `<span class="disk-badge">${d.type_label || "Fixed"}</span>`;
        const cardCls = [
          "disk-card",
          pressureClass(pct),
          isUsb ? "usb" : "",
          isNet ? "network" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const fill = fillClass(pct);
        return `<article class="${cardCls}" data-disk="${key}">
          <div class="disk-top">
            <div>
              <span class="disk-letter">${letter}</span>
              <span class="disk-label" title="${label}">${label}</span>
            </div>
            ${badge}
          </div>
          <div class="disk-pct">${Math.round(pct)}%</div>
          <div class="bar-track"><div class="bar-fill ${fill}" style="width:${pct}%"></div></div>
          <div class="disk-meta">
            <span><b>${d.used_gb ?? "—"}</b> / ${d.total_gb ?? "—"} GB</span>
            <span>libre <b>${d.free_gb ?? "—"}</b> GB</span>
          </div>
        </article>`;
      })
      .join("");

    // Soft enter animation only for newly appeared volumes (e.g. USB plug)
    box.querySelectorAll("[data-disk]").forEach((node) => {
      const k = node.getAttribute("data-disk");
      if (prevKeys.size && !prevKeys.has(k) && nextKeys.has(k)) {
        node.style.animation = "diskIn .4s ease";
      } else if (prevKeys.has(k)) {
        node.style.animation = "none";
      }
    });

    const fixed = list.filter((d) => !d.removable);
    const topSrc = fixed[0] || list[0];
    const top = topSrc.percent ?? topSrc.pct ?? 0;
    if (el("diskTopPct")) el("diskTopPct").textContent = `${Math.round(top)}%`;
  }

  function updateDensity(cpu, netDown) {
    if (!density) return;
    const base = Math.min(1, (cpu / 100) * 0.55 + Math.min(netDown, 500) / 800);
    for (let i = 0; i < density.children.length; i++) {
      const jitter = 0.05 + Math.random() * 0.55;
      density.children[i].style.setProperty("--o", String(Math.min(0.95, base * jitter + 0.05)));
    }
  }

  function apply(data) {
    const cpu = data.cpu || {};
    const ram = data.ram || {};
    const gpu = data.gpu || {};
    const load = data.load || {};

    const cpuPct = cpu.percent ?? 0;
    const loadScore = load.score ?? cpuPct;
    const loadLabel = load.label || "—";

    el("cpuPct").textContent = Math.round(loadScore);
    const lvl = el("cpuLevel");
    lvl.textContent = loadLabel;
    lvl.className = "level " + levelClass(loadLabel);
    setArc(loadScore);

    el("cpuName").textContent = cpu.model || "CPU";
    el("cpuCores").textContent = `${cpu.cores_physical || "?"}p / ${cpu.cores_logical || "?"}t`;
    el("cpuMhz").textContent = cpu.freq_mhz ? `${Math.round(cpu.freq_mhz)} MHz` : "—";

    el("procCount").textContent = (data.procs ?? 0).toLocaleString("fr-FR");
    el("uptime").textContent = fmtUptime(data.uptime_sec ?? 0);
    el("hostname").textContent = data.hostname || "host";

    el("ramUsed").textContent = `${ram.used_gb ?? "—"} GB`;
    el("ramTotal").textContent = `/ ${ram.total_gb ?? "—"} GB`;
    el("ramPctLabel").textContent = `${Math.round(ram.percent ?? 0)}%`;

    renderCores(cpu.per_core || []);

    el("barCpu").style.width = `${cpuPct}%`;
    el("barCpuT").textContent = `${Math.round(cpuPct)}%`;
    el("barRam").style.width = `${ram.percent ?? 0}%`;
    el("barRamT").textContent = `${Math.round(ram.percent ?? 0)}%`;

    const gpuAvail = !!gpu.available;
    const gpuPct = gpuAvail ? (gpu.load_percent ?? 0) : 0;
    el("barGpu").style.width = `${gpuPct}%`;
    el("barGpuT").textContent = gpuAvail ? `${Math.round(gpuPct)}%` : "N/A";
    el("gpuPctLabel").textContent = gpuAvail ? `${Math.round(gpuPct)}%` : "N/A";
    el("gpuRing").style.setProperty("--p", `${gpuPct}%`);
    el("gpuRingVal").textContent = gpuAvail ? Math.round(gpuPct) : "—";
    el("gpuName").textContent = gpu.name || "GPU";
    el("gpuVram").textContent = gpuAvail && gpu.memory_total_mb
      ? `VRAM ${gpu.memory_used_mb}/${gpu.memory_total_mb} MB (${gpu.memory_percent}%)`
      : (data.degraded?.gpu_note || "VRAM n/d");

    // network rates
    let downKb = 0;
    let upKb = 0;
    const net = data.network || {};
    const ts = data.ts || Date.now() / 1000;
    if (lastNet && lastTs) {
      const dt = Math.max(ts - lastTs, 1e-3);
      downKb = Math.max(0, (net.bytes_recv - lastNet.bytes_recv) / dt / 1024);
      upKb = Math.max(0, (net.bytes_sent - lastNet.bytes_sent) / dt / 1024);
    }
    lastNet = net;
    lastTs = ts;
    el("netDown").textContent = downKb.toFixed(1);
    el("netUp").textContent = upKb.toFixed(1);

    push("cpu", cpuPct);
    push("ram", ram.percent ?? 0);
    push("gpu", gpuPct);
    push("netDown", downKb);
    push("netUp", upKb);

    renderDisks(data.disk || []);
    updateDensity(cpuPct, downKb);
    drawHistory(el("histCanvas"));
    drawArea(el("areaCanvas"));

    el("osLine").textContent = `${data.hostname || ""} · ${data.os || ""} · ${cpu.cores_logical || "?"} threads`;
    el("statusDot").className = "dot";
    el("livePill").classList.remove("off");
    el("livePill").innerHTML = "<i></i> LIVE";
  }

  function offline() {
    el("livePill").classList.add("off");
    el("livePill").innerHTML = "<i></i> OFF";
    el("osLine").textContent = "API offline — lance Lancer.cmd";
    el("statusDot").className = "dot bad";
  }

  async function tick() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      apply(await res.json());
    } catch {
      offline();
    }
  }

  function clock() {
    el("clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  }

  clock();
  setInterval(clock, 1000);
  tick();
  setInterval(tick, 1000);

  /* —— Soft 3D tilt on panels / disk cards —— */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const MAX = 9;
    function bindTilt(node, maxDeg) {
      if (!node || node.dataset.tiltBound) return;
      node.dataset.tiltBound = "1";
      node.classList.add("tilt-live");
      node.addEventListener("pointermove", (e) => {
        const r = node.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const rx = (-py * maxDeg).toFixed(2);
        const ry = (px * maxDeg).toFixed(2);
        node.classList.add("is-tilting");
        node.style.transform = `translateY(-10px) scale(1.015) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      node.addEventListener("pointerleave", () => {
        node.classList.remove("is-tilting");
        node.style.transform = "";
      });
    }
    document.querySelectorAll(".pcd-grid > .panel").forEach((p) => bindTilt(p, MAX));
    const diskHost = el("diskCards");
    if (diskHost) {
      const mo = new MutationObserver(() => {
        diskHost.querySelectorAll(".disk-card").forEach((c) => bindTilt(c, 7));
      });
      mo.observe(diskHost, { childList: true });
    }
  }
})();
