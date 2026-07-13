// ========================================================
// usuarios.js — Gerenciamento de usuários
// Sua Igreja
// ========================================================

// Inventario de paginas/abas com gate granular consumido pelo modal.
// Fonte da verdade: <meta name="pagina-slug"> + <button class="aba-btn" data-aba=...>
// nos *.html, varridos por tools/gerar-paginas-manifest.mjs em build/dev.
// O objeto vem de paginas-abas.generated.js carregado antes deste script.
const PAGINAS_ABAS_GRANULAR = window.PAGINAS_ABAS_GRANULAR || {}

let usuariosCache  = []
let membrosCache   = []
let permUsuarioId  = null
let tipoAtual      = 'convite'

// Membro selecionado no modal de criação
let membroVinculado = null  // { id, nome }

// ── Pega o usuário logado via sessão ──────────────────────
async function getUsuarioLogado() {
  const { data } = await db.auth.getSession()
  return data?.session?.user || null
}

// ========================================================
// CARREGAR MEMBROS (para autocomplete)
// ========================================================
async function carregarMembrosCache() {
  const { data, error } = await db
    .from('membros')
    .select('id, nome, data_nascimento, status')
    .eq('status', 'Ativo')
    .order('nome')

  if (error) { console.error('Erro ao carregar membros:', error); return }
  membrosCache = data || []
}

// ========================================================
// CARREGAR USUÁRIOS
// ========================================================
async function carregarUsuarios() {
  const { data, error } = await db
    .from('perfis')
    .select('*')
    .order('nome')

  if (error) {
    console.error('Erro ao carregar usuários:', error)
    return
  }

  usuariosCache = data || []
  await renderizarUsuarios()
}

// ========================================================
// RENDERIZAR GRIDS
// ========================================================
async function renderizarUsuarios() {
  const ativos   = usuariosCache.filter(u =>  u.ativo)
  const inativos = usuariosCache.filter(u => !u.ativo)

  const usuarioLogado = await getUsuarioLogado()

  renderizarGrid('grid-ativos',   ativos,   false, usuarioLogado?.id)
  renderizarGrid('grid-inativos', inativos, true,  usuarioLogado?.id)
}

function renderizarGrid(gridId, lista, inativo, meuId) {
  const grid = document.getElementById(gridId)
  grid.innerHTML = ''

  if (lista.length === 0) {
    grid.innerHTML = `
      <div class="empty-usuarios" style="grid-column:1/-1;">
        <span>${inativo ? '😴' : '👥'}</span>
        ${inativo ? 'Nenhum usuário inativo.' : 'Nenhum usuário ativo cadastrado.'}
      </div>`
    return
  }

  lista.forEach(u => {
    const ehEuMesmo = u.id === meuId

    const inicial = (u.nome || u.email || '?')[0].toUpperCase()
    const roleMap = {
      admin:    { label: 'Admin',    css: 'role-admin'    },
      lider:    { label: 'Líder',    css: 'role-parcial'  },
      parcial:  { label: 'Parcial',  css: 'role-parcial'  },
      consulta: { label: 'Consulta', css: 'role-consulta' },
    }
    const role = roleMap[u.role] || roleMap.consulta

    const membroVinculo = u.membro_id
      ? (() => {
          const m = membrosCache.find(x => x.id === u.membro_id)
          return m
            ? `<div class="usuario-membro-vinculo">
                 👤 Membro: <strong>${m.nome}</strong>
               </div>`
            : `<div class="usuario-membro-vinculo">
                 👤 Membro: <strong>ID ${u.membro_id.slice(0,8)}…</strong>
               </div>`
        })()
      : `<div class="usuario-membro-vinculo sem-vinculo">
           ⚠️ Sem membro vinculado
         </div>`

    const card = document.createElement('div')
    card.className = `usuario-card${inativo ? ' inativo' : ''}`
    card.innerHTML = `
      <div class="usuario-card-header">
        <div class="usuario-avatar">${inicial}</div>
        <div class="usuario-info">
          <div class="usuario-nome">${u.nome}</div>
          <div class="usuario-email">${u.email}</div>
        </div>
        <span class="role-badge ${role.css}">${role.label}</span>
      </div>

      ${membroVinculo}

      <div class="usuario-acoes">
        ${u.role !== 'admin' ? `
          <button class="btn-perm"
            onclick="abrirModalPermissoes('${u.id}', '${u.nome.replace(/'/g,"\\'")}')">
            🔐 Permissões
          </button>` : ''}

        <button class="btn-perm" style="background:#f0f0ff; color:#5c5caa; border-color:#d0d0f0 !important;"
          onclick="abrirModalVincularMembro('${u.id}', '${u.nome.replace(/'/g,"\\'")}', '${u.membro_id || ''}')">
          🔗 Membro
        </button>

        ${!ehEuMesmo ? `
          <button class="btn-toggle-ativo"
            onclick="toggleAtivo('${u.id}', ${u.ativo})">
            ${u.ativo ? '🔴 Desativar' : '✅ Ativar'}
          </button>
          <button class="btn-del-user"
            onclick="excluirUsuario('${u.id}', '${u.nome.replace(/'/g,"\\'")}')">
            🗑️ Excluir
          </button>` : `
          <span style="font-size:12px;color:#aaa;padding:7px 0;">
            (sua conta)
          </span>`}
      </div>
    `
    grid.appendChild(card)
  })
}

