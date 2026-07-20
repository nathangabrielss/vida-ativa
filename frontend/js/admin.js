/* Painel administrativo — indicadores consolidados (seção 9) com gráficos. */
(function () {
  const { boot, apiJson, icon, toast } = window.VA;

  const KPIS = [
    { k: "totalParticipantes", label: "Participantes", ico: "users" },
    { k: "participantesAtivos", label: "Ativos", ico: "heart" },
    { k: "totalAvaliacoes", label: "Avaliações", ico: "activity" },
    { k: "avaliadosNoPeriodo", label: "Avaliados (6 meses)", ico: "clipboard" },
    { k: "semAvaliacaoRecente", label: "Sem avaliação recente", ico: "file", cls: "kpi-warn" },
    { k: "mediaImc", label: "IMC médio", ico: "trend" },
    { k: "evolucaoPositivaPct", label: "Evolução positiva", ico: "trend", suffix: "%", cls: "kpi-accent" },
  ];

  const ACOES = [
    { href: "admin-participantes.html", label: "Cadastrar participante", ico: "plus", cls: "btn-primary" },
    { href: "admin-relatorios.html", label: "Relatórios", ico: "file", cls: "btn-outline" },
    { href: "admin-usuarios.html", label: "Usuários", ico: "key", cls: "btn-outline" },
    { href: "biblioteca.html", label: "Biblioteca", ico: "film", cls: "btn-outline" },
  ];

  const FAIXA_ORDEM = ["Menos de 60", "60 a 69", "70 a 79", "80 ou mais", "Sem data"];
  const PALETA = ["#0e7c66", "#2f6db0", "#c98a1a", "#c0392b", "#7a5cad", "#0f9b8e", "#8aa0a0"];

  function corImc(cls) {
    const c = (cls || "").toLowerCase();
    if (c.includes("baixo")) return "#d9a441";
    if (c.includes("normal") || c.includes("adequad") || c.includes("eutrofia")) return "#0e7c66";
    if (c.includes("sobrepeso") || c.includes("excesso")) return "#c98a1a";
    if (c.includes("obesidade")) return "#c0392b";
    return "#8aa0a0";
  }

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { font: { family: "Montserrat", size: 12 }, padding: 12 } } },
  };

  function doughnut(canvasId, obj, colorFn) {
    const labels = Object.keys(obj);
    if (!labels.length) return;
    new Chart(document.getElementById(canvasId), {
      type: "doughnut",
      data: { labels, datasets: [{ data: labels.map((l) => obj[l]), backgroundColor: labels.map((l, i) => (colorFn ? colorFn(l) : PALETA[i % PALETA.length])), borderWidth: 2, borderColor: "#fff" }] },
      options: { ...baseOpts, cutout: "58%" },
    });
  }

  function barChart(canvasId, obj, ordem) {
    const labels = (ordem || Object.keys(obj)).filter((l) => obj[l] != null);
    new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: { labels, datasets: [{ data: labels.map((l) => obj[l] || 0), backgroundColor: "#0e7c66", borderRadius: 6, maxBarThickness: 54 }] },
      options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  boot({ admin: true }).then(async () => {
    document.getElementById("btn-relatorios").innerHTML = `${icon("file")} Relatórios`;
    document.getElementById("acoes").innerHTML = ACOES.map((a) => `<a class="btn ${a.cls}" href="${a.href}">${icon(a.ico)} ${a.label}</a>`).join("");
    try {
      const d = await apiJson("/api/admin/dashboard");
      document.getElementById("kpis").innerHTML = KPIS.map((c) => {
        let v = d[c.k];
        v = (v === null || v === undefined) ? "—" : `${v}${c.suffix || ""}`;
        return `<div class="kpi ${c.cls || ""}"><div class="kpi-ico">${icon(c.ico)}</div><div class="kpi-label">${c.label}</div><div class="kpi-num">${v}</div></div>`;
      }).join("");

      const temImc = Object.keys(d.distribuicaoImc || {}).length > 0;
      document.getElementById("ch-imc-vazio").hidden = temImc;
      if (temImc) doughnut("ch-imc", d.distribuicaoImc, corImc);
      barChart("ch-idade", d.faixaEtaria || {}, FAIXA_ORDEM);
      doughnut("ch-sexo", d.porSexo || {});
    } catch (e) {
      toast("Erro ao carregar indicadores.", "error");
    }
  }).catch(() => {});
}());
