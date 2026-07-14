# Roteiros dos vídeos de demonstração

Este documento contém o roteiro de cada vídeo de navegação do sistema. **Cada vídeo tem no máximo 70 segundos** e foca em explorar as funções principais de um módulo.

**Base URL do demo:** https://igreja-base.vercel.app
**Login admin:** `demo@resolvixsolucoes.com.br` / `demo123456`

**Dicas gerais de gravação:**
- Resolução: 1440×900 ou 1920×1080 (16:9)
- Faça login **antes de começar a gravar** (ou grave o login no vídeo 3)
- Cursor visível, movimentos deliberados (nem apressados, nem lentos)
- Não precisa de áudio narrado — o README já descreve cada vídeo
- Exporte em MP4 (H.264), até 10 MB por arquivo se possível

Arquivos finais devem ficar em `docs/videos/` com os nomes indicados.

---

## 🎬 Vídeo 01 — Site público (área do visitante) `videos/01-site-publico.mp4`

**Duração:** ~65s
**Objetivo:** mostrar o site voltado pra quem chega de fora — visitantes, membros novos, quem busca a igreja no Google.

**URL inicial:** `/index.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–8s | Abre a home, scroll lento pelo hero | Overlay verde, foto de louvor, chamada principal |
| 8–15s | Continua o scroll: eventos, ministérios, contato | Cards de eventos com imagem, cascata de ministérios |
| 15–25s | Clica em **Quem Somos** no menu | Missão, história, liderança, valores |
| 25–35s | Clica em **O Que Cremos** | Declaração de fé organizada em seções |
| 35–50s | Clica em **Pregações** | Grid de pregações, filtro por pastor, botão play (integração Spotify) |
| 50–65s | Clica em **Downloads** | Materiais em PDF pra baixar (estudos, apostilas) |

---

## 🎬 Vídeo 02 — Agendamento pastoral (fluxo do fiel) `videos/02-agendamento-pastoral.mp4`

**Duração:** ~55s
**Objetivo:** mostrar como um membro/visitante marca um atendimento pastoral em 3 passos, sem precisar de login.

**URL inicial:** `/agendamento-pastoral.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–8s | Página carrega mostrando os conselheiros disponíveis | Foto, nome e especialidade de cada um |
| 8–18s | Clica em um conselheiro → botão "Próximo" | Stepper no topo avança pra 2 |
| 18–35s | Escolhe uma data (pill), depois um horário livre | Slots ocupados aparecem riscados |
| 35–50s | Preenche nome/telefone/motivo → confirma | Formulário simples de 3 campos |
| 50–55s | Tela de sucesso | Confirmação com nome do conselheiro, data e hora |

---

## 🎬 Vídeo 03 — Login + Dashboard `videos/03-dashboard.mp4`

**Duração:** ~60s
**Objetivo:** mostrar o painel principal que o administrador vê ao entrar.

**URL inicial:** `/login.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Página de login → digita e-mail e senha do demo → entra | Formulário limpo, "esqueci a senha" |
| 10–20s | Chega no dashboard, scroll pelos KPIs | Total de membros, visitantes do mês, aniversariantes da semana, saldo financeiro |
| 20–35s | Foca no calendário do mês do dashboard | Eventos coloridos por finalidade (culto, curso, café...) |
| 35–50s | Abre a cascata "Ministérios" no menu lateral | Lista dinâmica: Kids, Louvor, Comunicação, Integração, Mídia, Som |
| 50–60s | Passa o cursor por Conteúdos (cascata) e pelo footer da sidebar | Perfil do usuário logado, botão sair |

---

## 🎬 Vídeo 04 — Membros + Visitantes + Aniversariantes `videos/04-pessoas.mp4`

**Duração:** ~70s
**Objetivo:** módulo de pessoas — cadastro, busca, edição, ciclo do visitante ao membro.

**URL inicial:** `/membros.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Lista de membros com busca no topo | Filtros: célula, ministério, estado civil |
| 10–20s | Clica em um membro → abre ficha completa | Dados pessoais, endereço, cônjuge, filhos, ministérios que participa |
| 20–30s | Fecha ficha, clica em "+ Novo Membro" e mostra o formulário completo (sem salvar) | Todos os campos, incluindo foto |
| 30–45s | Vai pra **Visitantes** no menu | Lista, filtro por origem (bot WhatsApp, formulário público, cadastro manual) |
| 45–55s | Clica num visitante → mostra opção "Converter em membro" | Cadastro reaproveitado, sem redigitar |
| 55–70s | Vai pra **Aniversariantes** | Aniversariantes do mês agrupados por dia, com WhatsApp direto |