// ========================================================
// TABS
// ========================================================
function mudarTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById(`tab-${tab}`).classList.add('active')
}

// ========================================================
// AUTOCOMPLETE DE MEMBRO NO MODAL DE CRIAÇÃO
// ========================================================
function filtrarMembrosBusca() {
  const termo = document.getElementById('input-busca-membro-usuario').value.trim().toLowerCase()
  const lista = document.getElementById('autocomplete-membro-lista')
  lista.innerHTML = ''
  lista.style.display = 'none'

  if (termo.length < 2) return

  const idsJaVinculados = usuariosCache
    .filter(u => u.membro_id)
    .map(u => u.membro_id)

  const resultados = membrosCache
    .filter(m =>
      m.nome.toLowerCase().includes(termo) &&
      !idsJaVinculados.includes(m.id)
    )
    .slice(0, 8)

  if (resultados.length === 0) {
    lista.innerHTML = `
      <div class="autocomplete-membro-item" style="color:#aaa; cursor:default;">
        Nenhum membro disponível encontrado
      </div>`
    lista.style.display = 'block'
    return
  }

  resultados.forEach(m => {
    const item = document.createElement('div')
    item.className = 'autocomplete-membro-item'
    item.innerHTML = `
      <span>${m.nome}</span>
      <small>${m.data_nascimento ? formatarDataBR(m.data_nascimento) : 'Sem data de nascimento'}</small>
    `
    item.addEventListener('mousedown', () => selecionarMembro(m))
    lista.appendChild(item)
  })

  lista.style.display = 'block'
}

function selecionarMembro(m) {
  membroVinculado = { id: m.id, nome: m.nome }

  document.getElementById('membro-selecionado-nome').textContent = m.nome
  document.getElementById('membro-selecionado-box').style.display = 'flex'
  document.getElementById('membro-busca-wrap').style.display = 'none'
  document.getElementById('autocomplete-membro-lista').style.display = 'none'
}

function limparMembroSelecionado() {
  membroVinculado = null
  document.getElementById('membro-selecionado-box').style.display = 'none'
  document.getElementById('membro-busca-wrap').style.display = 'block'
  document.getElementById('input-busca-membro-usuario').value = ''
  document.getElementById('autocomplete-membro-lista').style.display = 'none'
}

