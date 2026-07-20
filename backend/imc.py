"""Cálculo e classificação de IMC por faixa etária.

Espelho fiel de functions/_lib/imc.js — a mesma entrada tem que produzir a mesma
saída nos dois backends (Flask local e Cloudflare Functions).
"""
from __future__ import annotations

from datetime import date


def _to_date(value) -> date | None:
    """Aceita 'YYYY-MM-DD' (ou date) e devolve date, ou None."""
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        y, m, d = str(value)[:10].split("-")
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def calcular_imc(peso, altura) -> float | None:
    """IMC = peso(kg) / altura(m)². Devolve arredondado a 2 casas, ou None."""
    try:
        p = float(peso)
        a = float(altura)
    except (TypeError, ValueError):
        return None
    if p <= 0 or a <= 0:
        return None
    return round(p / (a * a), 2)


def idade_em(data_nascimento, data_referencia=None) -> int | None:
    """Idade completa (anos) na data de referência (default: data da avaliação/hoje)."""
    nasc = _to_date(data_nascimento)
    if not nasc:
        return None
    ref = _to_date(data_referencia) or date.today()
    anos = ref.year - nasc.year - ((ref.month, ref.day) < (nasc.month, nasc.day))
    return anos if anos >= 0 else None


def classificar_imc(imc, idade) -> str | None:
    """Classifica o IMC conforme a faixa etária (adulto <60 vs idoso ≥60)."""
    if imc is None:
        return None
    if idade is not None and idade >= 60:
        # Tabela específica para idosos (60+).
        if imc <= 23:
            return "Baixo peso"
        if imc < 28:
            return "Peso adequado (eutrofia)"
        if imc < 30:
            return "Excesso de peso"
        return "Obesidade"
    # Tabela para adultos.
    if imc < 18.5:
        return "Baixo peso"
    if imc < 25:
        return "Peso normal"
    if imc < 30:
        return "Sobrepeso"
    if imc < 35:
        return "Obesidade grau I"
    if imc < 40:
        return "Obesidade grau II"
    return "Obesidade grau III"


def avaliar(peso, altura, data_nascimento, data_avaliacao):
    """Retorna (imc, classificacao, idade) já calculados para persistir/exibir."""
    imc = calcular_imc(peso, altura)
    idade = idade_em(data_nascimento, data_avaliacao)
    classificacao = classificar_imc(imc, idade)
    return imc, classificacao, idade
