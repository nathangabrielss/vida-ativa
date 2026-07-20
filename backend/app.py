"""Sistema Vida Ativa — backend Flask (espelho local do Cloudflare Functions).

Serve o frontend estático (mesma pasta publicada no Cloudflare Pages) e a API
`/api/...`. Sessão por cookie assinado, guarda CSRF por header, papéis
admin/participante, status pending/active/disabled e troca obrigatória de senha.
"""
from __future__ import annotations

import os
import re
import secrets
import time
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

import auth_utils as auth
import database as db
import imc as imc_lib

BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)

SESSION_MAX_AGE = 60 * 60 * 6  # 6h de janela absoluta desde o login
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SECURE_COOKIES", "0") == "1",
    PERMANENT_SESSION_LIFETIME=SESSION_MAX_AGE,
    SESSION_REFRESH_EACH_REQUEST=False,
)

limiter = Limiter(key_func=get_remote_address, app=app, default_limits=[],
                  storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
                  headers_enabled=True)


@app.errorhandler(429)
def _ratelimit_response(e):
    return jsonify({"error": "rate_limited", "detail": str(e.description)}), 429


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.before_request
def _session_and_csrf_guard():
    # Expiração absoluta da sessão.
    if "user_id" in session:
        started = session.get("login_at")
        if not started or (time.time() - started) > SESSION_MAX_AGE:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify({"error": "session_expired"}), 401
    # CSRF: mutações na API exigem header X-Requested-With.
    if request.method not in SAFE_METHODS and request.path.startswith("/api/"):
        if request.headers.get("X-Requested-With") != "XMLHttpRequest":
            return jsonify({"error": "csrf_header_missing"}), 403
    return None


# ---------- helpers de auth ----------

def current_user():
    uid = session.get("user_id")
    return db.get_user(uid) if uid else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        u = current_user()
        if not u or (u["status"] or "active") != "active":
            return jsonify({"error": "unauthorized"}), 401
        g.user = u
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        u = current_user()
        if not u or (u["status"] or "active") != "active":
            return jsonify({"error": "unauthorized"}), 401
        if (u["role"] or "participante") != "admin":
            return jsonify({"error": "forbidden"}), 403
        g.user = u
        return view(*args, **kwargs)
    return wrapped


def public_user(u) -> dict:
    return {
        "id": u["id"],
        "username": u["username"],
        "displayName": u["display_name"] or u["username"],
        "role": u["role"] or "participante",
        "mustChangePassword": bool(u["must_change_password"]),
    }


def _num(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value):
    v = _num(value)
    return int(v) if v is not None else None


# ---------- páginas (SPA estático) ----------

@app.route("/")
def index_page():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(FRONTEND_DIR, "sw.js")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# ---------- auth API ----------

@app.post("/api/login")
@limiter.limit("10 per minute; 40 per hour", methods=["POST"])
def api_login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip().lower()
    password = payload.get("password") or ""
    remember = bool(payload.get("remember"))
    if not username or not password:
        return jsonify({"error": "missing_credentials"}), 400
    user = db.get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid_credentials"}), 401
    status = user["status"] or "active"
    if status == "pending":
        return jsonify({"error": "account_pending",
                        "detail": "Seu cadastro ainda não foi aprovado pelo administrador."}), 403
    if status == "disabled":
        return jsonify({"error": "account_disabled",
                        "detail": "Sua conta foi desativada. Procure o administrador."}), 403
    session.clear()
    session["user_id"] = user["id"]
    session["login_at"] = int(time.time())
    session.permanent = remember
    return jsonify({"user": public_user(user)})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def api_me():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(public_user(u))


@app.get("/api/check-username")
@limiter.limit("60 per minute", methods=["GET"])
def api_check_username():
    nome = (request.args.get("nome") or "").strip()
    sobrenome = (request.args.get("sobrenome") or "").strip()
    if not nome or not sobrenome:
        return jsonify({"username": "", "available": False, "reason": "missing"})
    username = auth.build_username(nome, sobrenome)
    if not username:
        return jsonify({"username": "", "available": False, "reason": "invalid"})
    return jsonify({"username": username, "available": not db.username_exists(username)})