function formatarDataBR(data) {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

// ========================================================
// MODAL VINCULAR MEMBRO (em usuário já existente)
// ========================================================
let vinculandoUsuarioId = null

function abrirModalVincularMembro(userId, nomeUsuario, membroIdAtual) {
  vinculandoUsuarioId = userId

  const overlay = document.getElementById('modal-vincular-membro')
  document.getElementById('vincular-titulo').textContent = `🔗 Vincular membro — ${nomeUsuario}`

  vinculandoMembroSelecionado = null
  document.getElementById('vincular-membro-selecionado-box').style.display = 'none'
  document.getElementById('vincular-busca-wrap').style.display = 'block'
  document.getElementById('input-vincular-busca').value = ''
  document.getElementById('autocomplete-vincular-lista').style.display = 'none'

  if (membroIdAtual) {
    const m = membrosCache.find(x => x.id === membroIdAtual)
    if (m) selecionarMembroVincular(m)
  }

  overlay.classList.add('active')
}

function fecharModalVincular() {
  document.getElementById('modal-vincular-membro').classList.remove('active')
  vinculandoUsuarioId = null
  vinculandoMembroSelecionado = null
}

let vinculandoMembroSelecionado = null

function filtrarVincularBusca() {
  const termo = document.getElementById('input-vincular-busca').value.trim().toLowerCase()
  const lista = document.getElementById('autocomplete-vincular-lista')
  lista.innerHTML = ''
  lista.style.display = 'none'

  if (termo.length < 2) return

  const idsJaVinculados = usuariosCache
    .filter(u => u.membro_id && u.id !== vinculandoUsuarioId)
    .map(u => u.membro_id)

  const resultados = membrosCache
    .filter(m =>
      m.nome.toLowerCase().includes(termo) &&
      !idsJaVinculados.includes(m.id)
    )
    .slice(0, 8)

  if (resultados.length === 0) {
    lista.innerHTML = `
      <div class="autocomplete-membro-item" style="color:#aaa; cursor:default;">
        Nenhum membro disponível encontrado
      </div>`
    lista.style.display = 'block'
    return
  }

  resultados.forEach(m => {
    const item = document.createElement('div')
    item.className = 'autocomplete-membro-item'
    item.innerHTML = `
      <span>${m.nome}</span>
      <small>${m.data_nascimento ? formatarDataBR(m.data_nascimento) : 'Sem data de nascimento'}</small>
    `
    item.addEventListener('mousedown', () => selecionarMembroVincular(m))
    lista.appendChild(item)
  })

  lista.style.display = 'block'
}

function selecionarMembroVincular(m) {
  vinculandoMembroSelecionado = { id: m.id, nome: m.nome }
  document.getElementById('vincular-membro-nome').textContent = m.nome
  document.getElementById('vincular-membro-selecionado-box').style.display = 'flex'
  document.getElementById('vincular-busca-wrap').style.display = 'none'
  document.getElementById('autocomplete-vincular-lista').style.display = 'none'
}

function limparVincularMembro() {
  vinculandoMembroSelecionado = null
  document.getElementById('vincular-membro-selecionado-box').style.display = 'none'
  document.getElementById('vincular-busca-wrap').style.display = 'block'
  document.getElementById('input-vincular-busca').value = ''
  document.getElementById('autocomplete-vincular-lista').style.display = 'none'
}

async function salvarVinculoMembro() {
  if (!vinculandoUsuarioId) return

  const btn = document.getElementById('btn-salvar-vinculo')
  btn.disabled    = true
  btn.textContent = 'Salvando...'

  const { error } = await db
    .from('perfis')
    .update({ membro_id: vinculandoMembroSelecionado?.id ?? null })
    .eq('id', vinculandoUsuarioId)

  btn.disabled    = false
  btn.textContent = '💾 Salvar vínculo'

  if (error) {
    alert('Erro ao salvar vínculo: ' + error.message)
    console.error(error)
    return
  }

  fecharModalVincular()
  await carregarUsuarios()

  const toast = document.createElement('div')
  toast.textContent = vinculandoMembroSelecionado
    ? `✅ Membro "${vinculandoMembroSelecionado.nome}" vinculado!`
    : '✅ Vínculo removido!'
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    background:#2BBFB3; color:white;
    padding:12px 20px; border-radius:10px;
    font-size:14px; font-weight:600;
    box-shadow:0 4px 16px rgba(0,0,0,0.15);
    z-index:9999;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2500)
}

