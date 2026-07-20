-- Migration inicial do Cloudflare D1 — Sistema Vida Ativa.
-- Espelha backend/schema.sql e functions/_lib/schema.js.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  nome TEXT,
  sobrenome TEXT,
  cpf_hash TEXT,
  cpf_lookup TEXT UNIQUE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'participante',
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pwreset_status ON password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_requests(user_id);

CREATE TABLE IF NOT EXISTS participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nome_completo TEXT NOT NULL,
  data_nascimento TEXT,
  sexo TEXT,
  telefone TEXT,
  endereco TEXT,
  info_saude TEXT,
  condicoes_preexistentes TEXT,
  medicamentos TEXT,
  contato TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_participantes_user ON participantes(user_id);
CREATE INDEX IF NOT EXISTS idx_participantes_ativo ON participantes(ativo);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  data_avaliacao TEXT NOT NULL,
  peso REAL,
  altura REAL,
  imc REAL,
  imc_classificacao TEXT,
  circ_abdominal REAL,
  pa_sistolica INTEGER,
  pa_diastolica INTEGER,
  freq_cardiaca INTEGER,
  meta TEXT,
  observacoes TEXT,
  responsavel_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes(participante_id, data_avaliacao);

CREATE TABLE IF NOT EXISTS biblioteca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_biblioteca_categoria ON biblioteca(categoria, ordem);
