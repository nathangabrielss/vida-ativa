/* Biblioteca de vídeos: filtro por categoria + player embutido (sem sair do app).
   Leitura para todos; gestão (add/editar/excluir) para admin. */
(function () {
  const { boot, apiJson, escapeHtml, icon, toast } = window.VA;
  let isAdmin = false;
  let itens = [];
  let categoriaAtiva = "__all__";

  const formCard = document.getElementById("form-card");
  const form = document.getElementById("form-video");
  const btnNovo = document.getElementById("btn-novo");
  const V = {
    id: document.getElementById("v-id"),
    titulo: document.getElementById("v-titulo"),
    categoria: document.getElementById("v-cat"),
    url: document.getElementById("v-url"),
    descricao: document.getElementById("v-desc"),
  };

  // Extrai o ID de qualquer URL do YouTube (watch, youtu.be, embed, shorts).
  function youtubeId(url) {
    const s = String(url || "");
    const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function abrirForm(item) {
    document.getElementById("v-error").textContent = "";
    document.getElementById("form-titulo").textContent = item ? "Editar vídeo" : "Adicionar vídeo";
    V.id.value = item ? item.id : "";
    V.titulo.value = item ? item.titulo : "";
    V.categoria.value = item ? item.categoria : "";
    V.url.value = item ? item.url : "";
    V.descricao.value = item ? (item.descricao || "") : "";
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    V.titulo.focus();
  }

  function playCard(card, id) {
    const thumb = card.querySelector(".thumb");
    thumb.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
      title="Vídeo" allow="accelerated-motion; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    thumb.style.cursor = "default";
  }

  function cardHtml(item) {
    const id = youtubeId(item.url);
    const thumb = id
      ? `<div class="thumb" data-yt="${id}">
           <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
           <span class="play"><span>${icon("play")}</span></span>
         </div>`
      : `<div class="thumb" style="cursor:default;display:grid;place-items:center;color:#cfe3db">${icon("film")}</div>`;
    const fallback = id ? "" : `<a class="btn btn-outline btn-sm" href="${encodeURI(item.url)}" target="_blank" rel="noopener">Abrir link</a>`;
    const admin = isAdmin
      ? `<div class="admin-actions">
           <button class="btn btn-ghost btn-sm" data-edit="${item.id}">${icon("edit")} Editar</button>
           <button class="btn btn-danger btn-sm" data-del="${item.id}">${icon("trash")}</button>
         </div>`
      : "";
    return `<article class="card video-card">
      ${thumb}
      <div class="video-body">
        <span class="tag cat">${escapeHtml(item.categoria)}</span>
        <h3>${escapeHtml(item.titulo)}</h3>
        ${item.descricao ? `<p class="muted small" style="margin:0">${escapeHtml(item.descricao)}</p>` : ""}
        ${fallback}
        ${admin}
      </div>
    </article>`;
  }

  function renderChips() {
    const cats = [...new Set(itens.map((i) => i.categoria))].sort((a, b) => a.localeCompare(b));
    const box = document.getElementById("filtros");
    const all = `<button class="chip ${categoriaAtiva === "__all__" ? "active" : ""}" data-cat="__all__">Todos</button>`;
    box.innerHTML = all + cats.map((c) => `<button class="chip ${categoriaAtiva === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
    box.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { categoriaAtiva = b.dataset.cat; renderChips(); renderGrid(); }));
    box.hidden = itens.length === 0;
  }

  function renderGrid() {
    const el = document.getElementById("conteudo-lista");
    const lista = categoriaAtiva === "__all__" ? itens : itens.filter((i) => i.categoria === categoriaAtiva);
    if (!lista.length) { el.innerHTML = `<div class="empty card">Nenhum vídeo nesta categoria.</div>`; return; }
    el.innerHTML = `<div class="video-grid">${lista.map(cardHtml).join("")}</div>`;
    el.querySelectorAll(".thumb[data-yt]").forEach((t) => t.addEventListener("click", () => playCard(t.closest(".video-card"), t.dataset.yt)));
    if (isAdmin) {
      el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => abrirForm(itens.find((x) => String(x.id) === b.dataset.edit))));
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Excluir este vídeo da biblioteca?")) return;
        try { await apiJson(`/api/biblioteca/${b.dataset.del}`, { method: "DELETE" }); toast("Vídeo excluído.", "success"); load(); }
        catch (ex) { toast(ex.message || "Erro.", "error"); }
      }));
    }
  }

  if (form) {
    btnNovo.innerHTML = `${icon("plus")} Adicionar vídeo`;
    btnNovo.addEventListener("click", () => abrirForm(null));
    document.getElementById("btn-cancelar").addEventListener("click", () => { formCard.hidden = true; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("v-error");
      err.textContent = "";
      const btn = e.submitter; btn.disabled = true;
      const body = JSON.stringify({
        titulo: V.titulo.value.trim(), categoria: V.categoria.value.trim(),
        url: V.url.value.trim(), descricao: V.descricao.value.trim() || null,
      });
      try {
        if (V.id.value) await apiJson(`/api/biblioteca/${V.id.value}`, { method: "PATCH", body });
        else await apiJson("/api/biblioteca", { method: "POST", body });
        toast("Vídeo salvo.", "success");
        formCard.hidden = true;
        load();
      } catch (ex) { err.textContent = ex.message || "Erro ao salvar."; } finally { btn.disabled = false; }
    });
  }

  async function load() {
    try {
      const r = await apiJson("/api/biblioteca");
      itens = r.itens || [];
      if (categoriaAtiva !== "__all__" && !itens.some((i) => i.categoria === categoriaAtiva)) categoriaAtiva = "__all__";
      renderChips();
      renderGrid();
    } catch (e) {
      document.getElementById("conteudo-lista").innerHTML = `<div class="empty card">Erro ao carregar a biblioteca.</div>`;
    }
  }

  boot({ admin: false }).then((u) => {
    isAdmin = u.role === "admin";
    if (isAdmin) btnNovo.hidden = false;
    load();
  }).catch(() => {});
}());