// ========================================================
// MODAL CRIAR USUÁRIO
// ========================================================
function abrirModalCriar() {
  tipoAtual       = 'convite'
  membroVinculado = null

  document.getElementById('btn-tipo-convite').classList.add('active')
  document.getElementById('btn-tipo-manual').classList.remove('active')
  document.getElementById('campo-senha-manual').style.display = 'none'
  document.getElementById('info-tipo').textContent =
    'O usuário receberá um e-mail com link para criar a própria senha.'
  document.getElementById('input-novo-nome').value   = ''
  document.getElementById('input-novo-email').value  = ''
  document.getElementById('input-novo-senha').value  = ''
  document.getElementById('input-novo-senha2').value = ''
  document.getElementById('input-novo-role').value   = 'consulta'

  limparMembroSelecionado()

  ocultarMsgCriar()
  document.getElementById('modal-criar').classList.add('active')
}

function fecharModalCriar() {
  document.getElementById('modal-criar').classList.remove('active')
}

function selecionarTipo(tipo) {
  tipoAtual = tipo
  const isBtnConvite = tipo === 'convite'

  document.getElementById('btn-tipo-convite')
    .classList.toggle('active', isBtnConvite)
  document.getElementById('btn-tipo-manual')
    .classList.toggle('active', !isBtnConvite)

  document.getElementById('campo-senha-manual').style.display =
    isBtnConvite ? 'none' : 'flex'

  document.getElementById('info-tipo').textContent = isBtnConvite
    ? 'O usuário receberá um e-mail com link para criar a própria senha.'
    : 'O administrador define a senha diretamente. O usuário pode alterá-la depois.'

  ocultarMsgCriar()
}

function toggleSenhaModal(inputId, btn) {
  const input = document.getElementById(inputId)
  input.type  = input.type === 'password' ? 'text' : 'password'
  btn.textContent = input.type === 'password' ? '👁️' : '🙈'
}

function mostrarMsgCriar(texto, tipo) {
  const el = document.getElementById('criar-msg')
  el.textContent   = texto
  el.className     = `msg-feedback ${tipo}`
  el.style.display = 'block'
}

function ocultarMsgCriar() {
  document.getElementById('criar-msg').style.display = 'none'
}

