import { hashPassword } from "./auth.js";
import { SCHEMA_STATEMENTS } from "./schema.js";
import { classificarImc, idadeEm } from "./imc.js";

let schemaReady = false;

export async function ensureSchema(env) {
  if (!env.DB) throw new Error("Binding D1 DB nao configurado.");
  if (schemaReady) return;
  for (const statement of SCHEMA_STATEMENTS) {
    await env.DB.prepare(statement).run();
  }
  schemaReady = true;
}

export async function ensureSeed(env) {
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
  if (Number(count?.c || 0) > 0) return;
  const username = (env.SEED_USERNAME || "").trim().toLowerCase();
  const password = env.SEED_PASSWORD || "";
  if (!username || !password) return;
  await createUser(env, { username, password, displayName: username, role: "admin", status: "active" });
}

// ---------- usuarios ----------

export async function createUser(env, input) {
  const pwHash = await hashPassword(input.password);
  const cur = await env.DB.prepare(
    `INSERT INTO users
       (username, password_hash, display_name, nome, sobrenome, cpf_hash, cpf_lookup, email, role, status, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.username,
    pwHash,
    input.displayName || input.username,
    input.nome || null,
    input.sobrenome || null,
    input.cpfHash || null,
    input.cpfLookup || null,
    input.email || null,
    input.role || "participante",
    input.status || "active",
    input.mustChangePassword ? 1 : 0,
  ).run();
  return cur.meta.last_row_id;
}

export async function countUsers(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
  return Number(row?.c || 0);
}

export async function firstSignupIsAdmin(env) {
  return (await countUsers(env)) === 0 && !env.SEED_USERNAME && !env.SEED_PASSWORD;
}

export async function getUser(env, id) {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function getUserByUsername(env, username) {
  return env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
}

export async function usernameExists(env, username) {
  const row = await env.DB.prepare("SELECT 1 AS ok FROM users WHERE username = ?").bind(username).first();
  return !!row;
}

export async function emailExists(env, email, excludeId = null) {
  const sql = excludeId
    ? "SELECT 1 AS ok FROM users WHERE LOWER(email) = LOWER(?) AND id != ?"
    : "SELECT 1 AS ok FROM users WHERE LOWER(email) = LOWER(?)";
  const stmt = env.DB.prepare(sql);
  const row = excludeId ? await stmt.bind(email, excludeId).first() : await stmt.bind(email).first();
  return !!row;
}

export async function listUsers(env, status = null) {
  const sql = `SELECT id, username, display_name, nome, sobrenome, email, role, status, must_change_password, created_at
                 FROM users ${status ? "WHERE status = ?" : ""}
                ORDER BY status='pending' DESC, created_at DESC`;
  const res = status ? await env.DB.prepare(sql).bind(status).all() : await env.DB.prepare(sql).all();
  return (res.results || []).map((u) => ({ ...u, must_change_password: Number(u.must_change_password || 0) }));
}

export async function countAdmins(env, excludeId = null) {
  const sql = excludeId
    ? "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active' AND id != ?"
    : "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active'";
  const row = excludeId ? await env.DB.prepare(sql).bind(excludeId).first() : await env.DB.prepare(sql).first();
  return Number(row?.c || 0);
}

export async function updateUserPassword(env, id, password) {
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), id).run();
}

export async function createPasswordResetRequest(env, userId) {
  const existing = await env.DB.prepare(
    "SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'",
  ).bind(userId).first();
  if (existing) return existing.id;
  const res = await env.DB.prepare(
    "INSERT INTO password_reset_requests (user_id, status) VALUES (?, 'pending')",
  ).bind(userId).run();
  return res.meta.last_row_id;
}

export async function listPasswordResetRequests(env, status = "pending") {
  const sql = `SELECT r.id, r.user_id, r.status, r.created_at, r.resolved_at, u.username, u.display_name
                 FROM password_reset_requests r JOIN users u ON u.id = r.user_id
                ${status ? "WHERE r.status = ?" : ""}
                ORDER BY r.created_at DESC`;
  const res = status ? await env.DB.prepare(sql).bind(status).all() : await env.DB.prepare(sql).all();
  return res.results || [];
}

export async function resolvePasswordResetRequest(env, requestId, adminId, status) {
  const row = await env.DB.prepare("SELECT * FROM password_reset_requests WHERE id = ?").bind(requestId).first();
  if (!row || row.status !== "pending") return null;
  await env.DB.prepare(
    "UPDATE password_reset_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?",
  ).bind(status, adminId, requestId).run();
  return row;
}

// ---------- participantes ----------

const PART_FIELDS = [
  "nome_completo", "data_nascimento", "sexo", "telefone", "endereco",
  "info_saude", "condicoes_preexistentes", "medicamentos", "contato", "observacoes",
];

export async function createParticipante(env, data, createdBy = null) {
  const nome = String(data.nome_completo || "").trim();
  const res = await env.DB.prepare(
    `INSERT INTO participantes
       (nome_completo, data_nascimento, sexo, telefone, endereco, info_saude,
        condicoes_preexistentes, medicamentos, contato, observacoes, ativo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    nome,
    data.data_nascimento || null, data.sexo || null, data.telefone || null,
    data.endereco || null, data.info_saude || null, data.condicoes_preexistentes || null,
    data.medicamentos || null, data.contato || null, data.observacoes || null,
    data.ativo === 0 || data.ativo === false ? 0 : 1, createdBy,
  ).run();
  return res.meta.last_row_id;
}

export async function getParticipante(env, id) {
  return env.DB.prepare("SELECT * FROM participantes WHERE id = ?").bind(id).first();
}

export async function getParticipanteByUser(env, userId) {
  return env.DB.prepare("SELECT * FROM participantes WHERE user_id = ? ORDER BY id LIMIT 1").bind(userId).first();
}

export async function listParticipantes(env, { incluirInativos = true, busca = null } = {}) {
  let sql = `
    SELECT p.*,
           (SELECT COUNT(*) FROM avaliacoes a WHERE a.participante_id = p.id) AS total_avaliacoes,
           (SELECT MAX(a.data_avaliacao) FROM avaliacoes a WHERE a.participante_id = p.id) AS ultima_avaliacao,
           u.username AS acesso_username
      FROM participantes p
      LEFT JOIN users u ON u.id = p.user_id`;
  const where = [];
  const params = [];
  if (!incluirInativos) where.push("p.ativo = 1");
  if (busca) { where.push("LOWER(p.nome_completo) LIKE ?"); params.push(`%${String(busca).trim().toLowerCase()}%`); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY p.nome_completo COLLATE NOCASE";
  const res = params.length ? await env.DB.prepare(sql).bind(...params).all() : await env.DB.prepare(sql).all();
  return res.results || [];
}

export async function updateParticipante(env, id, data) {
  const sets = [];
  const vals = [];
  for (const f of PART_FIELDS) {
    if (f in data) {
      sets.push(`${f} = ?`);
      const v = data[f];
      vals.push(f === "nome_completo" ? String(v || "").trim() : (v || null));
    }
  }
  if ("ativo" in data) { sets.push("ativo = ?"); vals.push(data.ativo ? 1 : 0); }
  if (!sets.length) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(id);
  await env.DB.prepare(`UPDATE participantes SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function linkUserToParticipante(env, participanteId, userId) {
  await env.DB.prepare("UPDATE participantes SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(userId, participanteId).run();
}

export async function deleteParticipante(env, id) {
  await env.DB.prepare("DELETE FROM participantes WHERE id = ?").bind(id).run();
}

// ---------- avaliacoes ----------

export async function createAvaliacao(env, participanteId, d, responsavelId = null) {
  const res = await env.DB.prepare(
    `INSERT INTO avaliacoes
       (participante_id, data_avaliacao, peso, altura, imc, imc_classificacao,
        circ_abdominal, pa_sistolica, pa_diastolica, freq_cardiaca, meta, observacoes, responsavel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    participanteId, d.data_avaliacao, d.peso ?? null, d.altura ?? null, d.imc ?? null,
    d.imc_classificacao ?? null, d.circ_abdominal ?? null, d.pa_sistolica ?? null,
    d.pa_diastolica ?? null, d.freq_cardiaca ?? null, d.meta ?? null, d.observacoes ?? null, responsavelId,
  ).run();
  return res.meta.last_row_id;
}

export async function listAvaliacoes(env, participanteId) {
  const res = await env.DB.prepare(
    `SELECT a.*, u.display_name AS responsavel_nome
       FROM avaliacoes a LEFT JOIN users u ON u.id = a.responsavel_id
      WHERE a.participante_id = ?
      ORDER BY a.data_avaliacao DESC, a.id DESC`,
  ).bind(participanteId).all();
  return res.results || [];
}

export async function getAvaliacao(env, id) {
  return env.DB.prepare("SELECT * FROM avaliacoes WHERE id = ?").bind(id).first();
}

export async function deleteAvaliacao(env, id) {
  await env.DB.prepare("DELETE FROM avaliacoes WHERE id = ?").bind(id).run();
}

// ---------- biblioteca ----------

export async function listBiblioteca(env) {
  const res = await env.DB.prepare(
    "SELECT * FROM biblioteca ORDER BY categoria COLLATE NOCASE, ordem, id").all();
  return res.results || [];
}

export async function createBiblioteca(env, data, createdBy = null) {
  const res = await env.DB.prepare(
    "INSERT INTO biblioteca (categoria, titulo, descricao, url, ordem, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    String(data.categoria || "Geral").trim(), String(data.titulo || "").trim(),
    data.descricao || null, String(data.url || "").trim(), Number(data.ordem || 0), createdBy,
  ).run();
  return res.meta.last_row_id;
}

export async function updateBiblioteca(env, id, data) {
  const sets = [];
  const vals = [];
  for (const f of ["categoria", "titulo", "descricao", "url"]) {
    if (f in data) { sets.push(`${f} = ?`); vals.push(String(data[f] || "").trim() || null); }
  }
  if ("ordem" in data) { sets.push("ordem = ?"); vals.push(Number(data.ordem || 0)); }
  if (!sets.length) return;
  vals.push(id);
  await env.DB.prepare(`UPDATE biblioteca SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteBiblioteca(env, id) {
  await env.DB.prepare("DELETE FROM biblioteca WHERE id = ?").bind(id).run();
}

// ---------- resumo ----------

export async function resumo(env) {
  const one = async (sql) => Number((await env.DB.prepare(sql).first())?.c || 0);
  const total = await one("SELECT COUNT(*) AS c FROM participantes");
  const ativos = await one("SELECT COUNT(*) AS c FROM participantes WHERE ativo = 1");
  const totalAval = await one("SELECT COUNT(*) AS c FROM avaliacoes");
  const comAval = await one("SELECT COUNT(DISTINCT participante_id) AS c FROM avaliacoes");
  const totalVideos = await one("SELECT COUNT(*) AS c FROM biblioteca");
  return {
    totalParticipantes: total,
    participantesAtivos: ativos,
    totalAvaliacoes: totalAval,
    participantesComAvaliacao: comAval,
    participantesSemAvaliacao: total - comAval,
    totalVideos,
  };
}

// ---------- painel de indicadores (seção 9) ----------

const FAIXAS_ETARIAS = [["Menos de 60", 0, 59], ["60 a 69", 60, 69], ["70 a 79", 70, 79], ["80 ou mais", 80, 200]];
function faixaLabel(idade) {
  if (idade === null || idade === undefined) return "Sem data";
  for (const [label, lo, hi] of FAIXAS_ETARIAS) { if (idade >= lo && idade <= hi) return label; }
  return "Sem data";
}
function distBanda(imc, idade) {
  if (imc === null || imc === undefined) return null;
  const [lo, hi] = (idade !== null && idade !== undefined && idade >= 60) ? [23, 28] : [18.5, 25];
  if (imc < lo) return lo - imc;
  if (imc > hi) return imc - hi;
  return 0;
}

export async function dashboard(env, diasPeriodo = 180) {
  const hoje = new Date();
  const hojeIso = hoje.toISOString().slice(0, 10);
  const cutoff = new Date(hoje.getTime() - diasPeriodo * 86400000).toISOString().slice(0, 10);
  const parts = (await env.DB.prepare("SELECT id, data_nascimento, sexo, ativo FROM participantes").all()).results || [];
  const totalAval = Number((await env.DB.prepare("SELECT COUNT(*) AS c FROM avaliacoes").first())?.c || 0);
  const avRows = (await env.DB.prepare("SELECT participante_id, data_avaliacao, imc FROM avaliacoes ORDER BY participante_id, data_avaliacao").all()).results || [];
  const avmap = {};
  for (const r of avRows) { (avmap[r.participante_id] ||= []).push([r.data_avaliacao, r.imc]); }

  const dist = {}, faixa = {}, porSexo = {};
  const imcsUlt = [];
  let avaliadosPeriodo = 0, semRecente = 0, evolTotal = 0, evolPos = 0;

  for (const p of parts) {
    const idade = idadeEm(p.data_nascimento, hojeIso);
    const fl = faixaLabel(idade); faixa[fl] = (faixa[fl] || 0) + 1;
    const s = p.sexo || "Não informado"; porSexo[s] = (porSexo[s] || 0) + 1;
    const avs = avmap[p.id] || [];
    const comImc = avs.filter(([, i]) => i !== null && i !== undefined);
    if (comImc.length) {
      const ultImc = comImc[comImc.length - 1][1];
      const cls = classificarImc(ultImc, idade) || "Sem classificação";
      dist[cls] = (dist[cls] || 0) + 1;
      imcsUlt.push(ultImc);
    }
    const ultimaData = avs.length ? avs[avs.length - 1][0] : null;
    if (ultimaData && ultimaData >= cutoff) avaliadosPeriodo++;
    else if (p.ativo) semRecente++;
    if (comImc.length >= 2) {
      evolTotal++;
      const d0 = distBanda(comImc[0][1], idade);
      const d1 = distBanda(comImc[comImc.length - 1][1], idade);
      if (d1 < d0 - 1e-9 || d1 === 0) evolPos++;
    }
  }

  return {
    totalParticipantes: parts.length,
    participantesAtivos: parts.filter((p) => p.ativo).length,
    totalAvaliacoes: totalAval,
    avaliadosNoPeriodo: avaliadosPeriodo,
    semAvaliacaoRecente: semRecente,
    mediaImc: imcsUlt.length ? Math.round((imcsUlt.reduce((a, b) => a + b, 0) / imcsUlt.length) * 10) / 10 : null,
    distribuicaoImc: dist,
    faixaEtaria: faixa,
    porSexo,
    evolucaoPositivaPct: evolTotal ? Math.round((100 * evolPos) / evolTotal) : null,
    diasPeriodo,
  };
}

export async function exportData(env) {
  const participantes = (await env.DB.prepare("SELECT * FROM participantes ORDER BY nome_completo COLLATE NOCASE").all()).results || [];
  const avaliacoes = (await env.DB.prepare(
    "SELECT a.*, p.nome_completo FROM avaliacoes a JOIN participantes p ON p.id = a.participante_id ORDER BY p.nome_completo COLLATE NOCASE, a.data_avaliacao",
  ).all()).results || [];
  return { participantes, avaliacoes };
}
