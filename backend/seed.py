"""Popula o banco local com dados de exemplo para demonstração.

Uso:
    python backend/seed.py            # cria admin + participantes + avaliações + vídeos (idempotente)
    python backend/seed.py --reset    # limpa participantes/avaliações/biblioteca e recria

Credenciais de demonstração são impressas ao final.
"""
from __future__ import annotations

import sys

import database as db
import imc as imc_lib

ADMIN = {"username": "ana.coordenadora", "senha": "Admin@123",
         "display": "Ana Coordenadora", "nome": "Ana", "sobrenome": "Coordenadora"}

# Participante com login conhecido (para demonstrar a área do participante).
PART_LOGIN = {"username": "joao.souza", "senha": "Joao@123"}

PARTICIPANTES = [
    # (dados, [(data, peso, altura, circ, sis, dia, fc, meta)], login?)
    ({"nome_completo": "João Souza", "data_nascimento": "1955-03-12", "sexo": "M",
      "telefone": "(17) 99999-1001", "endereco": "Rua das Flores, 120 - Centro",
      "info_saude": "Hipertenso, controlado.", "condicoes_preexistentes": "Hipertensão",
      "medicamentos": "Losartana 50mg", "contato": "Maria (filha) (17) 99888-1001",
      "observacoes": "Caminha 3x por semana."},
     [("2025-09-10", 84.0, 1.70, 102, 140, 90, 78, "Reduzir 4 kg até dezembro"),
      ("2026-01-15", 82.5, 1.70, 100, 138, 88, 76, "Manter caminhadas"),
      ("2026-05-20", 80.0, 1.70, 98, 132, 84, 74, "Chegar a 78 kg")],
     True),
    ({"nome_completo": "Maria Aparecida Lima", "data_nascimento": "1948-07-22", "sexo": "F",
      "telefone": "(17) 99999-1002", "endereco": "Av. Brasil, 45",
      "info_saude": "Diabetes tipo 2.", "condicoes_preexistentes": "Diabetes",
      "medicamentos": "Metformina", "contato": "(17) 99888-1002",
      "observacoes": "Participa da hidroginástica."},
     [("2025-10-05", 58.0, 1.52, 88, 130, 82, 80, "Ganhar massa magra"),
      ("2026-02-10", 57.0, 1.52, 86, 128, 80, 78, None),
      ("2026-06-18", 56.0, 1.52, 85, 126, 80, 76, "Manter peso")],
     False),
    ({"nome_completo": "Antônio Pereira", "data_nascimento": "1952-11-03", "sexo": "M",
      "telefone": "(17) 99999-1003", "endereco": "Rua São José, 300",
      "info_saude": "Sem comorbidades relevantes.", "condicoes_preexistentes": "",
      "medicamentos": "", "contato": "(17) 99888-1003", "observacoes": ""},
     [("2025-09-28", 92.0, 1.68, 110, 145, 92, 82, "Perder peso"),
      ("2026-03-12", 89.5, 1.68, 106, 140, 90, 80, "Reduzir circunferência"),
      ("2026-07-01", 87.0, 1.68, 103, 136, 86, 78, "Chegar a 84 kg")],
     False),
    ({"nome_completo": "Rosa Maria Ferreira", "data_nascimento": "1960-01-30", "sexo": "F",
      "telefone": "(17) 99999-1004", "endereco": "Rua das Palmeiras, 88",
      "info_saude": "Artrose no joelho.", "condicoes_preexistentes": "Artrose",
      "medicamentos": "", "contato": "(17) 99888-1004", "observacoes": "Prefere exercícios de baixo impacto."},
     [("2025-11-11", 70.0, 1.60, 94, 128, 82, 80, "Fortalecer pernas"),
      ("2026-04-22", 68.5, 1.60, 92, 126, 80, 78, "Manter atividade")],
     False),
    ({"nome_completo": "Carlos Eduardo Nunes", "data_nascimento": "1980-06-14", "sexo": "M",
      "telefone": "(17) 99999-1005", "endereco": "Rua Minas Gerais, 12",
      "info_saude": "Sobrepeso.", "condicoes_preexistentes": "",
      "medicamentos": "", "contato": "(17) 99888-1005", "observacoes": "Voluntário do programa."},
     [("2026-02-02", 95.0, 1.78, 104, 130, 85, 72, "Perder 8 kg"),
      ("2026-06-30", 91.0, 1.78, 100, 126, 82, 70, "Chegar a 85 kg")],
     False),
    ({"nome_completo": "Benedita Santos", "data_nascimento": "1945-09-09", "sexo": "F",
      "telefone": "(17) 99999-1006", "endereco": "Rua do Sol, 5",
      "info_saude": "Osteoporose.", "condicoes_preexistentes": "Osteoporose",
      "medicamentos": "Cálcio + Vitamina D", "contato": "(17) 99888-1006",
      "observacoes": "Frequência assídua."},
     [("2026-03-03", 52.0, 1.50, 82, 124, 78, 74, "Ganhar peso saudável")],
     False),
]

# Vídeos curados do programa (links reais do YouTube; o player é embutido no app).
def _yt(vid: str) -> str:
    return f"https://youtu.be/{vid}"

