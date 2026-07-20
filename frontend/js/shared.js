/* Base compartilhada: cliente de API, guarda de sessão, navegação acessível,
   ícones SVG, medidor de senha e controle de zoom do conteúdo (A- / A+). */
(function () {
  const VA = {};

  /* ---------- ícones (SVG traço, herdam currentColor) ---------- */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4"/><path d="m18 5 2 2"/><path d="m15 8 2 2"/>',
    film: '<rect x="2" y="3" width="20" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M2 12h20M2 7.5h5M2 16.5h5M17 7.5h5M17 16.5h5"/>',
    home: '<path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-7v6h-4A1.5 1.5 0 0 1 3 20z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.9z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    clipboard: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  };
  function icon(name, cls) {
    const p = ICONS[name] || "";
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${cls ? ` class="${cls}"` : ""} aria-hidden="true">${p}</svg>`;
  }

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(opts.headers || {}) };
    const res = await fetch(path, { credentials: "same-origin", ...opts, headers });
    if (res.status === 401 && !location.pathname.endsWith("login.html")) {
      location.href = "login.html";
      throw new Error("unauthorized");
    }
    return res;
  }
  async function apiJson(path, opts = {}) {
    const res = await api(path, opts);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.detail || data.error)) || "Erro na requisição.");
      err.code = data && data.error; err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- utilidades ---------- */
  function escapeHtml(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  }
  function calcIdade(dn, ref) {
    if (!dn) return null;
    const n = String(dn).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!n) return null;
    const nasc = new Date(Number(n[1]), Number(n[2]) - 1, Number(n[3]));
    const r = ref ? new Date(ref) : new Date();
    let a = r.getFullYear() - nasc.getFullYear();
    if (r.getMonth() < nasc.getMonth() || (r.getMonth() === nasc.getMonth() && r.getDate() < nasc.getDate())) a -= 1;
    return a >= 0 ? a : null;
  }
  function classeBadge(c) {
    const s = (c || "").toLowerCase();
    if (s.includes("baixo")) return "badge-low";
    if (s.includes("normal") || s.includes("adequad") || s.includes("eutrofia")) return "badge-ok";
    if (s.includes("sobrepeso") || s.includes("excesso")) return "badge-warn";
    if (s.includes("obesidade")) return "badge-danger";
    return "badge-neutral";
  }
  function toast(msg, type = "info") {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = `toast toast-${type} show`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = "toast"; }, 4200);
  }

  /* ---------- zoom do conteúdo (não afeta a topbar) ---------- */
  const ZOOM_KEY = "va:content-zoom";
  const ZMIN = 0.85, ZMAX = 1.4, ZSTEP = 0.08;
  function applyZoom(z) { document.documentElement.style.setProperty("--content-zoom", String(z)); }
  function getZoom() { return Number(localStorage.getItem(ZOOM_KEY)) || 1.06; }
  function setZoom(z) { const v = Math.max(ZMIN, Math.min(ZMAX, Math.round(z * 100) / 100)); localStorage.setItem(ZOOM_KEY, String(v)); applyZoom(v); }
  applyZoom(getZoom());

  /* ---------- medidor de senha (critérios em tempo real) ---------- */
  const PW_RULES = [
    { key: "len", label: "Mínimo 6 caracteres", test: (s) => s.length >= 6 },
    { key: "upper", label: "Uma letra maiúscula", test: (s) => /[A-Z]/.test(s) },
    { key: "lower", label: "Uma letra minúscula", test: (s) => /[a-z]/.test(s) },
    { key: "num", label: "Um número", test: (s) => /\d/.test(s) },
    { key: "special", label: "Um caractere especial", test: (s) => /[^A-Za-z0-9]/.test(s) },
  ];
  function attachPasswordMeter(input, container) {
    container.className = "pw-meter";
    container.innerHTML = `<div class="pw-bar"><i></i></div><div class="pw-items">${
      PW_RULES.map((r) => `<div class="pw-item" data-k="${r.key}"><span class="pw-dot">${icon("x")}</span><span>${r.label}</span></div>`).join("")
    }</div>`;
    const bar = container.querySelector(".pw-bar > i");
    const items = Object.fromEntries(Array.from(container.querySelectorAll(".pw-item")).map((el) => [el.dataset.k, el]));
    function update() {
      const s = input.value || "";
      let passed = 0;
      PW_RULES.forEach((r) => {
        const ok = r.test(s);
        if (ok) passed += 1;
        const el = items[r.key];
        el.classList.toggle("ok", ok);
        el.querySelector(".pw-dot").innerHTML = ok ? icon("check") : icon("x");
      });
      const pct = (passed / PW_RULES.length) * 100;
      bar.style.width = `${pct}%`;
      bar.style.background = passed <= 2 ? "var(--danger)" : passed < PW_RULES.length ? "var(--warn)" : "var(--brand)";
    }
    input.addEventListener("input", update);
    update();
    return () => PW_RULES.every((r) => r.test(input.value || ""));
  }

  /* ---------- navegação ---------- */
  const NAV_ADMIN = [
    { href: "admin.html", label: "Painel", icon: "grid" },
    { href: "admin-participantes.html", label: "Participantes", icon: "users" },
    { href: "admin-relatorios.html", label: "Relatórios", icon: "file" },
    { href: "admin-usuarios.html", label: "Usuários", icon: "key" },
    { href: "biblioteca.html", label: "Biblioteca", icon: "film" },
  ];
  const NAV_PART = [
    { href: "inicio.html", label: "Início", icon: "home" },
    { href: "meus-dados.html", label: "Meus dados", icon: "file" },
    { href: "minhas-avaliacoes.html", label: "Minhas avaliações", icon: "activity" },
    { href: "biblioteca.html", label: "Biblioteca", icon: "film" },
  ];

  function renderNav(user) {
    const links = user.role === "admin" ? NAV_ADMIN : NAV_PART;
    const current = location.pathname.split("/").pop() || "index.html";
    const home = user.role === "admin" ? "admin.html" : "inicio.html";
    const nav = document.createElement("header");
    nav.className = "navbar";
    nav.innerHTML = `
      <a class="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <div class="nav-inner">
        <a class="brand" href="${home}"><span class="brand-mark">${icon("leaf")}</span> Vida Ativa</a>
        <button class="nav-toggle" aria-label="Abrir menu" aria-expanded="false">Menu</button>
        <nav class="nav-links" aria-label="Navegação principal">
          ${links.map((l) => `<a href="${l.href}" class="${l.href === current ? "active" : ""}">${icon(l.icon)} ${l.label}</a>`).join("")}
        </nav>
        <div class="nav-side">
          <div class="font-controls" role="group" aria-label="Tamanho do conteúdo">
            <button class="btn-font" data-z="dec" aria-label="Diminuir">A−</button>
            <button class="btn-font" data-z="inc" aria-label="Aumentar">A+</button>
          </div>
          <span class="nav-user">${escapeHtml(user.displayName)}</span>
          <button class="btn btn-outline btn-sm" id="btn-logout">${icon("logout")} Sair</button>
        </div>
      </div>`;
    document.body.prepend(nav);
    nav.querySelector("#btn-logout").addEventListener("click", async () => {
      try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
      location.href = "login.html";
    });
    nav.querySelector(".nav-toggle").addEventListener("click", (e) => {
      const open = nav.querySelector(".nav-links").classList.toggle("open");
      e.currentTarget.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll(".btn-font").forEach((b) => b.addEventListener("click", () => setZoom(getZoom() + (b.dataset.z === "inc" ? ZSTEP : -ZSTEP))));
  }

  /* ---------- boot de página ---------- */
  async function boot({ admin = false } = {}) {
    let user;
    try { user = await apiJson("/api/me"); } catch { location.href = "login.html"; throw new Error("redirecting"); }
    const page = location.pathname.split("/").pop();
    if (user.mustChangePassword && page !== "alterar-senha.html") { location.href = "alterar-senha.html?forced=1"; throw new Error("must_change_password"); }
    if (admin && user.role !== "admin") { location.href = "inicio.html"; throw new Error("forbidden"); }
    if (!admin && user.role === "admin" && ["inicio.html", "meus-dados.html", "minhas-avaliacoes.html"].includes(page)) { location.href = "admin.html"; throw new Error("redirect-admin"); }
    renderNav(user);
    return user;
  }

  Object.assign(VA, { api, apiJson, escapeHtml, fmtDate, calcIdade, classeBadge, toast, icon, attachPasswordMeter, boot });
  window.VA = VA;
}());
