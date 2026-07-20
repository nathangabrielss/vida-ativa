/* Lista, busca, cadastro e edição de participantes (admin). */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, calcIdade, icon, toast } = window.VA;

  const listaEl = document.getElementById("lista");
  const formCard = document.getElementById("form-card");
  const form = document.getElementById("form-participante");
  const buscaEl = document.getElementById("busca");
  let buscaTimer = null;

  const F = {
    id: document.getElementById("p-id"),
    nome_completo: document.getElementById("p-nome"),
    data_nascimento: document.getElementById("p-nasc"),
    sexo: document.getElementById("p-sexo"),
    telefone: document.getElementById("p-tel"),
    contato: document.getElementById("p-contato"),
    endereco: document.getElementById("p-end"),
    info_saude: document.getElementById("p-saude"),
    condicoes_preexistentes: document.getElementById("p-cond"),
    medicamentos: document.getElementById("p-med"),
    observacoes: document.getElementById("p-obs"),
    ativo: document.getElementById("p-ativo"),
  };

  function abrirForm(part) {
    document.getElementById("p-error").textContent = "";
    document.getElementById("form-titulo").textContent = part ? "Editar participante" : "Cadastrar participante";
    F.id.value = part ? part.id : "";
    F.nome_completo.value = part ? part.nome_completo || "" : "";
    F.data_nascimento.value = part ? (part.data_nascimento || "") : "";
    F.sexo.value = part ? (part.sexo || "") : "";
    F.telefone.value = part ? (part.telefone || "") : "";
    F.contato.value = part ? (part.contato || "") : "";
    F.endereco.value = part ? (part.endereco || "") : "";
    F.info_saude.value = part ? (part.info_saude || "") : "";
    F.condicoes_preexistentes.value = part ? (part.condicoes_preexistentes || "") : "";
    F.medicamentos.value = part ? (part.medicamentos || "") : "";
    F.observacoes.value = part ? (part.observacoes || "") : "";
    F.ativo.checked = part ? !!part.ativo : true;
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    F.nome_completo.focus();
  }

  function payload() {
    return {
      nome_completo: F.nome_completo.value.trim(),
      data_nascimento: F.data_nascimento.value || null,
      sexo: F.sexo.value || null,
      telefone: F.telefone.value.trim() || null,
      contato: F.contato.value.trim() || null,
      endereco: F.endereco.value.trim() || null,
      info_saude: F.info_saude.value.trim() || null,
      condicoes_preexistentes: F.condicoes_preexistentes.value.trim() || null,
      medicamentos: F.medicamentos.value.trim() || null,
      observacoes: F.observacoes.value.trim() || null,
      ativo: F.ativo.checked ? 1 : 0,
    };
  }

  const btnNovo = document.getElementById("btn-novo");
  btnNovo.innerHTML = `${icon("plus")} Novo participante`;
  btnNovo.addEventListener("click", () => abrirForm(null));
  document.getElementById("btn-cancelar").addEventListener("click", () => { formCard.hidden = true; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("p-error");
    err.textContent = "";
    const id = F.id.value;
    const btn = e.submitter; btn.disabled = true;
    try {
      if (id) {
        await apiJson(`/api/participantes/${id}`, { method: "PATCH", body: JSON.stringify(payload()) });
        window.VA.toast("Participante atualizado.", "success");
      } else {
        await apiJson("/api/participantes", { method: "POST", body: JSON.stringify(payload()) });
        window.VA.toast("Participante cadastrado.", "success");
      }
      formCard.hidden = true;
      carregar();
    } catch (ex) {
      err.textContent = ex.message || "Erro ao salvar.";
    } finally {
      btn.disabled = false;
    }
  });

  async function excluir(id, nome) {
    if (!confirm(`Excluir o participante "${nome}"?\n\nTodas as avaliações dele também serão removidas. Esta ação não pode ser desfeita.`)) return;
    try {
      await apiJson(`/api/participantes/${id}`, { method: "DELETE" });
      window.VA.toast("Participante excluído.", "success");
      carregar();
    } catch (ex) { window.VA.toast(ex.message || "Erro ao excluir.", "error"); }
  }

  function render(participantes) {
    if (!participantes.length) {
      listaEl.innerHTML = `<div class="empty card">Nenhum participante encontrado.</div>`;
      return;
    }
    const rows = participantes.map((p) => {
      const idade = calcIdade(p.data_nascimento);
      const acesso = p.acesso_username
        ? `<span class="tag">${escapeHtml(p.acesso_username)}</span>`
        : `<button class="btn btn-outline btn-sm" data-acesso="${p.id}">Criar acesso</button>`;
      return `<tr>
        <td><a href="admin-participante.html?id=${p.id}"><strong>${escapeHtml(p.nome_completo)}</strong></a>
            ${p.ativo ? "" : '<span class="badge badge-neutral">inativo</span>'}</td>
        <td>${idade != null ? idade + " anos" : "—"}</td>
        <td>${escapeHtml(p.sexo || "—")}</td>
        <td>${p.total_avaliacoes || 0}</td>
        <td>${fmtDate(p.ultima_avaliacao)}</td>
        <td>${acesso}</td>
        <td><div class="actions">
          <a class="btn btn-outline btn-sm" href="admin-participante.html?id=${p.id}">Abrir</a>
          <button class="btn btn-ghost btn-sm" data-edit="${p.id}">${icon("edit")} Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${p.id}" aria-label="Excluir">${icon("trash")}</button>
        </div></td>
      </tr>`;
    }).join("");
    listaEl.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Idade</th><th>Sexo</th><th>Avaliações</th><th>Última</th><th>Acesso</th><th>Ações</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;

    listaEl.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      const r = await apiJson(`/api/participantes/${b.dataset.edit}`);
      abrirForm(r.participante);
    }));
    listaEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const p = participantes.find((x) => String(x.id) === b.dataset.del);
      excluir(b.dataset.del, p ? p.nome_completo : "");
    }));
    listaEl.querySelectorAll("[data-acesso]").forEach((b) => b.addEventListener("click", () => criarAcesso(b.dataset.acesso)));
  }

  async function criarAcesso(id) {
    if (!confirm("Gerar um login de acesso para este participante?")) return;
    try {
      const r = await apiJson(`/api/participantes/${id}/acesso`, { method: "POST" });
      mostrarCredenciais(r.username, r.senhaTemporaria);
      carregar();
    } catch (ex) { window.VA.toast(ex.message || "Erro ao criar acesso.", "error"); }
  }

  function mostrarCredenciais(username, senha) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Acesso criado">
      <h2>Acesso criado</h2>
      <p>Anote e repasse ao participante. <strong>A senha só aparece agora.</strong></p>
      <p><strong>Usuário:</strong></p>
      <div class="otp-box">${escapeHtml(username)}</div>
      <p style="margin-top:.8rem"><strong>Senha temporária:</strong></p>
      <div class="otp-box">${escapeHtml(senha)}</div>
      <p class="hint">O participante deverá trocar a senha no primeiro acesso.</p>
      <button class="btn btn-primary btn-block" id="fechar-modal">Entendi</button>
    </div>`;
    document.body.appendChild(back);
    back.querySelector("#fechar-modal").addEventListener("click", () => back.remove());
  }

  async function carregar() {
    const busca = buscaEl.value.trim();
    const q = busca ? `?busca=${encodeURIComponent(busca)}` : "";
    try {
      const r = await apiJson(`/api/participantes${q}`);
      render(r.participantes || []);
    } catch (e) {
      listaEl.innerHTML = `<div class="empty card">Erro ao carregar participantes.</div>`;
    }
  }

  buscaEl.addEventListener("input", () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(carregar, 300);
  });

  boot({ admin: true }).then(carregar).catch(() => {});
}());
