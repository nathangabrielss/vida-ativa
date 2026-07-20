"""Camada de dados (SQLite local) do Sistema Vida Ativa.

Espelha o comportamento das Functions do Cloudflare (functions/_lib/db.js) sobre
o mesmo schema. Sem baggage: só usuários/acesso + participantes + avaliações +
biblioteca. Backups diários automáticos como no Dashboard.
"""
from __future__ import annotations

import gzip
import os
import shutil
import sqlite3
import sys
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash

import imc as imc_lib

SCHEMA_PATH = Path(__file__).parent / "schema.sql"

ROLES = ("admin", "participante")
STATUSES = ("pending", "active", "disabled")


class CPFInUseError(Exception):
    """CPF já registrado por outro usuário."""


# ---------- caminhos / conexão ----------

def get_db_path() -> Path:
    return Path(os.environ.get("DB_PATH") or (Path(__file__).parent.parent / "data" / "data.db"))


def get_backup_dir() -> Path:
    env = os.environ.get("BACKUP_DIR")
    return Path(env) if env else (Path(__file__).parent.parent / "data" / "backups")


def get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with db_cursor() as conn:
        conn.executescript(sql)
    seed_username = os.environ.get("SEED_USERNAME")
    seed_password = os.environ.get("SEED_PASSWORD")
    if seed_username and seed_password:
        ensure_user(seed_username, seed_password, role="admin", status="active")


# ---------- backup diário ----------

BACKUP_PREFIX = "data.db."
BACKUP_SUFFIX = ".bak.gz"


def _list_backups(backup_dir: Path) -> list[Path]:
    if not backup_dir.exists():
        return []
    return sorted(
        (p for p in backup_dir.iterdir()
         if p.is_file() and p.name.startswith(BACKUP_PREFIX) and p.name.endswith(BACKUP_SUFFIX)),
        key=lambda p: p.stat().st_mtime,
    )


def ensure_daily_backup() -> Path | None:
    db_path = get_db_path()
    backup_dir = get_backup_dir()
    if not db_path.exists():
        return None
    try:
        backups = _list_backups(backup_dir)
        last = backups[-1].stat().st_mtime if backups else None
        if last is not None and (time.time() - last) < 86400:
            return None
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d")
        final_path = backup_dir / f"{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}"
        tmp_raw = backup_dir / f"{BACKUP_PREFIX}{stamp}.bak.tmp"
        src = sqlite3.connect(db_path)
        try:
            dst = sqlite3.connect(tmp_raw)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
        with open(tmp_raw, "rb") as fin, gzip.open(final_path, "wb", compresslevel=6) as fout:
            shutil.copyfileobj(fin, fout)
        tmp_raw.unlink(missing_ok=True)
        return final_path
    except Exception as e:  # noqa: BLE001 — backup nunca derruba o app
        print(f"WARN: backup diário falhou: {e}", file=sys.stderr)
        return None


# ---------- usuários ----------

