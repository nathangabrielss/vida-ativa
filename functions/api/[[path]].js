import {
  buildUsername, generateOtp, isStrongPassword, isValidEmail, isValidName,
  PASSWORD_POLICY_MESSAGE, signSession, verifyPassword, verifySession,
} from "../_lib/auth.js";
import {
  clearCookie, getCookie, json, readJson, requireAjax, setCookie,
} from "../_lib/http.js";
import { avaliar } from "../_lib/imc.js";
import {
  countAdmins, countUsers, createAvaliacao, createBiblioteca, createParticipante,
  createPasswordResetRequest, createUser, dashboard, deleteAvaliacao, deleteBiblioteca,
  deleteParticipante, emailExists, ensureSchema, ensureSeed, exportData, getAvaliacao,
  getParticipante, getParticipanteByUser, getUser, getUserByUsername, linkUserToParticipante,
  listAvaliacoes, listBiblioteca, listParticipantes, listPasswordResetRequests, listUsers,
  resolvePasswordResetRequest, resumo, updateBiblioteca, updateParticipante,
  updateUserPassword, usernameExists,
} from "../_lib/db.js";

const SESSION_COOKIE = "va_session";
const SESSION_TTL = 60 * 60 * 6; // 6h de janela absoluta

function secret(env) {
  return env.SESSION_SECRET || env.FLASK_SECRET_KEY || "change-me";
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role || "participante",
    mustChangePassword: !!Number(u.must_change_password || 0),
  };
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v) {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

async function currentUser(env, request) {
  const payload = await verifySession(secret(env), getCookie(request, SESSION_COOKIE));
  if (!payload) return null;
  const user = await getUser(env, payload.uid);
  if (!user || user.status !== "active") return null;
  return user;
}

async function requireUser(env, request, { admin = false, allowForced = false } = {}) {
  const user = await currentUser(env, request);
  if (!user) return { error: json({ error: "unauthorized" }, 401) };
  if (admin && (user.role || "participante") !== "admin") return { error: json({ error: "forbidden" }, 403) };
  if (!allowForced && Number(user.must_change_password || 0)) {
    return { error: json({ error: "must_change_password" }, 403) };
  }
  return { user };
}

function notFound() { return json({ error: "not_found" }, 404); }

// ---------- auth ----------

async function login(env, request) {
  const payload = await readJson(request) || {};
  const username = String(payload.username || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!username || !password) return json({ error: "missing_credentials" }, 400);
  const user = await getUserByUsername(env, username);
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  if (user.status === "pending") return json({ error: "account_pending", detail: "Seu cadastro ainda nao foi aprovado pelo administrador." }, 403);
  if (user.status === "disabled") return json({ error: "account_disabled", detail: "Sua conta foi desativada. Procure o administrador." }, 403);
  const token = await signSession(secret(env), { uid: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
  return json({ user: publicUser(user) }, 200, {
    "set-cookie": setCookie(SESSION_COOKIE, token, payload.remember ? SESSION_TTL : null),
  });
}

async function signup(env, request) {
  const payload = await readJson(request) || {};
  const nome = String(payload.nome || "").trim();
  const sobrenome = String(payload.sobrenome || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const senha = String(payload.senha || "");
  const confirm = String(payload.confirmarSenha || "");
  if (!nome || !sobrenome || !isValidName(nome) || !isValidName(sobrenome)) return json({ error: "invalid_name", detail: "Informe nome e sobrenome validos." }, 400);
  if (!email || !isValidEmail(email)) return json({ error: "invalid_email", detail: "Informe um email valido." }, 400);
  if (await emailExists(env, email)) return json({ error: "email_in_use", detail: "Este email ja esta cadastrado." }, 409);
  if (!senha || senha !== confirm) return json({ error: "password_mismatch", detail: "As senhas nao conferem." }, 400);
  if (!isStrongPassword(senha)) return json({ error: "weak_password", detail: PASSWORD_POLICY_MESSAGE }, 400);
  const username = buildUsername(nome, sobrenome);
  if (!username) return json({ error: "invalid_name", detail: "Nao foi possivel gerar um usuario." }, 400);
  if (await usernameExists(env, username)) return json({ error: "username_taken", detail: "Esse usuario ja existe. Use outro sobrenome." }, 409);
  const firstAdmin = (await countUsers(env)) === 0;
  await createUser(env, {
    username, password: senha, displayName: `${nome} ${sobrenome}`, nome, sobrenome, email,
    role: firstAdmin ? "admin" : "participante", status: firstAdmin ? "active" : "pending",
  });
  return json({
    ok: true, status: firstAdmin ? "active" : "pending", username,
    message: firstAdmin ? "Conta de administrador criada. Voce ja pode entrar."
      : "Cadastro recebido. Aguarde a aprovacao do administrador.",
  });
}

async function genUsernameParticipante(env, nomeCompleto) {
  const partes = String(nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const base = buildUsername(partes[0], partes.length > 1 ? partes[partes.length - 1] : partes[0]);
  if (!base) return "";
  let candidato = base;
  let i = 1;
  while (await usernameExists(env, candidato)) { i += 1; candidato = `${base}${i}`; }
  return candidato;
}

async function adminUsersRoute(env, request, user, path) {
  const url = new URL(request.url);
  const method = request.method;
  let m;
  if (path === "admin/users" && method === "GET") {
    const status = url.searchParams.get("status") || null;
    if (status && !["pending", "active", "disabled"].includes(status)) return json({ error: "invalid_status" }, 400);
    return json({ users: await listUsers(env, status) });
  }
  if ((m = path.match(/^admin\/users\/(\d+)\/approve$/)) && method === "POST") {
    const id = Number(m[1]);
    if (!(await getUser(env, id))) return notFound();
    await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^admin\/users\/(\d+)\/disable$/)) && method === "POST") {
    const id = Number(m[1]);
    if (id === user.id) return json({ error: "forbidden", detail: "Voce nao pode desativar a si mesmo." }, 400);
    const u = await getUser(env, id);
    if (!u) return notFound();
    if (u.role === "admin" && (await countAdmins(env, id)) === 0) return json({ error: "last_admin", detail: "Nao ha outro administrador ativo." }, 400);
    await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^admin\/users\/(\d+)$/)) && method === "PATCH") {
    const id = Number(m[1]);
    const u = await getUser(env, id);
    if (!u) return notFound();
    const payload = await readJson(request) || {};
    const displayName = "displayName" in payload ? String(payload.displayName || "").trim() : null;
    const email = "email" in payload ? String(payload.email || "").trim().toLowerCase() : null;
    const role = "role" in payload ? String(payload.role || "").trim() : null;
    if ("displayName" in payload && !displayName) return json({ error: "invalid_display_name" }, 400);
    if (email && !isValidEmail(email)) return json({ error: "invalid_email" }, 400);
    if (email && await emailExists(env, email, id)) return json({ error: "email_in_use", detail: "Email ja em uso." }, 409);
    if (role && !["admin", "participante"].includes(role)) return json({ error: "invalid_role" }, 400);
    if (role === "participante" && u.role === "admin" && (await countAdmins(env, id)) === 0) {
      return json({ error: "last_admin", detail: "Voce e o ultimo administrador ativo." }, 400);
    }
    const sets = [];
    const vals = [];
    if ("displayName" in payload) { sets.push("display_name = ?"); vals.push(displayName); }
    if ("email" in payload) { sets.push("email = ?"); vals.push(email || null); }
    if (role) { sets.push("role = ?"); vals.push(role); }
    if (sets.length) await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^admin\/users\/(\d+)$/)) && method === "DELETE") {
    const id = Number(m[1]);
    if (id === user.id) return json({ error: "forbidden", detail: "Voce nao pode excluir a si mesmo." }, 400);
    const u = await getUser(env, id);
    if (!u) return notFound();
    if (u.role === "admin" && (await countAdmins(env, id)) === 0) return json({ error: "last_admin", detail: "Nao ha outro administrador ativo." }, 400);
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (path === "admin/password-resets" && method === "GET") {
    return json({ requests: await listPasswordResetRequests(env, url.searchParams.get("status") || null) });
  }
  if ((m = path.match(/^admin\/password-resets\/(\d+)\/generate-otp$/)) && method === "POST") {
    const row = await resolvePasswordResetRequest(env, Number(m[1]), user.id, "fulfilled");
    if (!row) return json({ error: "not_found", detail: "Solicitacao inexistente ou ja resolvida." }, 404);
    const otp = generateOtp();
    await updateUserPassword(env, row.user_id, otp);
    await env.DB.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").bind(row.user_id).run();
    return json({ ok: true, userId: row.user_id, otp, warning: "Repasse a senha temporaria por canal seguro. Ela so aparece agora." });
  }
  if ((m = path.match(/^admin\/password-resets\/(\d+)\/reject$/)) && method === "POST") {
    const row = await resolvePasswordResetRequest(env, Number(m[1]), user.id, "rejected");
    if (!row) return json({ error: "not_found", detail: "Solicitacao inexistente ou ja resolvida." }, 404);
    return json({ ok: true });
  }
  if (path === "admin/resumo" && method === "GET") return json(await resumo(env));
  if (path === "admin/dashboard" && method === "GET") return json(await dashboard(env));
  if (path === "admin/export-data" && method === "GET") return json(await exportData(env));
  return notFound();
}

