/* Detalhe do participante: dados, registrar avaliação (IMC automático),
   gráfico de evolução e histórico. */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, calcIdade, classeBadge, icon, toast } = window.VA;
  const id = new URLSearchParams(location.search).get("id");
  let participante = null;
  let chart = null;

  if (!id) { location.replace("admin-participantes.html"); return; }

  // Classificação de IMC para pré-visualização (espelho de imc.js; o valor
  // salvo é sempre o calculado pelo servidor).
  function classificar(imc, idade) {
    if (imc == null) return null;
    if (idade != null && idade >= 60) {
      if (imc <= 23) return "Baixo peso";
      if (imc < 28) return "Peso adequado (eutrofia)";
      if (imc < 30) return "Excesso de peso";
      return "Obesidade";
    }
    if (imc < 18.5) return "Baixo peso";
    if (imc < 25) return "Peso normal";
    if (imc < 30) return "Sobrepeso";
    if (imc < 35) return "Obesidade grau I";
    if (imc < 40) return "Obesidade grau II";
    return "Obesidade grau III";
  }

  function pa(a) {
    return (a.pa_sistolica != null && a.pa_diastolica != null) ? `${a.pa_sistolica}/${a.pa_diastolica}` : "—";
  }

  function renderDados(p) {
    const idade = calcIdade(p.data_nascimento);
    const partes = [];
    if (idade != null) partes.push(`${idade} anos`);
    if (p.sexo) partes.push(p.sexo);
    partes.push(p.ativo ? "Ativo" : "Inativo");
    document.getElementById("subtitulo").textContent = partes.join(" • ");

    const linhas = [
      ["Data de nascimento", p.data_nascimento ? fmtDate(p.data_nascimento) : "—"],
      ["Telefone", p.telefone || "—"],
      ["Endereço", p.endereco || "—"],
      ["Contato de emergência", p.contato || "—"],
      ["Informações de saúde", p.info_saude || "—"],
      ["Condições pré-existentes", p.condicoes_preexistentes || "—"],
      ["Medicamentos em uso", p.medicamentos || "—"],
      ["Observações", p.observacoes || "—"],
      ["Acesso do participante", p.user_id ? "Login vinculado" : "Sem login"],
    ];
    document.getElementById("dados").innerHTML = linhas.map(([k, v]) => `
      <div class="dl-row"><div class="dl-k">${k}</div><div class="dl-v">${escapeHtml(v)}</div></div>`).join("");

    const btn = document.getElementById("btn-acesso");
    if (!p.user_id) {
      btn.hidden = false;
      btn.innerHTML = `${icon("key")} Criar acesso`;
      btn.onclick = async () => {
        if (!confirm("Gerar login de acesso para este participante?")) return;
        try {
          const r = await apiJson(`/api/participantes/${id}/acesso`, { method: "POST" });
          alert(`Acesso criado.\n\nUsuário: ${r.username}\nSenha temporária: ${r.senhaTemporaria}\n\nAnote agora — a senha só aparece uma vez.`);
          load();
        } catch (ex) { toast(ex.message || "Erro ao criar acesso.", "error"); }
      };
    } else {
      btn.hidden = true;
    }
  }

  function renderHistorico(avals) {
    const el = document.getElementById("historico");
    if (!avals.length) { el.innerHTML = `<div class="empty">Nenhuma avaliação registrada ainda.</div>`; return; }
    const rows = avals.map((a) => `<tr>
      <td>${fmtDate(a.data_avaliacao)}</td>
      <td>${a.peso != null ? a.peso : "—"}</td>
      <td>${a.altura != null ? a.altura : "—"}</td>
      <td>${a.imc != null ? a.imc : "—"}</td>
      <td>${a.imc_classificacao ? `<span class="badge ${classeBadge(a.imc_classificacao)}">${escapeHtml(a.imc_classificacao)}</span>` : "—"}</td>
      <td>${a.circ_abdominal != null ? a.circ_abdominal : "—"}</td>
      <td>${pa(a)}</td>
      <td>${a.freq_cardiaca != null ? a.freq_cardiaca : "—"}</td>
      <td>${escapeHtml(a.meta || "—")}</td>
      <td>${escapeHtml(a.responsavel_nome || "—")}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${a.id}" aria-label="Excluir avaliação">${icon("trash")}</button></td>
    </tr>`).join("");
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Peso</th><th>Altura</th><th>IMC</th><th>Classificação</th><th>Circ. abd.</th><th>P.A.</th><th>FC</th><th>Meta</th><th>Responsável</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Excluir esta avaliação do histórico?")) return;
      try {
        await apiJson(`/api/avaliacoes/${b.dataset.del}`, { method: "DELETE" });
        toast("Avaliação excluída.", "success");
        load();
      } catch (ex) { toast(ex.message || "Erro ao excluir.", "error"); }
    }));
  }

  function renderChart(avals) {
    const asc = [...avals].sort((a, b) => (a.data_avaliacao > b.data_avaliacao ? 1 : -1));
    if (chart) chart.destroy();
    document.getElementById("grafico-vazio").hidden = asc.length > 0;
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
          x: { ticks: { font: { size: 12 } } },
        },
      },
    });
  }

  function atualizarPreviewImc() {
    const peso = parseFloat(document.getElementById("a-peso").value);
    const altura = parseFloat(document.getElementById("a-altura").value);
    const dataAv = document.getElementById("a-data").value;
    const box = document.getElementById("imc-preview");
    if (peso > 0 && altura > 0) {
      const imc = Math.round((peso / (altura * altura)) * 100) / 100;
      const idade = calcIdade(participante && participante.data_nascimento, dataAv || undefined);
      const cls = classificar(imc, idade);
      box.hidden = false;
      box.innerHTML = `IMC calculado: <strong>${imc}</strong> — <strong>${cls}</strong>${idade != null ? ` (idade na avaliação: ${idade} anos)` : ""}`;
    } else {
      box.hidden = true;
    }
  }
  ["a-peso", "a-altura", "a-data"].forEach((i) => document.getElementById(i).addEventListener("input", atualizarPreviewImc));

  document.getElementById("form-aval").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("a-error");
    err.textContent = "";
    const btn = e.submitter; btn.disabled = true;
    const g = (x) => document.getElementById(x).value;
    try {
      const r = await apiJson(`/api/participantes/${id}/avaliacoes`, {
        method: "POST",
        body: JSON.stringify({
          data_avaliacao: g("a-data"), peso: g("a-peso"), altura: g("a-altura"),
          circ_abdominal: g("a-circ"), pa_sistolica: g("a-sis"), pa_diastolica: g("a-dia"),
          freq_cardiaca: g("a-fc"), meta: g("a-meta").trim() || null, observacoes: g("a-obs").trim() || null,
        }),
      });
      toast(`Avaliação salva. IMC ${r.imc ?? "—"}${r.imcClassificacao ? " — " + r.imcClassificacao : ""}.`, "success");
      document.getElementById("form-aval").reset();
      document.getElementById("imc-preview").hidden = true;
      load();
    } catch (ex) {
      err.textContent = ex.message || "Erro ao salvar avaliação.";
    } finally {
      btn.disabled = false;
    }
  });

  async function load() {
    const r = await apiJson(`/api/participantes/${id}`);
    participante = r.participante;
    document.getElementById("titulo").textContent = participante.nome_completo;
    document.title = `${participante.nome_completo} — Vida Ativa`;
    renderDados(participante);
    renderHistorico(r.avaliacoes || []);
    renderChart(r.avaliacoes || []);
  }

  boot({ admin: true }).then(load).catch((e) => {
    if (e && e.code === undefined) toast("Erro ao carregar participante.", "error");
  });
}());