@app.post("/api/signup")
@limiter.limit("5 per minute; 20 per hour", methods=["POST"])
def api_signup():
    payload = request.get_json(silent=True) or {}
    nome = (payload.get("nome") or "").strip()
    sobrenome = (payload.get("sobrenome") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    senha = payload.get("senha") or ""
    confirm = payload.get("confirmarSenha") or ""
    if not nome or not sobrenome or not auth.is_valid_name(nome) or not auth.is_valid_name(sobrenome):
        return jsonify({"error": "invalid_name", "detail": "Informe nome e sobrenome válidos."}), 400
    if not email or not auth.is_valid_email(email):
        return jsonify({"error": "invalid_email", "detail": "Informe um email válido."}), 400
    if db.email_exists(email):
        return jsonify({"error": "email_in_use", "detail": "Este email já está cadastrado."}), 409
    if not senha or senha != confirm:
        return jsonify({"error": "password_mismatch", "detail": "As senhas não conferem."}), 400
    if not auth.is_strong_password(senha):
        return jsonify({"error": "weak_password", "detail": auth.PASSWORD_POLICY_MESSAGE}), 400
    username = auth.build_username(nome, sobrenome)
    if not username:
        return jsonify({"error": "invalid_name", "detail": "Não foi possível gerar um usuário."}), 400
    if db.username_exists(username):
        return jsonify({"error": "username_taken",
                        "detail": "Esse usuário já existe. Use outro sobrenome."}), 409
    first_admin = db.count_users() == 0
    db.ensure_user(username, senha, f"{nome} {sobrenome}", nome=nome, sobrenome=sobrenome,
                   email=email, role="admin" if first_admin else "participante",
                   status="active" if first_admin else "pending")
    return jsonify({
        "ok": True,
        "status": "active" if first_admin else "pending",
        "username": username,
        "message": ("Conta de administrador criada. Você já pode entrar."
                    if first_admin else
                    "Cadastro recebido. Aguarde a aprovação do administrador."),
    })


@app.post("/api/change-password")
@login_required
def api_change_password():
    payload = request.get_json(silent=True) or {}
    current_pw = payload.get("currentPassword") or ""
    new_pw = payload.get("newPassword") or ""
    confirm_pw = payload.get("confirmPassword") or ""
    if not new_pw or not confirm_pw:
        return jsonify({"error": "missing_fields", "detail": "Preencha todos os campos."}), 400
    if new_pw != confirm_pw:
        return jsonify({"error": "password_mismatch", "detail": "As senhas não conferem."}), 400
    if not auth.is_strong_password(new_pw):
        return jsonify({"error": "weak_password", "detail": auth.PASSWORD_POLICY_MESSAGE}), 400
    u = g.user
    if not current_pw or not check_password_hash(u["password_hash"], current_pw):
        return jsonify({"error": "wrong_password", "detail": "Senha atual incorreta."}), 401
    db.update_user_password(u["id"], generate_password_hash(new_pw))
    if u["must_change_password"]:
        db.set_must_change_password(u["id"], False)
    return jsonify({"ok": True})


@app.post("/api/password-reset/request")
@limiter.limit("5 per minute; 20 per hour", methods=["POST"])
def api_password_reset_request():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip().lower()
    if not username:
        return jsonify({"error": "missing_fields", "detail": "Informe seu usuário."}), 400
    user = db.get_user_by_username(username)
    if user:
        db.create_password_reset_request(user["id"])
    return jsonify({"ok": True,
                    "message": "Se o usuário existir, o pedido foi registrado. "
                               "Procure o administrador para receber uma senha temporária."})


# ---------- participante: visão própria ----------

@app.get("/api/me/participante")
@login_required
def api_me_participante():
    p = db.get_participante_by_user(g.user["id"])
    if not p:
        return jsonify({"participante": None, "avaliacoes": []})
    avals = db.list_avaliacoes(p["id"])
    return jsonify({"participante": p, "avaliacoes": avals})


# ---------- admin: participantes ----------

@app.get("/api/participantes")
@admin_required
def api_list_participantes():
    busca = request.args.get("busca")
    incluir = request.args.get("inativos", "1") != "0"
    return jsonify({"participantes": db.list_participantes(incluir_inativos=incluir, busca=busca)})


@app.post("/api/participantes")
@admin_required
def api_create_participante():
    payload = request.get_json(silent=True) or {}
    if not (payload.get("nome_completo") or "").strip():
        return jsonify({"error": "missing_fields", "detail": "Nome completo é obrigatório."}), 400
    pid = db.create_participante(payload, created_by=g.user["id"])
    return jsonify({"ok": True, "id": pid})


@app.get("/api/participantes/<int:pid>")
@admin_required
def api_get_participante(pid: int):
    p = db.get_participante(pid)
    if not p:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"participante": p, "avaliacoes": db.list_avaliacoes(pid)})


@app.patch("/api/participantes/<int:pid>")
@admin_required
def api_update_participante(pid: int):
    if not db.get_participante(pid):
        return jsonify({"error": "not_found"}), 404
    db.update_participante(pid, request.get_json(silent=True) or {})
    return jsonify({"ok": True})