# (categoria, titulo, url)
BIBLIOTECA = [
    ("Exercícios funcionais", "Aquecimento para todos os treinos — cardio fácil para iniciantes", _yt("sXDcW15YGGE")),
    ("Exercícios funcionais", "Cardio para queimar gordura do corpo todo com música", _yt("eXi6CWnKEnw")),
    ("Exercícios funcionais", "Treino de pernas completo em casa", _yt("rbwyIiBmzj8")),
    ("Exercícios funcionais", "Treino rápido e prático para iniciantes sair do sedentarismo", _yt("-Qv4VoA3Gi8")),

    ("Exercícios para quem tem limitações", "Ginástica na cadeira — instruções (exercícios sentado para idosos)", _yt("TRSqqjK6vys")),
    ("Exercícios para quem tem limitações", "Ginástica na cadeira — segunda-feira", _yt("OHBvNl7wQ9s")),
    ("Exercícios para quem tem limitações", "Ginástica na cadeira — terça-feira", _yt("clDzllg9SC4")),
    ("Exercícios para quem tem limitações", "Ginástica na cadeira — quarta-feira", _yt("9a0gFQfT2b0")),
    ("Exercícios para quem tem limitações", "Ginástica na cadeira — quinta-feira", _yt("vee_3Bzx-iQ")),
    ("Exercícios para quem tem limitações", "Ginástica na cadeira — sexta-feira", _yt("-pviF0SZJYM")),

    ("Alongamentos", "Alongamento na cadeira para quadril e coluna (idosos)", _yt("S2BQv9g42jw")),
    ("Alongamentos", "Alongamento dinâmico — mobilidade para prevenir dor no corpo", _yt("F1iejoRbRts")),
    ("Alongamentos", "Alongamento para dor nas costas e lombar em casa", _yt("kpGcBev6DPY")),

    ("Alimentação", "Nossa alimentação — nutrientes", _yt("esvKd5UZDUM")),
    ("Alimentação", "Alimentos que prendem ou soltam o intestino", _yt("2LvsCTeXMc0")),
    ("Alimentação", "Como montar um prato saudável", _yt("DVPaj8ctqlc")),
    ("Alimentação", "Alimentação saudável: diabetes e alimentação", _yt("qI-6SjZ8VmI")),
    ("Alimentação", "Alimentação saudável: os perigos do sal em excesso", _yt("rg1Ntyr323c")),
    ("Alimentação", "O que é colesterol?", _yt("O1jGbbY4iqk")),

    ("Saúde da mulher", "Bem-estar feminino: dicas básicas para viver melhor", _yt("ohIS2C_FSw8")),
    ("Saúde da mulher", "Perimenopausa: o que é e como afeta a saúde feminina", _yt("Iisv_kKYuWg")),
    ("Saúde da mulher", "Menopausa: uma nova fase e o corpo que precisa ser ouvido", _yt("swaapgAUrc0")),
    ("Saúde da mulher", "Nutrientes essenciais para a saúde da mulher", _yt("HyeX0J3wgIg")),
]


def _ensure_admin() -> int:
    return db.ensure_user(ADMIN["username"], ADMIN["senha"], ADMIN["display"],
                          nome=ADMIN["nome"], sobrenome=ADMIN["sobrenome"],
                          email="ana.coordenadora@exemplo.com", role="admin", status="active")


def _reset() -> None:
    with db.db_cursor() as conn:
        conn.execute("DELETE FROM avaliacoes")
        conn.execute("DELETE FROM biblioteca")
        # participantes com login: solta o vínculo antes de apagar os usuários participantes
        conn.execute("DELETE FROM participantes")
        conn.execute("DELETE FROM users WHERE role = 'participante'")


def main() -> None:
    reset = "--reset" in sys.argv
    db.init_db()
    admin_id = _ensure_admin()

    if reset:
        _reset()

    existentes = db.list_participantes()
    if existentes and not reset:
        print("Banco já possui participantes — nada a fazer (use --reset para recriar).")
        _print_creds()
        return

    for dados, avals, tem_login in PARTICIPANTES:
        pid = db.create_participante(dados, created_by=admin_id)
        if tem_login:
            uid = db.ensure_user(PART_LOGIN["username"], PART_LOGIN["senha"],
                                 dados["nome_completo"], role="participante", status="active",
                                 must_change_password=False)
            db.link_user_to_participante(pid, uid)
        for (data_av, peso, altura, circ, sis, dia, fc, meta) in avals:
            imc, classificacao, _ = imc_lib.avaliar(peso, altura, dados["data_nascimento"], data_av)
            db.create_avaliacao(pid, {
                "data_avaliacao": data_av, "peso": peso, "altura": altura,
                "imc": imc, "imc_classificacao": classificacao, "circ_abdominal": circ,
                "pa_sistolica": sis, "pa_diastolica": dia, "freq_cardiaca": fc,
                "meta": meta, "observacoes": None,
            }, responsavel_id=admin_id)

    for i, (categoria, titulo, url) in enumerate(BIBLIOTECA):
        db.create_biblioteca({"categoria": categoria, "titulo": titulo,
                              "descricao": None, "url": url, "ordem": i}, created_by=admin_id)

    print("Seed concluído.")
    _print_creds()


def _print_creds() -> None:
    print("\n=== Credenciais de demonstração ===")
    print(f"  Admin        -> usuário: {ADMIN['username']}  | senha: {ADMIN['senha']}")
    print(f"  Participante -> usuário: {PART_LOGIN['username']}  | senha: {PART_LOGIN['senha']}")
    print("===================================\n")


if __name__ == "__main__":
    main()