---

## 🎬 Vídeo 05 — Agenda + Programações + Aconselhamento admin `videos/05-agenda.mp4`

**Duração:** ~70s
**Objetivo:** módulo de agenda — programações da igreja + aba de aconselhamento pastoral com **cadastro em massa de disponibilidades**.

**URL inicial:** `/agenda.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–8s | Aba **Programações** aberta, calendário do mês | Legenda de cores por finalidade |
| 8–20s | Clica em "+ Nova Programação", cria um culto recorrente semanal | Toggle de repetição, preview "N eventos serão criados" |
| 20–25s | Fecha e clica num dia com evento | Painel do dia com voluntários escalados por ministério |
| 25–35s | Muda pra aba **Aconselhamento Pastoral** | Grid de conselheiros ativos |
| 35–55s | Clica em "+ Nova Disponibilidade" → adiciona 2 datas via chips → marca "repetir semanalmente" → seleciona Ter/Qui → escolhe data final | **Preview mostra "N disponibilidades serão criadas"** ← funcionalidade nova |
| 55–70s | Fecha modal, scroll até **Agendamentos Recebidos** | Filtros por status, botão de relatório do atendimento |

---

## 🎬 Vídeo 06 — Financeiro `videos/06-financeiro.mp4`

**Duração:** ~70s
**Objetivo:** módulo financeiro completo — entradas, saídas, categorias, contas, fechamento.

**URL inicial:** `/financeiro.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Dashboard financeiro do mês | Saldo, entradas, saídas, categorias top |
| 10–25s | Clica em "+ Nova Movimentação" → escolhe entrada, categoria, conta, valor, data (sem salvar) | Autocomplete de categoria, upload de comprovante |
| 25–35s | Vai pra aba **Categorias** | Árvore hierárquica (ex: Despesas → Manutenção → Elétrica) |
| 35–45s | Vai pra aba **Contas** | Conta corrente, poupança, dinheiro em espécie — saldo por conta |
| 45–55s | Vai pra aba **Recorrências** | Contas fixas mensais (aluguel, água, luz) |
| 55–70s | Vai pra aba **Fechamento** | Fechamento mensal, exportar PDF, log de auditoria |

---

## 🎬 Vídeo 07 — Ministérios + Escalas + Voluntários `videos/07-ministerios.mp4`

**Duração:** ~70s
**Objetivo:** gestão de ministérios com foco em Louvor (mais rico) e Central de Voluntários.

