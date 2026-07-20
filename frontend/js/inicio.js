/* Início do participante: saudação + resumo da última avaliação + atalhos. */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, classeBadge, icon } = window.VA;

  const ATALHOS = [
    { href: "meus-dados.html", ico: "file", title: "Meus dados", desc: "Veja suas informações cadastrais." },
    { href: "minhas-avaliacoes.html", ico: "activity", title: "Minhas avaliações", desc: "Acompanhe sua evolução ao longo do tempo." },
    { href: "biblioteca.html", ico: "film", title: "Biblioteca", desc: "Vídeos e materiais educativos." },
  ];

  boot({ admin: false }).then(async (user) => {
    document.getElementById("ola").textContent = `Olá, ${user.displayName.split(" ")[0]}!`;

    document.getElementById("atalhos").innerHTML = ATALHOS.map((a) => `
      <a class="card" href="${a.href}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:.5rem">
        <span class="kpi-ico" style="position:static">${icon(a.ico)}</span>
        <h3>${a.title}</h3>
        <p class="muted" style="margin:0">${a.desc}</p>
      </a>`).join("");

    const el = document.getElementById("resumo");
    try {
      const r = await apiJson("/api/me/participante");
      if (!r.participante) {
        el.innerHTML = `<div class="notice">Seu cadastro ainda está sendo preparado pela equipe. Em breve suas informações estarão aqui.</div>`;
        return;
      }
      const avals = r.avaliacoes || [];
      if (!avals.length) {
        el.innerHTML = `<div class="notice">Você ainda não tem avaliações registradas. Assim que a equipe registrar a primeira, ela aparecerá aqui.</div>`;
        return;
      }
      const u = avals[0];
      el.innerHTML = `<section class="card">
        <h2>Sua última avaliação — ${fmtDate(u.data_avaliacao)}</h2>
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Peso (kg)</div><div class="kpi-num">${u.peso ?? "—"}</div></div>
          <div class="kpi"><div class="kpi-label">IMC</div><div class="kpi-num">${u.imc ?? "—"}</div></div>
          <div class="kpi"><div class="kpi-label">Classificação</div><div class="kpi-num" style="font-size:1.15rem;padding-top:.5rem">${u.imc_classificacao ? `<span class="badge ${classeBadge(u.imc_classificacao)}">${escapeHtml(u.imc_classificacao)}</span>` : "—"}</div></div>
        </div>
        <p class="mt"><a class="btn btn-outline" href="minhas-avaliacoes.html">Ver evolução completa</a></p>
      </section>`;
    } catch (e) {
      el.innerHTML = `<div class="notice">Não foi possível carregar seu resumo agora.</div>`;
    }
  }).catch(() => {});
}());