// ========================================================
// CRIAR USUÁRIO
// ========================================================
async function criarUsuario() {
  const nome  = document.getElementById('input-novo-nome').value.trim()
  const email = document.getElementById('input-novo-email').value.trim()
  const role  = document.getElementById('input-novo-role').value

  ocultarMsgCriar()

  if (!nome || !email) {
    mostrarMsgCriar('Preencha nome e e-mail.', 'erro')
    return
  }

  const btn = document.getElementById('btn-criar')
  btn.disabled    = true
  btn.textContent = 'Criando...'

  try {

    // ── MODO CONVITE ──────────────────────────────────────
    if (tipoAtual === 'convite') {

      const { data, error } = await db.functions.invoke('invite-user', {
        body: { email, nome, role }
      })

      if (error) throw error

      const userId = data?.user?.id

      if (userId && membroVinculado?.id) {
        await db.from('perfis').update({ membro_id: membroVinculado.id }).eq('id', userId)
      }

      mostrarMsgCriar(`✅ Convite enviado para ${email}!`, 'sucesso')

      setTimeout(async () => {
        fecharModalCriar()
        await carregarUsuarios()

        if (role !== 'admin') {
          const novoUser = usuariosCache.find(u => u.email === email)
          if (novoUser) {
            abrirModalPermissoes(novoUser.id, novoUser.nome, true)
          }
        }
      }, 1200)

    // ── MODO MANUAL ───────────────────────────────────────
    } else {
      const senha  = document.getElementById('input-novo-senha').value
      const senha2 = document.getElementById('input-novo-senha2').value

      if (!senha || senha.length < 6) {
        mostrarMsgCriar('A senha deve ter no mínimo 6 caracteres.', 'erro')
        btn.disabled = false; btn.textContent = 'Criar usuário'
        return
      }

      if (senha !== senha2) {
        mostrarMsgCriar('As senhas não coincidem.', 'erro')
        btn.disabled = false; btn.textContent = 'Criar usuário'
        return
      }

      const { data, error } = await db.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome, role },
          emailRedirectTo: window.location.origin + '/login.html'
        }
      })

      if (error) throw error

      const { error: errPerfil } = await db.from('perfis').upsert({
        id:        data.user.id,
        nome,
        email,
        role,
        ativo:     true,
        membro_id: membroVinculado?.id ?? null,
      }, { onConflict: 'id' })

      if (errPerfil) console.warn('Aviso ao criar perfil:', errPerfil)

      if (role !== 'admin') {
        fecharModalCriar()
        await carregarUsuarios()
        abrirModalPermissoes(data.user.id, nome, true)
      } else {
        mostrarMsgCriar(`✅ Usuário ${nome} criado com sucesso!`, 'sucesso')
        setTimeout(() => {
          fecharModalCriar()
          carregarUsuarios()
        }, 1800)
      }
    }

  } catch (err) {
    console.error('Erro ao criar usuário:', err)
    const msg = err.message?.includes('already registered')
      ? 'Este e-mail já está cadastrado.'
      : err.message?.includes('invalid')
      ? 'E-mail inválido.'
      : `Erro: ${err.message}`
    mostrarMsgCriar(msg, 'erro')
    btn.disabled    = false
    btn.textContent = 'Criar usuário'
  }
}

// ========================================================
// ATIVAR / DESATIVAR USUÁRIO
// ========================================================
async function toggleAtivo(id, ativoAtual) {
  const novoStatus = !ativoAtual
  const acao       = novoStatus ? 'ativar' : 'desativar'

  if (!confirm(`Deseja ${acao} este usuário?`)) return

  const { error } = await db
    .from('perfis')
    .update({ ativo: novoStatus })
    .eq('id', id)

  if (error) {
    alert('Erro ao atualizar usuário.')
    console.error(error)
    return
  }

  carregarUsuarios()
}

// ========================================================
// EXCLUIR USUÁRIO
// ========================================================
async function excluirUsuario(id, nome) {
  if (!confirm(`Deseja excluir permanentemente o usuário "${nome}"?\n\nEsta ação não pode ser desfeita.`)) return

  const { data, error } = await db.functions.invoke('delete-user', {
    body: { userId: id }
  })

  if (error) {
    alert('Erro ao excluir usuário: ' + error.message)
    console.error(error)
    return
  }

  const toast = document.createElement('div')
  toast.textContent = `🗑️ Usuário "${nome}" excluído com sucesso!`
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    background:#dc3545; color:white;
    padding:12px 20px; border-radius:10px;
    font-size:14px; font-weight:600;
    box-shadow:0 4px 16px rgba(0,0,0,0.15);
    z-index:9999;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2500)

  carregarUsuarios()
}

// ========================================================
// MODAL DE PERMISSÕES (granular: pagina × aba × acao)
// ========================================================
async function abrirModalPermissoes(userId, nome, novoUsuario = false) {
  permUsuarioId = userId

  document.getElementById('perm-titulo').textContent    = `🔐 Permissões — ${nome}`
  document.getElementById('perm-subtitulo').textContent = novoUsuario
    ? '🎉 Usuário criado! Defina agora as permissões de acesso.'
    : 'Defina o que este usuário pode fazer em cada página.'

  await montarSecaoGranular(userId)

  document.getElementById('modal-permissoes').classList.add('active')
}