**URL inicial:** `/ministerios.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–8s | Página de ministérios: cards de cada ministério | Contagem de voluntários, líder, cor identificadora |
| 8–20s | Clica em **Louvor / Música** | Aba de voluntários com habilidades (vocal, teclado, bateria...) |
| 20–35s | Aba de escalas → clica num culto → mostra o repertório planejado | Músicas com tom, andamento, link Spotify |
| 35–50s | Volta ao menu, entra em **Central de Voluntários** | Escalas de todos os ministérios agrupadas por data |
| 50–70s | Mostra check-in por QR code | Fluxo: gerar QR → voluntário escaneia → check-in automático |

---

## 🎬 Vídeo 08 — Kids (ministério infantil) `videos/08-levinho.mp4`

**Duração:** ~65s
**Objetivo:** módulo especializado infantil — check-in por QR, salas por faixa etária, responsáveis.

**URL inicial:** `/ministerios-levinho.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Página do Kids: salas por faixa etária | Ex: Berçário, Maternal, Infantil I/II, Juniores |
| 10–20s | Clica numa sala → lista de crianças cadastradas | Foto, idade, responsável, alergias/observações |
| 20–35s | Abre `/levinho-checkin.html` | Fluxo de check-in: buscar criança → confirmar responsável → imprimir etiqueta |
| 35–50s | Volta pra sala → aba de **Voluntários** | Escala do dia, materiais que cada voluntário leva |
| 50–65s | Aba de **Visitantes recorrentes** | Crianças que vieram mais de 1x mas ainda não têm cadastro completo |

---

## 🎬 Vídeo 09 — Conteúdos + LMS de cursos `videos/09-conteudos-lms.mp4`

**Duração:** ~65s
**Objetivo:** pregações, biblioteca e o LMS completo (que roda em `/plataforma`).

**URL inicial:** `/conteudos.html?aba=pregacoes`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Aba **Pregações** admin | Grid de pregações com preview Spotify, botão editar |
| 10–20s | Troca pra aba **Biblioteca** | Livros, apostilas, materiais em PDF |
| 20–30s | Troca pra aba **Cursos** → clica num curso | Módulos, aulas, materiais, alunos matriculados |
| 30–45s | Abre `/plataforma/aprender.html` (área do aluno) | Cursos matriculados, progresso, próxima aula |
| 45–60s | Clica num curso → player de aula (`/plataforma/curso.html`) | Vídeo, materiais, comentários dos alunos |
| 60–65s | Mostra certificado (`/plataforma/certificado.html`) | Certificado gerado automaticamente ao concluir |

---

## 🎬 Vídeo 10 — Relatórios + Usuários/Permissões `videos/10-relatorios-usuarios.mp4`

**Duração:** ~65s
**Objetivo:** relatórios administrativos + o sistema de permissões granulares (diferencial técnico).

**URL inicial:** `/relatorios.html`

| Tempo | Ação | O que destacar |
|---|---|---|
| 0–10s | Página de relatórios: cards por categoria | Frequência, visitantes, financeiro, ministérios |
| 10–20s | Clica em **Frequência de cultos** | Gráfico por semana, drill-down por culto, exportar PDF |
| 20–30s | Volta → clica em **Visitantes** | Origem (bot, formulário, manual), conversão em membro |
| 30–40s | Abre `/usuarios.html` | Lista de usuários, roles (admin, líder, tesoureiro, ministro...) |
| 40–55s | Clica num usuário → mostra a matriz de permissões | **Grid página × aba × ação** (visualizar, criar, editar, excluir) |
| 55–65s | Mostra o toggle de cascata | Marcar permissão no ministério aplica em todas as sub-abas |

---

## Checklist antes de gravar

- [ ] Rodei `gerarDisponibilidadesDemo` (botão 🌱 na aba Pastoral) pra ter dados no vídeo 05
- [ ] O demo Supabase tem dados de exemplo suficientes (10 membros, 6 ministérios, 5 eventos, seed financeiro)
- [ ] Navegador em **modo anônimo** pra não vazar autofill/histórico pessoal
- [ ] Zoom da página em 100% (Ctrl+0)
- [ ] Notificações do sistema silenciadas
- [ ] Se aparecer prompt de "Instalar PWA", dispensar antes de gravar

## Checklist depois de gravar

- [ ] Arquivo salvo em `docs/videos/NN-nome.mp4`
- [ ] Tamanho verificado (idealmente < 10 MB por vídeo — comprimir com HandBrake se maior)
- [ ] Rodou uma vez pra conferir que não ficou nada indevido (dados reais, notificações, etc.)
- [ ] Commit e push