def ensure_user(
    username: str,
    password: str,
    display_name: str | None = None,
    *,
    nome: str | None = None,
    sobrenome: str | None = None,
    cpf_hash: str | None = None,
    cpf_lookup: str | None = None,
    email: str | None = None,
    role: str = "participante",
    status: str = "active",
    must_change_password: bool = False,
) -> int:
    if role not in ROLES:
        raise ValueError("role inválida")
    if status not in STATUSES:
        raise ValueError("status inválido")
    with db_cursor() as conn:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row:
            return row["id"]
        if cpf_lookup:
            dup = conn.execute("SELECT 1 FROM users WHERE cpf_lookup = ?", (cpf_lookup,)).fetchone()
            if dup:
                raise CPFInUseError("CPF já cadastrado")
        cur = conn.execute(
            """INSERT INTO users
                 (username, password_hash, display_name, nome, sobrenome,
                  cpf_hash, cpf_lookup, email, role, status, must_change_password)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (username, generate_password_hash(password), display_name or username,
             nome, sobrenome, cpf_hash, cpf_lookup, email, role, status,
             1 if must_change_password else 0),
        )
        return cur.lastrowid


def get_user(user_id: int) -> sqlite3.Row | None:
    with db_cursor() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_user_by_username(username: str) -> sqlite3.Row | None:
    with db_cursor() as conn:
        return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def username_exists(username: str) -> bool:
    with db_cursor() as conn:
        return bool(conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone())


def email_exists(email: str, *, exclude_user_id: int | None = None) -> bool:
    sql = "SELECT 1 FROM users WHERE LOWER(email) = LOWER(?)"
    params: tuple = (email,)
    if exclude_user_id is not None:
        sql += " AND id != ?"
        params = (email, exclude_user_id)
    with db_cursor() as conn:
        return bool(conn.execute(sql, params).fetchone())


def count_users() -> int:
    with db_cursor() as conn:
        return int(conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"])


def list_users(status: str | None = None) -> list[dict]:
    sql = ("SELECT id, username, display_name, nome, sobrenome, email, role, "
           "status, must_change_password, created_at FROM users")
    params: tuple = ()
    if status:
        sql += " WHERE status = ?"
        params = (status,)
    sql += " ORDER BY status='pending' DESC, created_at DESC"
    with db_cursor() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def set_user_status(user_id: int, status: str) -> None:
    if status not in STATUSES:
        raise ValueError("status inválido")
    with db_cursor() as conn:
        conn.execute("UPDATE users SET status = ? WHERE id = ?", (status, user_id))


def set_must_change_password(user_id: int, value: bool) -> None:
    with db_cursor() as conn:
        conn.execute("UPDATE users SET must_change_password = ? WHERE id = ?",
                     (1 if value else 0, user_id))


def update_user_fields(user_id: int, *, display_name=None, email=None, role=None) -> None:
    sets, vals = [], []
    if display_name is not None:
        sets.append("display_name = ?"); vals.append(display_name)
    if email is not None:
        sets.append("email = ?"); vals.append(email or None)
    if role is not None:
        if role not in ROLES:
            raise ValueError("role inválida")
        sets.append("role = ?"); vals.append(role)
    if not sets:
        return
    vals.append(user_id)
    with db_cursor() as conn:
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", vals)


def update_user_password(user_id: int, new_hash: str) -> None:
    with db_cursor() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))


def delete_user(user_id: int) -> None:
    with db_cursor() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def count_admins(exclude_user_id: int | None = None) -> int:
    sql = "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active'"
    params: tuple = ()
    if exclude_user_id is not None:
        sql += " AND id != ?"
        params = (exclude_user_id,)
    with db_cursor() as conn:
        return int(conn.execute(sql, params).fetchone()["c"])


# ---------- password reset ----------

def create_password_reset_request(user_id: int) -> int:
    with db_cursor() as conn:
        existing = conn.execute(
            "SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'",
            (user_id,)).fetchone()
        if existing:
            return existing["id"]
        cur = conn.execute(
            "INSERT INTO password_reset_requests (user_id, status) VALUES (?, 'pending')",
            (user_id,))
        return cur.lastrowid


def list_password_reset_requests(status: str | None = "pending") -> list[dict]:
    sql = ("SELECT r.id, r.user_id, r.status, r.created_at, r.resolved_at, "
           "u.username, u.display_name FROM password_reset_requests r "
           "JOIN users u ON u.id = r.user_id")
    params: tuple = ()
    if status:
        sql += " WHERE r.status = ?"
        params = (status,)
    sql += " ORDER BY r.created_at DESC"
    with db_cursor() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def resolve_password_reset_request(request_id: int, admin_user_id: int, status: str):
    if status not in ("fulfilled", "rejected"):
        raise ValueError("status inválido")
    with db_cursor() as conn:
        row = conn.execute("SELECT * FROM password_reset_requests WHERE id = ?", (request_id,)).fetchone()
        if not row or row["status"] != "pending":
            return None
        conn.execute(
            """UPDATE password_reset_requests
                 SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
                 WHERE id = ?""",
            (status, admin_user_id, request_id))
        return row


# ---------- participantes ----------

_PART_FIELDS = (
    "nome_completo", "data_nascimento", "sexo", "telefone", "endereco",
    "info_saude", "condicoes_preexistentes", "medicamentos", "contato", "observacoes",
)


def create_participante(data: dict, created_by: int | None = None) -> int:
    nome = (data.get("nome_completo") or "").strip()
    if not nome:
        raise ValueError("nome_completo é obrigatório")
    cols = list(_PART_FIELDS) + ["ativo", "created_by"]
    vals = [
        nome,
        (data.get("data_nascimento") or None),
        (data.get("sexo") or None),
        (data.get("telefone") or None),
        (data.get("endereco") or None),
        (data.get("info_saude") or None),
        (data.get("condicoes_preexistentes") or None),
        (data.get("medicamentos") or None),
        (data.get("contato") or None),
        (data.get("observacoes") or None),
        1 if data.get("ativo", 1) else 0,
        created_by,
    ]
    placeholders = ", ".join("?" for _ in cols)
    with db_cursor() as conn:
        cur = conn.execute(
            f"INSERT INTO participantes ({', '.join(cols)}) VALUES ({placeholders})", vals)
        return cur.lastrowid


def get_participante(participante_id: int) -> dict | None:
    with db_cursor() as conn:
        row = conn.execute("SELECT * FROM participantes WHERE id = ?", (participante_id,)).fetchone()
        return dict(row) if row else None


def get_participante_by_user(user_id: int) -> dict | None:
    with db_cursor() as conn:
        row = conn.execute(
            "SELECT * FROM participantes WHERE user_id = ? ORDER BY id LIMIT 1", (user_id,)).fetchone()
        return dict(row) if row else None


def list_participantes(*, incluir_inativos: bool = True, busca: str | None = None) -> list[dict]:
    sql = """
        SELECT p.*,
               (SELECT COUNT(*) FROM avaliacoes a WHERE a.participante_id = p.id) AS total_avaliacoes,
               (SELECT MAX(a.data_avaliacao) FROM avaliacoes a WHERE a.participante_id = p.id) AS ultima_avaliacao,
               u.username AS acesso_username
          FROM participantes p
          LEFT JOIN users u ON u.id = p.user_id
    """
    where, params = [], []
    if not incluir_inativos:
        where.append("p.ativo = 1")
    if busca:
        where.append("LOWER(p.nome_completo) LIKE ?")
        params.append(f"%{busca.strip().lower()}%")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY p.nome_completo COLLATE NOCASE"
    with db_cursor() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def update_participante(participante_id: int, data: dict) -> None:
    sets, vals = [], []
    for f in _PART_FIELDS:
        if f in data:
            sets.append(f"{f} = ?")
            v = data.get(f)
            vals.append((v or None) if f != "nome_completo" else (v or "").strip())
    if "ativo" in data:
        sets.append("ativo = ?"); vals.append(1 if data.get("ativo") else 0)
    if not sets:
        return
    sets.append("updated_at = CURRENT_TIMESTAMP")
    vals.append(participante_id)
    with db_cursor() as conn:
        conn.execute(f"UPDATE participantes SET {', '.join(sets)} WHERE id = ?", vals)


def link_user_to_participante(participante_id: int, user_id: int) -> None:
    with db_cursor() as conn:
        conn.execute("UPDATE participantes SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (user_id, participante_id))


def delete_participante(participante_id: int) -> None:
    with db_cursor() as conn:
        conn.execute("DELETE FROM participantes WHERE id = ?", (participante_id,))


# ---------- avaliações ----------

def create_avaliacao(participante_id: int, data: dict, responsavel_id: int | None = None) -> int:
    with db_cursor() as conn:
        cur = conn.execute(
            """INSERT INTO avaliacoes
                 (participante_id, data_avaliacao, peso, altura, imc, imc_classificacao,
                  circ_abdominal, pa_sistolica, pa_diastolica, freq_cardiaca,
                  meta, observacoes, responsavel_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (participante_id, data["data_avaliacao"], data.get("peso"), data.get("altura"),
             data.get("imc"), data.get("imc_classificacao"), data.get("circ_abdominal"),
             data.get("pa_sistolica"), data.get("pa_diastolica"), data.get("freq_cardiaca"),
             data.get("meta"), data.get("observacoes"), responsavel_id))
        return cur.lastrowid


def list_avaliacoes(participante_id: int) -> list[dict]:
    with db_cursor() as conn:
        rows = conn.execute(
            """SELECT a.*, u.display_name AS responsavel_nome
                 FROM avaliacoes a
                 LEFT JOIN users u ON u.id = a.responsavel_id
                WHERE a.participante_id = ?
                ORDER BY a.data_avaliacao DESC, a.id DESC""",
            (participante_id,)).fetchall()
        return [dict(r) for r in rows]


def get_avaliacao(avaliacao_id: int) -> dict | None:
    with db_cursor() as conn:
        row = conn.execute("SELECT * FROM avaliacoes WHERE id = ?", (avaliacao_id,)).fetchone()
        return dict(row) if row else None


def delete_avaliacao(avaliacao_id: int) -> None:
    with db_cursor() as conn:
        conn.execute("DELETE FROM avaliacoes WHERE id = ?", (avaliacao_id,))


# ---------- biblioteca ----------

def list_biblioteca() -> list[dict]:
    with db_cursor() as conn:
        rows = conn.execute(
            "SELECT * FROM biblioteca ORDER BY categoria COLLATE NOCASE, ordem, id").fetchall()
        return [dict(r) for r in rows]


def create_biblioteca(data: dict, created_by: int | None = None) -> int:
    with db_cursor() as conn:
        cur = conn.execute(
            "INSERT INTO biblioteca (categoria, titulo, descricao, url, ordem, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ((data.get("categoria") or "Geral").strip(), (data.get("titulo") or "").strip(),
             (data.get("descricao") or None), (data.get("url") or "").strip(),
             int(data.get("ordem") or 0), created_by))
        return cur.lastrowid