// ========================================================
// SECAO PERMISSOES GRANULARES (por aba)
// ========================================================
async function montarSecaoGranular(userId) {
  const container = document.getElementById('perm-granular-paginas')
  if (!container) return
  container.innerHTML = ''

  // Carrega permissoes granulares do user
  const { data: permsGran } = await db
    .from('permissoes_granular')
    .select('pagina, aba, ver, adicionar, editar, excluir')
    .eq('user_id', userId)

  const mapa = {}
  ;(permsGran || []).forEach(p => {
    mapa[`${p.pagina}::${p.aba}`] = p
  })

  Object.entries(PAGINAS_ABAS_GRANULAR).forEach(([pagina, info]) => {
    const card = document.createElement('div')
    card.style.cssText =
      'border:1px solid #e5efed;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fbfffe;'

    // Auto-expande se ja tem alguma permissao salva nesta pagina
    const temAlguma = info.abas.some(aba => mapa[`${pagina}::${aba.slug}`])

    const linhasAbas = info.abas.map(aba => {
      const p = mapa[`${pagina}::${aba.slug}`] || {}
      return `
        <tr data-granular-row="${pagina}::${aba.slug}">
          <td style="padding-left:12px;color:#444;">${aba.label}</td>
          <td><input type="checkbox" data-granular="1"
            data-pagina="${pagina}" data-aba="${aba.slug}" data-acao="ver"
            ${p.ver       ? 'checked' : ''}
            onchange="onChangeGranularVer(this)" /></td>
          <td><input type="checkbox" data-granular="1"
            data-pagina="${pagina}" data-aba="${aba.slug}" data-acao="adicionar"
            ${p.adicionar ? 'checked' : ''}
            onchange="garantirVerGranular(this)" /></td>
          <td><input type="checkbox" data-granular="1"
            data-pagina="${pagina}" data-aba="${aba.slug}" data-acao="editar"
            ${p.editar    ? 'checked' : ''}
            onchange="garantirVerGranular(this)" /></td>
          <td><input type="checkbox" data-granular="1"
            data-pagina="${pagina}" data-aba="${aba.slug}" data-acao="excluir"
            ${p.excluir   ? 'checked' : ''}
            onchange="garantirVerGranular(this)" /></td>
        </tr>
      `
    }).join('')

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;"
        onclick="toggleCardGranular(this)">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="card-arrow" style="font-size:11px;color:#888;width:12px;display:inline-block;">${temAlguma ? '▼' : '▶'}</span>
          <strong style="color:#1a2e2d;font-size:14px;">${info.label}</strong>
        </div>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-secondary"
            style="padding:4px 10px;font-size:11px;"
            onclick="marcarTudoGranular('${pagina}', true)">Marcar tudo</button>
          <button type="button" class="btn btn-secondary"
            style="padding:4px 10px;font-size:11px;"
            onclick="marcarTudoGranular('${pagina}', false)">Limpar</button>
        </div>
      </div>
      <table class="perm-table" style="margin:8px 0 0;display:${temAlguma ? '' : 'none'};">
        <thead>
          <tr>
            <th style="width:40%;">Aba</th>
            <th>👁️ Ver</th>
            <th>➕ Adicionar</th>
            <th>✏️ Editar</th>
            <th>🗑️ Excluir</th>
          </tr>
        </thead>
        <tbody>${linhasAbas}</tbody>
      </table>
    `
    container.appendChild(card)
  })
}

// Fase 7.3 — toggle de expand/colapsa do card granular. Click no header
// (qualquer parte que nao seja botao Marcar tudo / Limpar) alterna a tabela.
function toggleCardGranular(header) {
  const card  = header.parentElement
  const table = card.querySelector('table')
  const arrow = header.querySelector('.card-arrow')
  if (!table || !arrow) return
  const aberto = table.style.display !== 'none'
  table.style.display = aberto ? 'none' : ''
  arrow.textContent   = aberto ? '▶'    : '▼'
}

// Ao desmarcar Ver de uma aba, zera as outras 3 acoes daquela aba.
// Ao marcar Ver, nada cascata (acoes ficam no estado anterior).
function onChangeGranularVer(checkbox) {
  if (checkbox.checked) return
  const pagina = checkbox.dataset.pagina
  const aba    = checkbox.dataset.aba
  document.querySelectorAll(
    `input[data-granular="1"][data-pagina="${pagina}"][data-aba="${aba}"]`
  ).forEach(c => c.checked = false)
}

// Marcar adicionar/editar/excluir implica ver=true (caso contrario, sem
// efeito pratico — fail-closed em temPermissaoAba ignora a acao quando
// ver=false).
function garantirVerGranular(checkbox) {
  if (!checkbox.checked) return
  const pagina = checkbox.dataset.pagina
  const aba    = checkbox.dataset.aba
  const verBox = document.querySelector(
    `input[data-granular="1"][data-pagina="${pagina}"][data-aba="${aba}"][data-acao="ver"]`
  )
  if (verBox) verBox.checked = true
}

function marcarTudoGranular(pagina, valor) {
  document.querySelectorAll(
    `input[data-granular="1"][data-pagina="${pagina}"]`
  ).forEach(c => c.checked = valor)
}

function fecharModalPermissoes() {
  document.getElementById('modal-permissoes').classList.remove('active')
  permUsuarioId = null
}

// ========================================================
// SALVAR PERMISSÕES
// ========================================================
async function salvarPermissoes() {
  if (!permUsuarioId) return

  const btn = document.getElementById('btn-salvar-perm')
  btn.disabled    = true
  btn.textContent = 'Salvando...'

  // Agrupa checkboxes por (pagina, aba) e faz upsert. Linhas com tudo
  // false ficam no banco (regra explicita de bloqueio); como o gate e
  // fail-closed em ausencia de chave, o efeito pratico e o mesmo.
  const mapaGran = {}
  document.querySelectorAll('input[data-granular="1"]').forEach(cb => {
    const pagina = cb.dataset.pagina
    const aba    = cb.dataset.aba
    const acao   = cb.dataset.acao
    const key    = `${pagina}::${aba}`
    if (!mapaGran[key]) {
      mapaGran[key] = {
        user_id: permUsuarioId, pagina, aba,
        ver: false, adicionar: false, editar: false, excluir: false,
      }
    }
    mapaGran[key][acao] = cb.checked
  })
  const rowsGran = Object.values(mapaGran)

  let errGran = null
  if (rowsGran.length) {
    ;({ error: errGran } = await db.from('permissoes_granular')
      .upsert(rowsGran, { onConflict: 'user_id,pagina,aba' }))
  }

  btn.disabled    = false
  btn.textContent = '💾 Salvar permissões'

  if (errGran) {
    alert('Erro ao salvar permissões.')
    console.error(errGran)
    return
  }

  fecharModalPermissoes()

  const toast = document.createElement('div')
  toast.textContent = '✅ Permissões salvas!'
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    background:#2BBFB3; color:white;
    padding:12px 20px; border-radius:10px;
    font-size:14px; font-weight:600;
    box-shadow:0 4px 16px rgba(0,0,0,0.15);
    z-index:9999; animation:fadeIn 0.3s ease;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2500)
}

// ========================================================
// INIT
// ========================================================
async function init() {
  await carregarMembrosCache()
  await carregarUsuarios()

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#membro-busca-wrap')) {
      document.getElementById('autocomplete-membro-lista').style.display = 'none'
    }
    if (!e.target.closest('#vincular-busca-wrap')) {
      const l = document.getElementById('autocomplete-vincular-lista')
      if (l) l.style.display = 'none'
    }
  })
}

init()