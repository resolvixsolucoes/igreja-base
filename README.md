# Igreja Base

> Plataforma administrativa completa para igrejas — HTML/JS estático + Supabase.

Este repositório é a **base neutra** de uma plataforma desenvolvida em produção para uma igreja real, extraída aqui como **case público de portfólio** da [Resolvix](https://resolvixsolucoes.com.br). O código está publicado para demonstração — o setup para uma nova igreja está documentado abaixo.

**Escala em produção:** 36 páginas HTML, ~15 mil linhas de JavaScript, 51 migrations SQL, RLS granular por permissão, PWA offline-friendly, edge functions Supabase, bot WhatsApp para captação de visitantes.

---

## Módulos da plataforma

| Módulo | O que cobre |
|--------|-------------|
| **Membresia** | Cadastro completo (dados pessoais, endereço, cônjuge, filhos), busca, edição, aniversariantes, exportação, deduplicação por telefone |
| **Ministérios** | Levinho (infantil), Música, Comunicação, Integração, Mídia, Som — cada um com escalas, disponibilidade, materiais |
| **Levinho (infantil)** | Salas por faixa etária, check-in por QR, controle de responsáveis, visitantes recorrentes, materiais por voluntário, ajustes por checkin |
| **Financeiro** | Entradas, saídas, categorias hierárquicas, contas bancárias, recorrências, fechamento mensal, comprovantes, log de auditoria |
| **Agenda** | Eventos gerais, agendamentos pastorais, aconselhamento, badges de notificação, filtros por ministério |
| **Comunicação** | Comunicados por ministério, badges de não-lidas por membro, roteamento |
| **LMS de cursos** | Catálogo, matrícula, aulas, materiais, comentários, certificados, checkout de pagamentos, preview de curso |
| **Voluntariado** | Central de voluntários, check-in por QR, escalas gerais, materiais |
| **Visitantes** | Cadastro (formulário público + bot WhatsApp), acompanhamento, cadastro recorrente |
| **Relatórios** | Frequência de cultos, visitantes, financeiro (com exportação PDF) |
| **Permissões granulares** | ACL por página × aba × ação, roles customizados, cascata visual, backfill automático |
| **Auth** | Login por e-mail, recuperação de senha, PWA install, sessão persistente, guarda por página |

## Stack técnica

- **Frontend**: HTML5 + Vanilla JavaScript (sem framework), CSS custom, PWA com Service Worker
- **Backend**: [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage + Edge Functions em Deno/TypeScript)
- **Segurança**: Row-Level Security (RLS) em todas as tabelas, políticas granulares por permissão
- **Deploy**: hospedagem estática (Hostinger / Vercel / Netlify / GitHub Pages)
- **Bot WhatsApp**: Node.js + Baileys, Redis para sessão, Railway para deploy
- **Notificações**: Resend (SMTP) via Supabase, edge function `notify-pastoral-agendamento`
- **Realtime**: Supabase Realtime para comunicados e badges

## Arquitetura resumida

```
┌────────────────────────────┐
│   Navegador (HTML+JS+PWA)  │
│   config.js (por igreja)   │
└──────────┬─────────────────┘
           │ REST + Realtime
┌──────────▼─────────────────┐
│         Supabase           │
│  ├─ PostgreSQL + RLS       │
│  ├─ Auth (JWT)             │
│  ├─ Storage (materiais)    │
│  └─ Edge Functions (Deno)  │
└──────────┬─────────────────┘
           │ webhook
┌──────────▼─────────────────┐
│  Bot WhatsApp (Node.js)    │
│  Cadastro de visitantes    │
│  hospedado no Railway      │
└────────────────────────────┘
```

Toda a configuração de uma igreja (nome, credenciais Supabase, cores, contatos, redes sociais, PIX, endereço) fica centralizada em um único arquivo `config.js` na raiz — nenhum outro arquivo tem dado hardcoded.

---

## Screenshots

> Prints reais das telas em produção. Fique à vontade pra explorar o código dos módulos correspondentes.

<!-- SCREENSHOTS: substitua os placeholders pelas imagens reais quando quiser -->

| Dashboard | Financeiro | Levinho (infantil) |
|-----------|------------|-------------------|
| _adicione o print aqui_ | _adicione o print aqui_ | _adicione o print aqui_ |

| Agenda | Membros | LMS de cursos |
|--------|---------|---------------|
| _adicione o print aqui_ | _adicione o print aqui_ | _adicione o print aqui_ |

---

## Setup de uma nova igreja (~30 min)

### 1. Criar projeto Supabase
Em https://supabase.com/dashboard → **New project**. Anote:
- Project URL (`https://abcd1234.supabase.co`)
- publishable/anon key (**Project Settings → API**)

### 2. Rodar as migrations SQL
No SQL Editor do Supabase, execute em ordem:
1. `supabase/schema-*.sql` (todos os arquivos, ordem alfabética)
2. `plataforma/schema*.sql` (schemas do LMS, se for usar cursos)

> As migrations foram criadas incrementalmente durante o desenvolvimento em produção. Para uma nova igreja rodando do zero, é possível consolidá-las em um único `schema.sql` — está no roadmap.

### 3. Preencher `config.js`
Abra `config.js` na raiz e substitua os placeholders:
- `NOME_IGREJA`, `SLUG_IGREJA`, `DOMINIO`, `TAGLINE`
- `SUPABASE_URL` e `SUPABASE_KEY` (etapa 1)
- `CORES` (identidade visual)
- `CONTATOS`, `ENDERECO`, `REDES_SOCIAIS`, `CULTO_PRINCIPAL`, `PIX`
- `VIDEO_APRESENTACAO` (opcional — ID do YouTube pra home)

### 4. Substituir os assets visuais
Veja [ASSETS_A_SUBSTITUIR.md](ASSETS_A_SUBSTITUIR.md). Todos os PNGs de branding são placeholders 1x1 transparentes.

### 5. (Opcional) Configurar o bot WhatsApp
Se for usar cadastro de visitantes via WhatsApp:
1. Copie `whatsapp-bot/.env.example` para `whatsapp-bot/.env`
2. Preencha Supabase service role, Evolution API, Redis
3. Deploy no Railway (`whatsapp-bot/railway.toml`)

### 6. Deploy
Estático — sobe em qualquer hosting: Hostinger, Vercel, Netlify, GitHub Pages. Suba a raiz **excluindo** `whatsapp-bot/` e `supabase/`. Domínio recomendado: `plataforma.suaigreja.com` (subdomínio).

---

## Estrutura do repositório

```
/                          → Painel principal (36 HTMLs, 39 arquivos JS)
  config.js                → CONFIGURAÇÃO CENTRAL (edite antes do deploy)
  supabase.js              → Cliente Supabase (lê config.js)
  auth.js                  → Guarda de autenticação
  site-footer.js           → Rodapé compartilhado (lê config.js)
  *.html, *.js             → Páginas por módulo
  icons/                   → Ícones PWA (placeholders 1x1)
  logo.png                 → Logo do cabeçalho (placeholder 1x1)
  manifest.json            → Manifest PWA
  sw.js                    → Service Worker

plataforma/                → LMS de cursos (subprojeto)
  aprender.html            → Área do aluno
  curso.html               → Player de aulas
  certificado.html         → Certificado emitido
  pagamento-retorno.html   → Callback do checkout
  schema*.sql              → Schemas específicos do LMS

supabase/                  → Schemas SQL e edge functions
  schema-*.sql             → 51 migrations em ordem alfabética
  functions/
    invite-user/           → Convidar usuário (auth admin)
    delete-user/           → Remover usuário
    notify-pastoral-agendamento/  → E-mail via Resend
    spotify-thumb/         → Thumbnail proxy para podcasts

whatsapp-bot/              → Bot para cadastro de visitantes
  Dockerfile
  railway.toml
  src/                     → Baileys + Redis + Supabase client
```

---

## Sobre a Resolvix

Este projeto foi desenvolvido, mantido e agora exposto como portfólio pela **Resolvix**.

- 🌐 [resolvixsolucoes.com.br](https://resolvixsolucoes.com.br)
- 📧 [contato@resolvixsolucoes.com.br](mailto:contato@resolvixsolucoes.com.br)
- 💬 [WhatsApp (31) 99143-7500](https://wa.me/5531991437500)

**Interessado em uma plataforma parecida pra sua igreja ou organização?** Fale com a gente pelos canais acima.

---

## Licença

Este código é publicado como portfólio público, mas **não é open-source**. Veja [LICENSE](LICENSE) para os termos completos. Em resumo:

- ✅ Você pode ler, estudar e se inspirar no código
- ✅ Você pode citar como referência técnica
- ❌ Você não pode copiar, modificar ou redistribuir sem autorização
- ❌ Você não pode usar em produção sem contratar a Resolvix

Se quiser usar essa base pra sua igreja, [entre em contato](mailto:contato@resolvixsolucoes.com.br).
