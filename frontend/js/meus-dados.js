/* Dados cadastrais do próprio participante (somente leitura). */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, calcIdade } = window.VA;

  boot({ admin: false }).then(async () => {
    const el = document.getElementById("dados");
    try {
      const r = await apiJson("/api/me/participante");
      const p = r.participante;
      if (!p) { el.innerHTML = `<div class="notice">Seu cadastro ainda está sendo preparado pela equipe.</div>`; return; }
      const idade = calcIdade(p.data_nascimento);
      const linhas = [
        ["Nome completo", p.nome_completo],
        ["Data de nascimento", p.data_nascimento ? `${fmtDate(p.data_nascimento)}${idade != null ? " (" + idade + " anos)" : ""}` : "—"],
        ["Sexo", p.sexo || "—"],
        ["Telefone", p.telefone || "—"],
        ["Endereço", p.endereco || "—"],
        ["Contato de emergência", p.contato || "—"],
        ["Informações de saúde", p.info_saude || "—"],
        ["Condições pré-existentes", p.condicoes_preexistentes || "—"],
        ["Medicamentos em uso", p.medicamentos || "—"],
        ["Observações", p.observacoes || "—"],
      ];
      el.innerHTML = linhas.map(([k, v]) => `
        <div class="dl-row"><div class="dl-k">${k}</div><div class="dl-v">${escapeHtml(v)}</div></div>`).join("");
    } catch (e) {
      el.innerHTML = `<div class="notice">Não foi possível carregar seus dados agora.</div>`;
    }
  }).catch(() => {});
}());
