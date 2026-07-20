const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64urlToBytes(value) {
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return bytesToBase64url(new Uint8Array(sig));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64url(salt)}$${bytesToBase64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(stored, password) {
  if (!stored || !stored.startsWith("pbkdf2-sha256$")) return false;
  const [, iterRaw, saltRaw, hashRaw] = stored.split("$");
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64urlToBytes(saltRaw), iterations: Number(iterRaw), hash: "SHA-256" },
    key,
    256,
  );
  return bytesToBase64url(new Uint8Array(bits)) === hashRaw;
}

export async function cpfLookup(cpf, secret) {
  return hmac(secret, onlyDigits(cpf));
}

export async function signSession(secret, payload) {
  const body = bytesToBase64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifySession(secret, token) {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  if ((await hmac(secret, body)) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    if (!payload.uid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z\s'-]/g, "")
    .replace(/\s+/g, " ");
}

export function buildUsername(nome, sobrenome) {
  const n = normalizeName(nome).split(" ")[0] || "";
  const s = normalizeName(sobrenome).split(" ").filter(Boolean).pop() || "";
  if (!n || !s) return "";
  return `${n}.${s}`.toLowerCase();
}

export function isValidName(value) {
  const v = normalizeName(value);
  return v.length >= 2 && /^[a-zA-Z\s'-]+$/.test(v);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export const PASSWORD_POLICY_MESSAGE =
  "A senha precisa ter no minimo 6 caracteres, com maiuscula, minuscula, numero e caractere especial.";

export function isStrongPassword(value) {
  const s = String(value || "");
  return s.length >= 6 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s);
}

export function generateOtp(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
