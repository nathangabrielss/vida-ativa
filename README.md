# Vida Ativa

Sistema de cadastro, acompanhamento e gestão de participantes de um programa de
saúde, bem-estar e qualidade de vida (foco em público idoso). Cálculo e
classificação automática de IMC por faixa etária, histórico de avaliações
físicas, painel de indicadores, relatórios gerenciais e biblioteca de vídeos
educativos.

## Acesso

- Local: <http://127.0.0.1:5056> (após subir o servidor — veja abaixo)
- Produção: preencher após o primeiro deploy no Cloudflare Pages

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS, JavaScript vanilla, Chart.js, SheetJS |
| API online | Cloudflare Pages Functions |
| Banco online | Cloudflare D1 |
| Hospedagem | Cloudflare Pages |
| Versionamento | Git + GitHub |
| Backend local | Flask + SQLite |

## Estrutura Principal

```text
Sistema Participantes/
├── .doc/                # Documentação técnica (Word)
├── backend/             # Backend Flask local (espelho do backend online)
├── data/                # Banco SQLite local e backups, ignorado no Git
├── frontend/            # Site estático publicado no Cloudflare Pages
├── functions/           # API online em Cloudflare Pages Functions
├── migrations/          # Schema versionado do Cloudflare D1
├── scripts/             # Utilitários locais (iniciar, instalar, deploy)
├── README.md
├── package.json         # Scripts auxiliares do Wrangler
├── requirements.txt     # Dependências do backend Flask local
└── wrangler.toml        # Configuração Cloudflare Pages/D1
```

## Documentação

Documentação técnica completa (arquitetura, modelo de dados, cálculo/classificação
de IMC, regras de negócio, telas, API e segurança):
[`.doc/Vida_Ativa_Documentacao_Tecnica.docx`](.doc/Vida_Ativa_Documentacao_Tecnica.docx)

## Desenvolvimento Local

### Backend Flask local

```powershell
py -3 -m pip install -r requirements.txt
cd backend
py app.py
```

Ou, no Windows, dois cliques em `scripts\iniciar-vida-ativa.bat` (sobe na porta 5056).

### Dados de exemplo

```powershell
python backend/seed.py           # cria admin + participantes + avaliações + biblioteca
python backend/seed.py --reset   # recria os dados de exemplo do zero
```

Credenciais de demonstração são impressas ao final do seed.

### Validação rápida

```powershell
npm run check
```

## Publicar no Cloudflare (gratuito)

Passos únicos, feitos uma vez por quem tem a conta Cloudflare/GitHub:

1. **Criar o repositório no GitHub** (vazio) e configurar o remote:
   ```powershell
   git init
   git add -A
   git commit -m "chore: versão inicial"
   git branch -M main
   git remote add origin <url-do-seu-repo-no-github>
   git push -u origin main
   ```
2. **Login no Wrangler** (abre o navegador para autorizar a conta Cloudflare):
   ```powershell
   npx wrangler login
   ```
3. **Criar o banco D1**:
   ```powershell
   npx wrangler d1 create vida-ativa
   ```
   Copie o `database_id` retornado e cole em `wrangler.toml` (campo `database_id`).
4. **Aplicar o schema no D1**:
   ```powershell
   npx wrangler d1 migrations apply vida-ativa --remote
   ```
5. **Conectar o Cloudflare Pages ao repositório do GitHub** (no painel do
   Cloudflare: Workers & Pages → Create → Pages → Connect to Git), apontando:
   - Build output directory: `frontend`
   - Sem build command (site estático)
   - Em Settings → Functions → D1 database bindings: adicionar binding `DB` →
     banco `vida-ativa`.
6. (Opcional) Definir `SEED_USERNAME` / `SEED_PASSWORD` nas variáveis de
   ambiente do Pages para já nascer com um admin em produção — senão, o
   **primeiro cadastro feito no site vira administrador** automaticamente.

Depois desse setup único, publicar novas alterações é só rodar:

```powershell
scripts\deploy.bat
```

O script aplica as migrations pendentes do D1, comita e dá push — o Cloudflare
Pages publica automaticamente a partir da branch `main`. Se o Wrangler não
estiver instalado, rode antes `scripts\install-node-portable.bat` (baixa um
Node.js portátil dentro do projeto, sem precisar de permissão de admin).

## Licença

Projeto acadêmico/pessoal.
