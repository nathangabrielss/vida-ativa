/* Troca de senha (própria) — usada também no fluxo obrigatório (?forced=1). */
(function () {
  const { api, apiJson, attachPasswordMeter, toast } = window.VA;
  const forced = new URLSearchParams(location.search).get("forced") === "1";
  let user = null;

  attachPasswordMeter(document.getElementById("nova"), document.getElementById("pw-meter"));

  apiJson("/api/me").then((u) => {
    user = u;
    if (u.mustChangePassword || forced) {
      document.getElementById("forced-note").hidden = false;
      document.getElementById("voltar").hidden = true;
    }
  }).catch(() => location.replace("/login"));

  document.getElementById("voltar").addEventListener("click", (e) => {
    e.preventDefault();
    if (history.length > 1) history.back();
    else location.href = user && user.role === "admin" ? "admin.html" : "inicio.html";
  });
  document.getElementById("sair").addEventListener("click", async (e) => {
    e.preventDefault();
    try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
    location.href = "/login";
  });

  document.getElementById("form-pass").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("pass-error");
    err.textContent = "";
    const btn = e.submitter; btn.disabled = true;
    try {
      await apiJson("/api/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: document.getElementById("cur").value,
          newPassword: document.getElementById("nova").value,
          confirmPassword: document.getElementById("nova2").value,
        }),
      });
      toast("Senha atualizada com sucesso.", "success");
      const u = await apiJson("/api/me");
      setTimeout(() => { location.href = u.role === "admin" ? "admin.html" : "inicio.html"; }, 700);
    } catch (ex) {
      err.textContent = ex.message || "Não foi possível alterar a senha.";
      btn.disabled = false;
    }
  });
}());