async function participanteBody(request) {
  return await readJson(request) || {};
}

async function route(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = request.method;
  let m;

  await ensureSchema(env);
  await ensureSeed(env);

  if (!requireAjax(request)) return json({ error: "csrf_header_missing" }, 403);

  // ---- rotas públicas ----
  if (path === "login" && method === "POST") return login(env, request);
  if (path === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
  if (path === "signup" && method === "POST") return signup(env, request);
  if (path === "check-username" && method === "GET") {
    const nome = url.searchParams.get("nome") || "";
    const sobrenome = url.searchParams.get("sobrenome") || "";
    const username = buildUsername(nome, sobrenome);
    if (!nome || !sobrenome) return json({ username: "", available: false, reason: "missing" });
    if (!username) return json({ username: "", available: false, reason: "invalid" });
    return json({ username, available: !(await usernameExists(env, username)) });
  }
  if (path === "password-reset/request" && method === "POST") {
    const payload = await readJson(request) || {};
    const username = String(payload.username || "").trim().toLowerCase();
    if (!username) return json({ error: "missing_fields", detail: "Informe seu usuario." }, 400);
    const user = await getUserByUsername(env, username);
    if (user) await createPasswordResetRequest(env, user.id);
    return json({ ok: true, message: "Se o usuario existir, o pedido foi registrado. Procure o administrador." });
  }

  // ---- autenticado ----
  const allowForced = ["me", "change-password"].includes(path);
  const authed = await requireUser(env, request, { allowForced });
  if (authed.error) return authed.error;
  const user = authed.user;

  if (path === "me" && method === "GET") return json(publicUser(user));

  if (path === "change-password" && method === "POST") {
    const payload = await readJson(request) || {};
    const current = String(payload.currentPassword || "");
    const next = String(payload.newPassword || "");
    const confirm = String(payload.confirmPassword || "");
    if (!next || !confirm) return json({ error: "missing_fields", detail: "Preencha todos os campos." }, 400);
    if (next !== confirm) return json({ error: "password_mismatch", detail: "As senhas nao conferem." }, 400);
    if (!isStrongPassword(next)) return json({ error: "weak_password", detail: PASSWORD_POLICY_MESSAGE }, 400);
    if (!current || !(await verifyPassword(user.password_hash, current))) return json({ error: "wrong_password", detail: "Senha atual incorreta." }, 401);
    await updateUserPassword(env, user.id, next);
    if (Number(user.must_change_password || 0)) {
      await env.DB.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").bind(user.id).run();
    }
    return json({ ok: true });
  }

  if (path === "me/participante" && method === "GET") {
    const p = await getParticipanteByUser(env, user.id);
    if (!p) return json({ participante: null, avaliacoes: [] });
    return json({ participante: p, avaliacoes: await listAvaliacoes(env, p.id) });
  }

  if (path === "biblioteca" && method === "GET") return json({ itens: await listBiblioteca(env) });

  // ---- somente admin daqui em diante ----
  const isAdmin = (user.role || "participante") === "admin";
  const needsAdmin = () => json({ error: "forbidden" }, 403);

  if (path === "participantes" && method === "GET") {
    if (!isAdmin) return needsAdmin();
    const busca = url.searchParams.get("busca");
    const incluir = url.searchParams.get("inativos") !== "0";
    return json({ participantes: await listParticipantes(env, { incluirInativos: incluir, busca }) });
  }
  if (path === "participantes" && method === "POST") {
    if (!isAdmin) return needsAdmin();
    const payload = await participanteBody(request);
    if (!String(payload.nome_completo || "").trim()) return json({ error: "missing_fields", detail: "Nome completo e obrigatorio." }, 400);
    const id = await createParticipante(env, payload, user.id);
    return json({ ok: true, id });
  }
  if ((m = path.match(/^participantes\/(\d+)$/)) && method === "GET") {
    if (!isAdmin) return needsAdmin();
    const p = await getParticipante(env, Number(m[1]));
    if (!p) return notFound();
    return json({ participante: p, avaliacoes: await listAvaliacoes(env, p.id) });
  }
  if ((m = path.match(/^participantes\/(\d+)$/)) && method === "PATCH") {
    if (!isAdmin) return needsAdmin();
    if (!(await getParticipante(env, Number(m[1])))) return notFound();
    await updateParticipante(env, Number(m[1]), await participanteBody(request));
    return json({ ok: true });
  }
  if ((m = path.match(/^participantes\/(\d+)$/)) && method === "DELETE") {
    if (!isAdmin) return needsAdmin();
    if (!(await getParticipante(env, Number(m[1])))) return notFound();
    await deleteParticipante(env, Number(m[1]));
    return json({ ok: true });
  }
  if ((m = path.match(/^participantes\/(\d+)\/acesso$/)) && method === "POST") {
    if (!isAdmin) return needsAdmin();
    const p = await getParticipante(env, Number(m[1]));
    if (!p) return notFound();
    if (p.user_id) return json({ error: "already_linked", detail: "Este participante ja possui acesso." }, 400);
    const username = await genUsernameParticipante(env, p.nome_completo);
    if (!username) return json({ error: "invalid_name", detail: "Nome do participante nao permite gerar usuario." }, 400);
    const otp = generateOtp();
    const uid = await createUser(env, { username, password: otp, displayName: p.nome_completo, role: "participante", status: "active", mustChangePassword: true });
    await linkUserToParticipante(env, Number(m[1]), uid);
    return json({ ok: true, username, senhaTemporaria: otp, warning: "Anote a senha temporaria: ela so sera exibida agora." });
  }
  if ((m = path.match(/^participantes\/(\d+)\/avaliacoes$/)) && method === "POST") {
    if (!isAdmin) return needsAdmin();
    const p = await getParticipante(env, Number(m[1]));
    if (!p) return notFound();
    const payload = await participanteBody(request);
    const dataAv = String(payload.data_avaliacao || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAv)) return json({ error: "invalid_date", detail: "Informe a data da avaliacao." }, 400);
    const peso = num(payload.peso);
    const altura = num(payload.altura);
    const { imc, classificacao } = avaliar(peso, altura, p.data_nascimento, dataAv);
    const id = await createAvaliacao(env, Number(m[1]), {
      data_avaliacao: dataAv, peso, altura, imc, imc_classificacao: classificacao,
      circ_abdominal: num(payload.circ_abdominal), pa_sistolica: int(payload.pa_sistolica),
      pa_diastolica: int(payload.pa_diastolica), freq_cardiaca: int(payload.freq_cardiaca),
      meta: payload.meta || null, observacoes: payload.observacoes || null,
    }, user.id);
    return json({ ok: true, id, imc, imcClassificacao: classificacao });
  }
  if ((m = path.match(/^avaliacoes\/(\d+)$/)) && method === "DELETE") {
    if (!isAdmin) return needsAdmin();
    if (!(await getAvaliacao(env, Number(m[1])))) return notFound();
    await deleteAvaliacao(env, Number(m[1]));
    return json({ ok: true });
  }

  if (path === "biblioteca" && method === "POST") {
    if (!isAdmin) return needsAdmin();
    const payload = await participanteBody(request);
    if (!String(payload.titulo || "").trim() || !String(payload.url || "").trim()) return json({ error: "missing_fields", detail: "Titulo e link sao obrigatorios." }, 400);
    const id = await createBiblioteca(env, payload, user.id);
    return json({ ok: true, id });
  }
  if ((m = path.match(/^biblioteca\/(\d+)$/)) && method === "PATCH") {
    if (!isAdmin) return needsAdmin();
    await updateBiblioteca(env, Number(m[1]), await participanteBody(request));
    return json({ ok: true });
  }
  if ((m = path.match(/^biblioteca\/(\d+)$/)) && method === "DELETE") {
    if (!isAdmin) return needsAdmin();
    await deleteBiblioteca(env, Number(m[1]));
    return json({ ok: true });
  }

  if (path.startsWith("admin/")) {
    if (!isAdmin) return needsAdmin();
    return adminUsersRoute(env, request, user, path);
  }

  return notFound();
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return new Response(null, { status: 204 });
    return await route(context);
  } catch (e) {
    return json({ error: "internal_error", detail: e.message || String(e) }, 500);
  }
}