@app.delete("/api/participantes/<int:pid>")
@admin_required
def api_delete_participante(pid: int):
    if not db.get_participante(pid):
        return jsonify({"error": "not_found"}), 404
    db.delete_participante(pid)
    return jsonify({"ok": True})


def _gerar_username_participante(nome_completo: str) -> str:
    partes = [p for p in re.split(r"\s+", (nome_completo or "").strip()) if p]
    if not partes:
        return ""
    base = auth.build_username(partes[0], partes[-1] if len(partes) > 1 else partes[0])
    if not base:
        return ""
    candidato = base
    i = 1
    while db.username_exists(candidato):
        i += 1
        candidato = f"{base}{i}"
    return candidato


@app.post("/api/participantes/<int:pid>/acesso")
@admin_required
def api_create_participante_access(pid: int):
    """Gera um login (usuário + senha temporária) e vincula ao participante."""
    p = db.get_participante(pid)
    if not p:
        return jsonify({"error": "not_found"}), 404
    if p.get("user_id"):
        return jsonify({"error": "already_linked",
                        "detail": "Este participante já possui acesso."}), 400
    username = _gerar_username_participante(p["nome_completo"])
    if not username:
        return jsonify({"error": "invalid_name",
                        "detail": "Nome do participante não permite gerar usuário."}), 400
    otp = auth.generate_otp()
    uid = db.ensure_user(username, otp, p["nome_completo"], role="participante",
                         status="active", must_change_password=True)
    db.link_user_to_participante(pid, uid)
    return jsonify({"ok": True, "username": username, "senhaTemporaria": otp,
                    "warning": "Anote a senha temporária: ela só será exibida agora. "
                               "O participante deverá trocá-la no primeiro acesso."})


# ---------- admin: avaliações ----------

