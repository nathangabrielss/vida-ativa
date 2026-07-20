"""Helpers puros de identidade, cadastro e senha.

Espelho de functions/_lib/auth.js (validações e geração de usuário/OTP).
"""
from __future__ import annotations

import re
import secrets
import string
import unicodedata


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
NAME_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ' -]{1,60}$")
PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$"
)
PASSWORD_POLICY_MESSAGE = (
    "A senha precisa ter no mínimo 6 caracteres, com letra maiúscula, "
    "minúscula, número e um caractere especial."
)


def strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def slug_part(text: str) -> str:
    """Normaliza nome/sobrenome para username: sem acento e apenas [a-z]."""
    base = strip_accents((text or "").strip().lower())
    return re.sub(r"[^a-z]", "", base)


def build_username(nome: str, sobrenome: str) -> str:
    first = slug_part(nome)
    last = slug_part(sobrenome)
    if not first or not last:
        return ""
    return f"{first}.{last}"


def only_digits(text: str) -> str:
    return re.sub(r"\D", "", text or "")


def is_valid_name(value: str) -> bool:
    return bool(NAME_RE.match((value or "").strip()))


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value or ""))


def is_strong_password(value: str) -> bool:
    return bool(PASSWORD_RE.match(value or ""))


def generate_otp(length: int = 10) -> str:
    """Gera senha temporária aleatória que satisfaz a política de senha."""
    pools = [
        string.ascii_uppercase,
        string.ascii_lowercase,
        string.digits,
        "!@#$%&*?",
    ]
    chars = [secrets.choice(pool) for pool in pools]
    alphabet = "".join(pools)
    chars += [secrets.choice(alphabet) for _ in range(max(0, length - len(chars)))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)
