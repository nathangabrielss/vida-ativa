/* Evolução e histórico do próprio participante (somente leitura). */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, classeBadge } = window.VA;
  let chart = null;

  function pa(a) {
    return (a.pa_sistolica != null && a.pa_diastolica != null) ? `${a.pa_sistolica}/${a.pa_diastolica}` : "—";
  }

  function renderChart(avals) {
    const asc = [...avals].sort((a, b) => (a.data_avaliacao > b.data_avaliacao ? 1 : -1));
    if (chart) chart.destroy();
    if (!asc.length) return;
    chart = new Chart(document.getElementById("grafico"), {
      type: "line",
      data: {
        labels: asc.map((a) => fmtDate(a.data_avaliacao)),
        datasets: [
          { label: "Peso (kg)", data: asc.map((a) => a.peso), borderColor: "#0e7c66", backgroundColor: "#0e7c66", yAxisID: "y", tension: .25, spanGaps: true },
          { label: "IMC", data: asc.map((a) => a.imc), borderColor: "#2f6db0", backgroundColor: "#2f6db0", yAxisID: "y1", tension: .25, spanGaps: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { font: { family: "Montserrat", size: 13 } } } },
        scales: {
          y: { position: "left", title: { display: true, text: "Peso (kg)" } },
          y1: { position: "right", title: { display: true, text: "IMC" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function renderHistorico(avals) {
    const el = document.getElementById("historico");
    if (!avals.length) { el.innerHTML = `<div class="empty">Nenhuma avaliação registrada ainda.</div>`; return; }
    const rows = avals.map((a) => `<tr>
      <td>${fmtDate(a.data_avaliacao)}</td>
      <td>${a.peso ?? "—"}</td>
      <td>${a.imc ?? "—"}</td>
      <td>${a.imc_classificacao ? `<span class="badge ${classeBadge(a.imc_classificacao)}">${escapeHtml(a.imc_classificacao)}</span>` : "—"}</td>
      <td>${a.circ_abdominal ?? "—"}</td>
      <td>${pa(a)}</td>
      <td>${a.freq_cardiaca ?? "—"}</td>
      <td>${escapeHtml(a.meta || "—")}</td>
    </tr>`).join("");
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Peso</th><th>IMC</th><th>Classificação</th><th>Circ. abd.</th><th>P.A.</th><th>FC</th><th>Meta</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  boot({ admin: false }).then(async () => {
    try {
      const r = await apiJson("/api/me/participante");
      const avals = r.avaliacoes || [];
      renderChart(avals);
      renderHistorico(avals);
    } catch (e) {
      document.getElementById("historico").innerHTML = `<div class="notice">Não foi possível carregar suas avaliações.</div>`;
    }
  }).catch(() => {});
}());
