/* Gestão de usuários: aprovar, papel, desativar, excluir e OTP de reset. */
(function () {
  const { boot, apiJson, escapeHtml, fmtDate, icon, toast } = window.VA;
  let me = null;

  const STATUS_BADGE = {
    active: '<span class="badge badge-ok">ativo</span>',
    pending: '<span class="badge badge-warn">pendente</span>',
    disabled: '<span class="badge badge-neutral">desativado</span>',
  };

  async function loadResets() {
    const card = document.getElementById("resets-card");
    const el = document.getElementById("resets");
    try {
      const r = await apiJson("/api/admin/password-resets?status=pending");
      const reqs = r.requests || [];
      if (!reqs.length) { card.hidden = true; return; }
      card.hidden = false;
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Usuário</th><th>Nome</th><th>Pedido em</th><th>Ações</th></tr></thead>
        <tbody>${reqs.map((q) => `<tr>
          <td>${escapeHtml(q.username)}</td>
          <td>${escapeHtml(q.display_name || "—")}</td>
          <td>${fmtDate(q.created_at)}</td>
          <td><div class="actions">
            <button class="btn btn-primary btn-sm" data-otp="${q.id}">Gerar senha temporária</button>
            <button class="btn btn-ghost btn-sm" data-rej="${q.id}">Rejeitar</button>
          </div></td></tr>`).join("")}</tbody></table></div>`;
      el.querySelectorAll("[data-otp]").forEach((b) => b.addEventListener("click", async () => {
        try {
          const res = await apiJson(`/api/admin/password-resets/${b.dataset.otp}/generate-otp`, { method: "POST" });
          alert(`Senha temporária gerada:\n\n${res.otp}\n\nRepasse ao usuário. Ele deverá trocá-la ao entrar.`);
          loadResets();
        } catch (ex) { toast(ex.message || "Erro.", "error"); }
      }));
      el.querySelectorAll("[data-rej]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Rejeitar este pedido?")) return;
        try { await apiJson(`/api/admin/password-resets/${b.dataset.rej}/reject`, { method: "POST" }); loadResets(); }
        catch (ex) { toast(ex.message || "Erro.", "error"); }
      }));
    } catch (e) { card.hidden = true; }
  }

  async function loadUsers() {
    const el = document.getElementById("usuarios");
    const r = await apiJson("/api/admin/users");
    const users = r.users || [];
    const rows = users.map((u) => {
      const isMe = me && u.id === me.id;
      const acoes = [];
      if (u.status === "pending") acoes.push(`<button class="btn btn-primary btn-sm" data-approve="${u.id}">${icon("check")} Aprovar</button>`);
      acoes.push(`<button class="btn btn-ghost btn-sm" data-role="${u.id}" data-current="${u.role}">${u.role === "admin" ? "Tornar participante" : "Tornar admin"}</button>`);
      if (!isMe && u.status !== "disabled") acoes.push(`<button class="btn btn-ghost btn-sm" data-disable="${u.id}">Desativar</button>`);
      if (!isMe) acoes.push(`<button class="btn btn-danger btn-sm" data-del="${u.id}" aria-label="Excluir">${icon("trash")}</button>`);
      return `<tr>
        <td><strong>${escapeHtml(u.username)}</strong>${isMe ? ' <span class="tag">você</span>' : ""}</td>
        <td>${escapeHtml(u.display_name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${u.role === "admin" ? "Administrador" : "Participante"}</td>
        <td>${STATUS_BADGE[u.status] || u.status}${u.must_change_password ? ' <span class="badge badge-warn">trocar senha</span>' : ""}</td>
        <td><div class="actions">${acoes.join("")}</div></td>
      </tr>`;
    }).join("");
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Usuário</th><th>Nome</th><th>Email</th><th>Papel</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;

    el.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => act(`/api/admin/users/${b.dataset.approve}/approve`, "Cadastro aprovado.")));
    el.querySelectorAll("[data-disable]").forEach((b) => b.addEventListener("click", () => {
      if (confirm("Desativar este usuário? Ele não poderá mais entrar.")) act(`/api/admin/users/${b.dataset.disable}/disable`, "Usuário desativado.");
    }));
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (confirm("Excluir este usuário definitivamente?")) act(`/api/admin/users/${b.dataset.del}`, "Usuário excluído.", "DELETE");
    }));
    el.querySelectorAll("[data-role]").forEach((b) => b.addEventListener("click", async () => {
      const novo = b.dataset.current === "admin" ? "participante" : "admin";
      try {
        await apiJson(`/api/admin/users/${b.dataset.role}`, { method: "PATCH", body: JSON.stringify({ role: novo }) });
        toast("Papel atualizado.", "success");
        loadUsers();
      } catch (ex) { toast(ex.message || "Erro.", "error"); }
    }));
  }

  async function act(url, msg, method = "POST") {
    try {
      await apiJson(url, { method });
      toast(msg, "success");
      loadUsers();
    } catch (ex) { toast(ex.message || "Erro.", "error"); }
  }

  boot({ admin: true }).then((u) => { me = u; return Promise.all([loadResets(), loadUsers()]); }).catch(() => {});
}());