@app.post("/api/participantes/<int:pid>/avaliacoes")
@admin_required
def api_create_avaliacao(pid: int):
    p = db.get_participante(pid)
    if not p:
        return jsonify({"error": "not_found"}), 404
    payload = request.get_json(silent=True) or {}
    data_av = (payload.get("data_avaliacao") or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", data_av):
        return jsonify({"error": "invalid_date", "detail": "Informe a data da avaliação."}), 400
    peso = _num(payload.get("peso"))
    altura = _num(payload.get("altura"))
    imc, classificacao, _idade = imc_lib.avaliar(peso, altura, p.get("data_nascimento"), data_av)
    dados = {
        "data_avaliacao": data_av,
        "peso": peso,
        "altura": altura,
        "imc": imc,
        "imc_classificacao": classificacao,
        "circ_abdominal": _num(payload.get("circ_abdominal")),
        "pa_sistolica": _int(payload.get("pa_sistolica")),
        "pa_diastolica": _int(payload.get("pa_diastolica")),
        "freq_cardiaca": _int(payload.get("freq_cardiaca")),
        "meta": (payload.get("meta") or None),
        "observacoes": (payload.get("observacoes") or None),
    }
    aid = db.create_avaliacao(pid, dados, responsavel_id=g.user["id"])
    return jsonify({"ok": True, "id": aid, "imc": imc, "imcClassificacao": classificacao})


@app.delete("/api/avaliacoes/<int:aid>")
@admin_required
def api_delete_avaliacao(aid: int):
    if not db.get_avaliacao(aid):
        return jsonify({"error": "not_found"}), 404
    db.delete_avaliacao(aid)
    return jsonify({"ok": True})


# ---------- biblioteca ----------

@app.get("/api/biblioteca")
@login_required
def api_list_biblioteca():
    return jsonify({"itens": db.list_biblioteca()})


@app.post("/api/biblioteca")
@admin_required
def api_create_biblioteca():
    payload = request.get_json(silent=True) or {}
    if not (payload.get("titulo") or "").strip() or not (payload.get("url") or "").strip():
        return jsonify({"error": "missing_fields", "detail": "Título e link são obrigatórios."}), 400
    bid = db.create_biblioteca(payload, created_by=g.user["id"])
    return jsonify({"ok": True, "id": bid})


@app.patch("/api/biblioteca/<int:bid>")
@admin_required
def api_update_biblioteca(bid: int):
    db.update_biblioteca(bid, request.get_json(silent=True) or {})
    return jsonify({"ok": True})


@app.delete("/api/biblioteca/<int:bid>")
@admin_required
def api_delete_biblioteca(bid: int):
    db.delete_biblioteca(bid)
    return jsonify({"ok": True})


# ---------- admin: gestão de usuários ----------

@app.get("/api/admin/users")
@admin_required
def api_admin_list_users():
    status = request.args.get("status") or None
    if status and status not in db.STATUSES:
        return jsonify({"error": "invalid_status"}), 400
    return jsonify({"users": db.list_users(status)})


@app.post("/api/admin/users/<int:user_id>/approve")
@admin_required
def api_admin_approve_user(user_id: int):
    u = db.get_user(user_id)
    if not u:
        return jsonify({"error": "not_found"}), 404
    db.set_user_status(user_id, "active")
    return jsonify({"ok": True})


@app.post("/api/admin/users/<int:user_id>/disable")
@admin_required
def api_admin_disable_user(user_id: int):
    if user_id == g.user["id"]:
        return jsonify({"error": "forbidden", "detail": "Você não pode desativar a si mesmo."}), 400
    u = db.get_user(user_id)
    if not u:
        return jsonify({"error": "not_found"}), 404
    if u["role"] == "admin" and db.count_admins(exclude_user_id=user_id) == 0:
        return jsonify({"error": "last_admin", "detail": "Não há outro administrador ativo."}), 400
    db.set_user_status(user_id, "disabled")
    return jsonify({"ok": True})


@app.patch("/api/admin/users/<int:user_id>")
@admin_required
def api_admin_edit_user(user_id: int):
    u = db.get_user(user_id)
    if not u:
        return jsonify({"error": "not_found"}), 404
    payload = request.get_json(silent=True) or {}
    display_name = payload.get("displayName")
    email = payload.get("email")
    role = payload.get("role")
    if email is not None:
        email = (email or "").strip().lower() or None
        if email and not auth.is_valid_email(email):
            return jsonify({"error": "invalid_email"}), 400
        if email and db.email_exists(email, exclude_user_id=user_id):
            return jsonify({"error": "email_in_use", "detail": "Email já em uso."}), 409
    if role is not None:
        role = (role or "").strip()
        if role not in db.ROLES:
            return jsonify({"error": "invalid_role"}), 400
        if role == "participante" and u["role"] == "admin" and db.count_admins(exclude_user_id=user_id) == 0:
            return jsonify({"error": "last_admin", "detail": "Você é o último administrador ativo."}), 400
    if display_name is not None:
        display_name = (display_name or "").strip()
        if not display_name:
            return jsonify({"error": "invalid_display_name"}), 400
    db.update_user_fields(user_id, display_name=display_name, email=email, role=role)
    return jsonify({"ok": True})


@app.delete("/api/admin/users/<int:user_id>")
@admin_required
def api_admin_delete_user(user_id: int):
    if user_id == g.user["id"]:
        return jsonify({"error": "forbidden", "detail": "Você não pode excluir a si mesmo."}), 400
    u = db.get_user(user_id)
    if not u:
        return jsonify({"error": "not_found"}), 404
    if u["role"] == "admin" and db.count_admins(exclude_user_id=user_id) == 0:
        return jsonify({"error": "last_admin", "detail": "Não há outro administrador ativo."}), 400
    db.delete_user(user_id)
    return jsonify({"ok": True})


@app.get("/api/admin/password-resets")
@admin_required
def api_admin_list_resets():
    return jsonify({"requests": db.list_password_reset_requests(request.args.get("status", "pending") or None)})


@app.post("/api/admin/password-resets/<int:req_id>/generate-otp")
@admin_required
def api_admin_generate_otp(req_id: int):
    row = db.resolve_password_reset_request(req_id, g.user["id"], "fulfilled")
    if not row:
        return jsonify({"error": "not_found", "detail": "Solicitação inexistente ou já resolvida."}), 404
    otp = auth.generate_otp()
    db.update_user_password(row["user_id"], generate_password_hash(otp))
    db.set_must_change_password(row["user_id"], True)
    return jsonify({"ok": True, "userId": row["user_id"], "otp": otp,
                    "warning": "Repasse a senha temporária ao usuário por canal seguro. "
                               "Ela só aparece agora."})


@app.post("/api/admin/password-resets/<int:req_id>/reject")
@admin_required
def api_admin_reject_reset(req_id: int):
    row = db.resolve_password_reset_request(req_id, g.user["id"], "rejected")
    if not row:
        return jsonify({"error": "not_found", "detail": "Solicitação inexistente ou já resolvida."}), 404
    return jsonify({"ok": True})


# ---------- admin: resumo/painel ----------

@app.get("/api/admin/resumo")
@admin_required
def api_admin_resumo():
    return jsonify(db.resumo())


@app.get("/api/admin/dashboard")
@admin_required
def api_admin_dashboard():
    return jsonify(db.dashboard())


@app.get("/api/admin/export-data")
@admin_required
def api_admin_export_data():
    return jsonify(db.export_data())


# ---------- bootstrap ----------

if not os.environ.get("SKIP_INIT_DB"):
    db.init_db()
    db.ensure_daily_backup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5056"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
