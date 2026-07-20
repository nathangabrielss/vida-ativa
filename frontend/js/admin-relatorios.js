/* Relatórios gerenciais (seção 10) — geração client-side + export Excel/PDF. */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, calcIdade, icon, toast } = window.VA;

  let participantes = [];
  let avaliacoes = [];
  let byPart = {};           // pid -> avaliações (asc)
  const PERIODO_DIAS = 180;

  const tipoSel = document.getElementById("tipo");
  const perDeBox = document.getElementById("per-de-box");
  const perAteBox = document.getElementById("per-ate-box");
  const perDe = document.getElementById("per-de");
  const perAte = document.getElementById("per-ate");

  function pa(a) { return (a.pa_sistolica != null && a.pa_diastolica != null) ? `${a.pa_sistolica}/${a.pa_diastolica}` : ""; }
  function num(v) { return v == null ? "" : v; }
  function ultima(pid) { const a = byPart[pid] || []; return a.length ? a[a.length - 1] : null; }
  function diffDias(iso) { if (!iso) return Infinity; return (Date.now() - new Date(iso).getTime()) / 86400000; }
  function sign(v) { if (v == null || Number.isNaN(v)) return ""; const r = Math.round(v * 10) / 10; return r > 0 ? `+${r}` : `${r}`; }

  // Cada relatório: { titulo, sub(), cols:[...], rows() => [[...]] }
  const REPORTS = {
    geral: {
      titulo: "Geral de participantes",
      cols: ["Nome", "Idade", "Sexo", "Telefone", "Situação", "Nº avaliações", "Última avaliação"],
      rows: () => participantes.map((p) => {
        const a = byPart[p.id] || [];
        const u = a.length ? a[a.length - 1].data_avaliacao : "";
        const idade = calcIdade(p.data_nascimento);
        return [p.nome_completo, idade == null ? "" : idade, p.sexo || "", p.telefone || "", p.ativo ? "Ativo" : "Inativo", a.length, u ? fmtDate(u) : "—"];
      }),
    },
    avaliacoes: {
      titulo: "Avaliações físicas",
      cols: ["Participante", "Data", "Peso (kg)", "Altura (m)", "IMC", "Classificação", "Circ. abd.", "P.A.", "FC", "Meta"],
      rows: () => avaliacoes.map((a) => [a.nome_completo, fmtDate(a.data_avaliacao), num(a.peso), num(a.altura), num(a.imc), a.imc_classificacao || "", num(a.circ_abdominal), pa(a), num(a.freq_cardiaca), a.meta || ""]),
    },
    evolucao: {
      titulo: "Evolução individual",
      cols: ["Nome", "1ª avaliação", "Peso inicial", "IMC inicial", "Última avaliação", "Peso atual", "IMC atual", "Δ Peso", "Δ IMC"],
      rows: () => participantes.filter((p) => (byPart[p.id] || []).length).map((p) => {
        const a = byPart[p.id];
        const f = a[0], u = a[a.length - 1];
        const dPeso = (u.peso != null && f.peso != null) ? u.peso - f.peso : null;
        const dImc = (u.imc != null && f.imc != null) ? u.imc - f.imc : null;
        return [p.nome_completo, fmtDate(f.data_avaliacao), num(f.peso), num(f.imc), fmtDate(u.data_avaliacao), num(u.peso), num(u.imc), sign(dPeso), sign(dImc)];
      }),
    },
    periodo: {
      titulo: "Consolidado por período",
      periodo: true,
      sub: () => `Período: ${perDe.value ? fmtDate(perDe.value) : "—"} a ${perAte.value ? fmtDate(perAte.value) : "—"}`,
      cols: ["Participante", "Data", "Peso (kg)", "IMC", "Classificação", "P.A."],
      rows: () => {
        const de = perDe.value, ate = perAte.value;
        return avaliacoes
          .filter((a) => (!de || a.data_avaliacao >= de) && (!ate || a.data_avaliacao <= ate))
          .map((a) => [a.nome_completo, fmtDate(a.data_avaliacao), num(a.peso), num(a.imc), a.imc_classificacao || "", pa(a)]);
      },
    },
    semreav: {
      titulo: "Participantes sem reavaliação",
      sub: () => "Menos de 2 avaliações ou última há mais de 6 meses.",
      cols: ["Nome", "Nº avaliações", "Última avaliação", "Situação"],
      rows: () => participantes.filter((p) => {
        const a = byPart[p.id] || [];
        return a.length < 2 || diffDias(a[a.length - 1].data_avaliacao) > PERIODO_DIAS;
      }).map((p) => {
        const a = byPart[p.id] || [];
        const u = a.length ? a[a.length - 1].data_avaliacao : "";
        let sit;
        if (!a.length) sit = "Nunca avaliado";
        else if (a.length < 2) sit = "Apenas 1 avaliação";
        else sit = "Última há mais de 6 meses";
        return [p.nome_completo, a.length, u ? fmtDate(u) : "—", sit];
      }),
    },
    nutricional: {
      titulo: "Classificação nutricional",
      cols: ["Nome", "Idade", "Último IMC", "Classificação"],
      rows: () => participantes.map((p) => {
        const u = ultima(p.id);
        const idade = calcIdade(p.data_nascimento);
        return [p.nome_completo, idade == null ? "" : idade, u && u.imc != null ? u.imc : "", u && u.imc_classificacao ? u.imc_classificacao : "Sem avaliação"];
      }),
    },
    metas: {
      titulo: "Metas e evolução",
      cols: ["Participante", "Data", "Meta", "Peso (kg)", "IMC", "Classificação"],
      rows: () => avaliacoes.filter((a) => (a.meta || "").trim()).map((a) => [a.nome_completo, fmtDate(a.data_avaliacao), a.meta, num(a.peso), num(a.imc), a.imc_classificacao || ""]),
    },
  };

  let current = null;

  function badgeClass(v) {
    const c = String(v).toLowerCase();
    if (c.includes("baixo")) return "badge-low";
    if (c.includes("normal") || c.includes("adequad") || c.includes("eutrofia")) return "badge-ok";
    if (c.includes("sobrepeso") || c.includes("excesso")) return "badge-warn";
    if (c.includes("obesidade")) return "badge-danger";
    return "";
  }

  function render() {
    const rep = REPORTS[tipoSel.value];
    current = rep;
    const isPeriodo = !!rep.periodo;
    perDeBox.hidden = !isPeriodo;
    perAteBox.hidden = !isPeriodo;

    document.getElementById("report-title").textContent = rep.titulo;
    document.getElementById("report-sub").textContent = rep.sub ? rep.sub() : "";

    const rows = rep.rows();
    document.getElementById("report-count").textContent = `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`;

    const el = document.getElementById("report-table");
    if (!rows.length) { el.innerHTML = `<div class="empty">Nenhum registro para este relatório.</div>`; return; }
    const clsIdx = rep.cols.indexOf("Classificação");
    const body = rows.map((r) => `<tr>${r.map((c, i) => {
      if (i === clsIdx && c && badgeClass(c)) return `<td><span class="badge ${badgeClass(c)}">${escapeHtml(c)}</span></td>`;
      return `<td>${escapeHtml(c)}</td>`;
    }).join("")}</tr>`).join("");
    el.innerHTML = `<div class="table-wrap"><table><thead><tr>${rep.cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function baixarExcel() {
    if (!current) return;
    const rows = current.rows();
    const aoa = [current.cols, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `relatorio-${tipoSel.value}-${stamp}.xlsx`);
    toast("Excel gerado.", "success");
  }

  boot({ admin: true }).then(async () => {
    document.getElementById("btn-xlsx").innerHTML = `${icon("file")} Baixar Excel`;
    document.getElementById("btn-pdf").innerHTML = `${icon("file")} Imprimir / PDF`;
    document.getElementById("btn-xlsx").addEventListener("click", baixarExcel);
    document.getElementById("btn-pdf").addEventListener("click", () => window.print());
    tipoSel.addEventListener("change", render);
    perDe.addEventListener("change", render);
    perAte.addEventListener("change", render);

    // período padrão: últimos 6 meses
    const hoje = new Date();
    perAte.value = hoje.toISOString().slice(0, 10);
    perDe.value = new Date(hoje.getTime() - PERIODO_DIAS * 86400000).toISOString().slice(0, 10);

    try {
      const d = await apiJson("/api/admin/export-data");
      participantes = d.participantes || [];
      avaliacoes = d.avaliacoes || [];
      byPart = {};
      avaliacoes.forEach((a) => { (byPart[a.participante_id] ||= []).push(a); });
      Object.values(byPart).forEach((list) => list.sort((x, y) => (x.data_avaliacao > y.data_avaliacao ? 1 : -1)));
      render();
    } catch (e) {
      document.getElementById("report-table").innerHTML = `<div class="empty">Erro ao carregar os dados.</div>`;
    }
  }).catch(() => {});
}());