def update_biblioteca(item_id: int, data: dict) -> None:
    sets, vals = [], []
    for f in ("categoria", "titulo", "descricao", "url"):
        if f in data:
            sets.append(f"{f} = ?"); vals.append((data.get(f) or "").strip() or None)
    if "ordem" in data:
        sets.append("ordem = ?"); vals.append(int(data.get("ordem") or 0))
    if not sets:
        return
    vals.append(item_id)
    with db_cursor() as conn:
        conn.execute(f"UPDATE biblioteca SET {', '.join(sets)} WHERE id = ?", vals)


def delete_biblioteca(item_id: int) -> None:
    with db_cursor() as conn:
        conn.execute("DELETE FROM biblioteca WHERE id = ?", (item_id,))


# ---------- resumo/indicadores (base do painel — expandido na Etapa 2) ----------

def resumo() -> dict:
    with db_cursor() as conn:
        def scalar(sql, params=()):
            return conn.execute(sql, params).fetchone()[0]
        total = scalar("SELECT COUNT(*) FROM participantes")
        ativos = scalar("SELECT COUNT(*) FROM participantes WHERE ativo = 1")
        total_aval = scalar("SELECT COUNT(*) FROM avaliacoes")
        com_aval = scalar("SELECT COUNT(DISTINCT participante_id) FROM avaliacoes")
        total_videos = scalar("SELECT COUNT(*) FROM biblioteca")
    return {
        "totalParticipantes": total,
        "participantesAtivos": ativos,
        "totalAvaliacoes": total_aval,
        "participantesComAvaliacao": com_aval,
        "participantesSemAvaliacao": total - com_aval,
        "totalVideos": total_videos,
    }


