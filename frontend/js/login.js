/* Login + criar conta + recuperar senha (painéis alternáveis) + medidor de senha. */
(function () {
  const { apiJson, attachPasswordMeter, toast } = window.VA;
  const panels = {
    login: document.getElementById("form-login"),
    signup: document.getElementById("form-signup"),
    reset: document.getElementById("form-reset"),
  };

  // medidor de senha no cadastro
  attachPasswordMeter(document.getElementById("su-senha"), document.getElementById("su-pw-meter"));

  function show(name) {
    Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== name; });
    Object.values(panels).forEach((f) => f.querySelectorAll(".error-msg").forEach((e) => (e.textContent = "")));
    const first = panels[name].querySelector("input");
    if (first) first.focus();
  }

  document.body.addEventListener("click", (e) => {
    const a = e.target.closest("[data-panel]");
    if (!a) return;
    e.preventDefault();
    show(a.dataset.panel);
  });

  apiJson("/api/me").then((u) => {
    if (u.mustChangePassword) location.replace("alterar-senha.html?forced=1");
    else location.replace(u.role === "admin" ? "admin.html" : "inicio.html");
  }).catch(() => { /* segue no login */ });

  panels.login.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("login-error");
    err.textContent = "";
    const btn = e.submitter; btn.disabled = true;
    try {
      const u = await apiJson("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("login-user").value,
          password: document.getElementById("login-pass").value,
          remember: document.getElementById("login-remember").checked,
        }),
      });
      const user = u.user;
      location.href = user && user.mustChangePassword ? "alterar-senha.html?forced=1"
        : user.role === "admin" ? "admin.html" : "inicio.html";
    } catch (ex) {
      err.textContent = ex.message || "Não foi possível entrar.";
      btn.disabled = false;
    }
  });

  panels.signup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("signup-error");
    err.textContent = "";
    const btn = e.submitter; btn.disabled = true;
    try {
      const r = await apiJson("/api/signup", {
        method: "POST",
        body: JSON.stringify({
          nome: document.getElementById("su-nome").value,
          sobrenome: document.getElementById("su-sobrenome").value,
          email: document.getElementById("su-email").value,
          senha: document.getElementById("su-senha").value,
          confirmarSenha: document.getElementById("su-senha2").value,
        }),
      });
      toast(`${r.message} Seu usuário: ${r.username}`, "success");
      document.getElementById("login-user").value = r.username;
      show("login");
    } catch (ex) {
      err.textContent = ex.message || "Não foi possível cadastrar.";
    } finally {
      btn.disabled = false;
    }
  });

  panels.reset.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("reset-error");
    err.textContent = "";
    const btn = e.submitter; btn.disabled = true;
    try {
      const r = await apiJson("/api/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ username: document.getElementById("rs-user").value }),
      });
      toast(r.message, "success");
      show("login");
    } catch (ex) {
      err.textContent = ex.message || "Não foi possível solicitar.";
    } finally {
      btn.disabled = false;
    }
  });
}());