# ---------- painel de indicadores (seção 9) ----------

FAIXAS_ETARIAS = (("Menos de 60", 0, 59), ("60 a 69", 60, 69),
                  ("70 a 79", 70, 79), ("80 ou mais", 80, 200))


def _faixa_label(idade: int | None) -> str:
    if idade is None:
        return "Sem data"
    for label, lo, hi in FAIXAS_ETARIAS:
        if lo <= idade <= hi:
            return label
    return "Sem data"


def _dist_banda_saudavel(imc: float | None, idade: int | None) -> float | None:
    """Distância do IMC até a faixa saudável (0 = dentro da faixa)."""
    if imc is None:
        return None
    lo, hi = (23.0, 28.0) if (idade is not None and idade >= 60) else (18.5, 25.0)
    if imc < lo:
        return lo - imc
    if imc > hi:
        return imc - hi
    return 0.0


def dashboard(dias_periodo: int = 180) -> dict:
    """Indicadores consolidados do programa (seção 9)."""
    hoje = date.today()
    cutoff = (hoje - timedelta(days=dias_periodo)).isoformat()
    with db_cursor() as conn:
        parts = conn.execute(
            "SELECT id, data_nascimento, sexo, ativo FROM participantes").fetchall()
        total_aval = conn.execute("SELECT COUNT(*) AS c FROM avaliacoes").fetchone()["c"]
        avmap: dict[int, list] = {}
        for r in conn.execute(
            "SELECT participante_id, data_avaliacao, imc FROM avaliacoes "
            "ORDER BY participante_id, data_avaliacao"
        ).fetchall():
            avmap.setdefault(r["participante_id"], []).append((r["data_avaliacao"], r["imc"]))

    dist: dict[str, int] = {}
    faixa: dict[str, int] = {}
    por_sexo: dict[str, int] = {}
    imcs_ultimos: list[float] = []
    avaliados_periodo = sem_recente = evol_total = evol_pos = 0

    for p in parts:
        idade = imc_lib.idade_em(p["data_nascimento"], hoje.isoformat())
        faixa[_faixa_label(idade)] = faixa.get(_faixa_label(idade), 0) + 1
        s = p["sexo"] or "Não informado"
        por_sexo[s] = por_sexo.get(s, 0) + 1

        avs = avmap.get(p["id"], [])
        com_imc = [(d, i) for (d, i) in avs if i is not None]
        if com_imc:
            ult_imc = com_imc[-1][1]
            cls = imc_lib.classificar_imc(ult_imc, idade) or "Sem classificação"
            dist[cls] = dist.get(cls, 0) + 1
            imcs_ultimos.append(ult_imc)

        ultima_data = avs[-1][0] if avs else None
        if ultima_data and ultima_data >= cutoff:
            avaliados_periodo += 1
        elif p["ativo"]:
            sem_recente += 1

        if len(com_imc) >= 2:
            evol_total += 1
            d0 = _dist_banda_saudavel(com_imc[0][1], idade)
            d1 = _dist_banda_saudavel(com_imc[-1][1], idade)
            if d1 < d0 - 1e-9 or d1 == 0:
                evol_pos += 1

    return {
        "totalParticipantes": len(parts),
        "participantesAtivos": sum(1 for p in parts if p["ativo"]),
        "totalAvaliacoes": total_aval,
        "avaliadosNoPeriodo": avaliados_periodo,
        "semAvaliacaoRecente": sem_recente,
        "mediaImc": round(sum(imcs_ultimos) / len(imcs_ultimos), 1) if imcs_ultimos else None,
        "distribuicaoImc": dist,
        "faixaEtaria": faixa,
        "porSexo": por_sexo,
        "evolucaoPositivaPct": round(100 * evol_pos / evol_total) if evol_total else None,
        "diasPeriodo": dias_periodo,
    }


def export_data() -> dict:
    """Todos os participantes + avaliações (flat) para os relatórios."""
    with db_cursor() as conn:
        parts = [dict(r) for r in conn.execute(
            "SELECT * FROM participantes ORDER BY nome_completo COLLATE NOCASE").fetchall()]
        avals = [dict(r) for r in conn.execute(
            "SELECT a.*, p.nome_completo FROM avaliacoes a "
            "JOIN participantes p ON p.id = a.participante_id "
            "ORDER BY p.nome_completo COLLATE NOCASE, a.data_avaliacao").fetchall()]
    return {"participantes": parts, "avaliacoes": avals}
