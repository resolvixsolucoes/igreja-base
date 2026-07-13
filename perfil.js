// ================================================================
//  perfil.js — Meu Perfil · Ministério Semente
// ================================================================

const BUCKET_AVATARES = 'avatares'

let fotoArquivo    = null   // File selecionado ainda não enviado
let fotoUrlAtual   = null   // URL atual do avatar

// ================================================================
//  INIT — aguarda auth.js carregar o perfil
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // AUTH é preenchido de forma assíncrona pelo auth.js
  // Aguarda até que AUTH.perfil esteja disponível
  const aguardar = setInterval(() => {
    if (AUTH.perfil && AUTH.user) {
      clearInterval(aguardar)
      carregarPerfil()
    }
  }, 80)
})

// ================================================================
//  CARREGAR PERFIL NA TELA
// ================================================================
async function carregarPerfil() {
  const perfil = AUTH.perfil
  const user   = AUTH.user

  // ── Avatar ───────────────────────────────────────────
  fotoUrlAtual = perfil.foto_url || null
  renderAvatar(perfil.nome, fotoUrlAtual)

  // ── Cabeçalho ────────────────────────────────────────
  document.getElementById('perfil-nome-display').textContent = perfil.nome  || '—'
  document.getElementById('perfil-email-display').textContent = perfil.email || user.email || '—'

  const badge = document.getElementById('perfil-role-badge')
  badge.textContent = perfil.role === 'admin' ? '👑 Administrador' : '👤 ' + (perfil.role || 'Usuário')
  if (perfil.role === 'admin') badge.classList.add('admin')

  // ── Dados pessoais ────────────────────────────────────
  document.getElementById('inp-pf-nome').value  = perfil.nome  || ''
  document.getElementById('inp-pf-email').value = perfil.email || user.email || ''
  document.getElementById('inp-pf-role').value  =
    perfil.role === 'admin' ? 'Administrador' : (perfil.role || 'Usuário')

  // ── Informações da conta ──────────────────────────────
  document.getElementById('info-id').textContent     = user.id || '—'
  document.getElementById('info-status').textContent = perfil.ativo ? '✅ Ativa' : '❌ Desativada'

  document.getElementById('info-criado').textContent = perfil.created_at
    ? new Date(perfil.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '—'

  document.getElementById('info-ultimo-acesso').textContent = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '—'
}

// ================================================================
//  RENDER AVATAR
// ================================================================
function renderAvatar(nome, url) {
  const wrap    = document.getElementById('avatar-preview')
  const inicial = document.getElementById('avatar-inicial')

  if (url) {
    wrap.innerHTML  = `<img src="${url}" alt="Avatar" />`
  } else {
    wrap.innerHTML  = ''
    inicial.textContent = (nome || '?')[0].toUpperCase()
    wrap.appendChild(inicial)
  }
}

// ================================================================
//  PREVIEW DA FOTO ANTES DE ENVIAR
// ================================================================
function previewAvatar(event) {
  const file = event.target.files[0]
  if (!file) return

  // Valida tamanho (2MB)
  if (file.size > 2 * 1024 * 1024) {
    toast('⚠️ A imagem deve ter no máximo 2MB.', '#e74c3c')
    event.target.value = ''
    return
  }

  // Valida tipo
  if (!file.type.startsWith('image/')) {
    toast('⚠️ Selecione um arquivo de imagem válido.', '#e74c3c')
    event.target.value = ''
    return
  }

  fotoArquivo = file

  const reader = new FileReader()
  reader.onload = (e) => {
    const wrap = document.getElementById('avatar-preview')
    wrap.innerHTML = `<img src="${e.target.result}" alt="Preview" />`
  }
  reader.readAsDataURL(file)

  // Exibe botões de confirmação
  const actions = document.getElementById('avatar-actions')
  actions.style.display = 'flex'
}

// ================================================================
//  CANCELAR FOTO
// ================================================================
function cancelarFoto() {
  fotoArquivo = null
  document.getElementById('inp-avatar').value = ''
  document.getElementById('avatar-actions').style.display = 'none'
  renderAvatar(AUTH.perfil.nome, fotoUrlAtual)
}

// ================================================================
//  SALVAR FOTO — faz upload no Supabase Storage
// ================================================================
async function salvarFoto() {
  if (!fotoArquivo) return

  const user     = AUTH.user
  const ext      = fotoArquivo.name.split('.').pop()
  const caminho  = `${user.id}/avatar.${ext}`

  // Upload (upsert = substitui se já existir)
  const { error: errUpload } = await db.storage
    .from(BUCKET_AVATARES)
    .upload(caminho, fotoArquivo, { upsert: true, contentType: fotoArquivo.type })

  if (errUpload) {
    console.error(errUpload)
    toast('❌ Erro ao enviar a foto. Tente novamente.', '#e74c3c')
    return
  }

  // Pega URL pública
  const { data: urlData } = db.storage
    .from(BUCKET_AVATARES)
    .getPublicUrl(caminho)

  // Adiciona cache-buster para forçar atualização do browser
  const urlPublica = urlData.publicUrl + '?t=' + Date.now()

  // Salva URL na tabela perfis
  const { error: errUpdate } = await db
    .from('perfis')
    .update({ foto_url: urlData.publicUrl })
    .eq('id', user.id)

  if (errUpdate) {
    console.error(errUpdate)
    toast('❌ Erro ao salvar URL da foto.', '#e74c3c')
    return
  }

  // Atualiza cache local
  AUTH.perfil.foto_url = urlData.publicUrl
  fotoUrlAtual         = urlData.publicUrl
  fotoArquivo          = null

  // Atualiza avatar na tela com cache-buster
  const wrap = document.getElementById('avatar-preview')
  wrap.innerHTML = `<img src="${urlPublica}" alt="Avatar" />`

  document.getElementById('inp-avatar').value       = ''
  document.getElementById('avatar-actions').style.display = 'none'

  // Atualiza ícone da sidebar se existir
  atualizarAvatarSidebar(urlPublica)

  toast('✅ Foto atualizada com sucesso!')
}

// ================================================================
//  ATUALIZA AVATAR NA SIDEBAR (se tiver foto)
// ================================================================
function atualizarAvatarSidebar(url) {
  const icone = document.querySelector('.sidebar-user-icon')
  if (!icone) return
  icone.innerHTML = `
    <img src="${url}" alt="Avatar"
      style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
  `
}

// ================================================================
//  SALVAR DADOS PESSOAIS (nome)
// ================================================================
async function salvarDados() {
  const nome = document.getElementById('inp-pf-nome').value.trim()

  if (!nome) {
    toast('⚠️ O nome não pode ficar vazio.', '#e74c3c')
    document.getElementById('inp-pf-nome').classList.add('erro')
    return
  }

  document.getElementById('inp-pf-nome').classList.remove('erro')

  const { error } = await db
    .from('perfis')
    .update({ nome })
    .eq('id', AUTH.user.id)

  if (error) {
    console.error(error)
    toast('❌ Erro ao salvar dados.', '#e74c3c')
    return
  }

  // Atualiza cache local
  AUTH.perfil.nome = nome

  // Atualiza displays na página
  document.getElementById('perfil-nome-display').textContent = nome

  // Atualiza nome na sidebar
  const nomeEl = document.querySelector('.sidebar-user-nome')
  if (nomeEl) nomeEl.textContent = nome

  toast('✅ Dados salvos com sucesso!')
}

// ================================================================
//  AVALIAR FORÇA DA SENHA
// ================================================================
function avaliarForcaSenha(senha) {
  const bars  = ['bar1','bar2','bar3','bar4']
  const label = document.getElementById('forca-label')

  let forca = 0
  if (senha.length >= 8)              forca++
  if (/[A-Z]/.test(senha))           forca++
  if (/[0-9]/.test(senha))           forca++
  if (/[^A-Za-z0-9]/.test(senha))    forca++

  const cores  = ['#e74c3c','#e67e22','#f1c40f','#2ecc71']
  const labels = ['Muito fraca','Fraca','Média','Forte']

  bars.forEach((id, i) => {
    const el = document.getElementById(id)
    el.style.background = i < forca ? cores[forca - 1] : '#eee'
  })

  label.textContent = senha.length ? labels[forca - 1] || 'Muito fraca' : ''
  label.style.color = forca > 0 ? cores[forca - 1] : '#bbb'

  // Retorna nível numérico para validação
  return forca
}

// ================================================================
//  VERIFICAR CONFIRMAÇÃO DE SENHA EM TEMPO REAL
// ================================================================
function verificarConfirmacao() {
  const nova  = document.getElementById('inp-pf-senha-nova').value
  const conf  = document.getElementById('inp-pf-senha-conf').value
  const erro  = document.getElementById('senha-conf-erro')

  if (conf && nova !== conf) {
    erro.style.display = 'block'
    document.getElementById('inp-pf-senha-conf').classList.add('erro')
  } else {
    erro.style.display = 'none'
    document.getElementById('inp-pf-senha-conf').classList.remove('erro')
  }
}

// ================================================================
//  LIMPAR CAMPOS DE SENHA
// ================================================================
function limparCamposSenha() {
  document.getElementById('inp-pf-senha-atual').value = ''
  document.getElementById('inp-pf-senha-nova').value  = ''
  document.getElementById('inp-pf-senha-conf').value  = ''
  document.getElementById('senha-conf-erro').style.display = 'none'
  document.getElementById('inp-pf-senha-nova').classList.remove('erro')
  document.getElementById('inp-pf-senha-conf').classList.remove('erro')
  ;['bar1','bar2','bar3','bar4'].forEach(id => {
    document.getElementById(id).style.background = '#eee'
  })
  document.getElementById('forca-label').textContent = ''
}

// ================================================================
//  ALTERAR SENHA
// ================================================================
async function alterarSenha() {
  const senhaAtual = document.getElementById('inp-pf-senha-atual').value
  const senhaNova  = document.getElementById('inp-pf-senha-nova').value
  const senhaConf  = document.getElementById('inp-pf-senha-conf').value

  // Validações
  if (!senhaAtual) {
    toast('⚠️ Informe a senha atual.', '#e74c3c')
    document.getElementById('inp-pf-senha-atual').focus()
    return
  }

  if (!senhaNova) {
    toast('⚠️ Informe a nova senha.', '#e74c3c')
    document.getElementById('inp-pf-senha-nova').focus()
    return
  }

  const forca = avaliarForcaSenha(senhaNova)
  if (forca < 2) {
    toast('⚠️ A nova senha é muito fraca. Use ao menos 8 caracteres com letras e números.', '#e74c3c')
    document.getElementById('inp-pf-senha-nova').focus()
    return
  }

  if (senhaNova !== senhaConf) {
    toast('⚠️ As senhas não coincidem.', '#e74c3c')
    document.getElementById('inp-pf-senha-conf').focus()
    return
  }

  if (senhaNova === senhaAtual) {
    toast('⚠️ A nova senha deve ser diferente da atual.', '#e74c3c')
    return
  }

  // Reautentica para verificar senha atual
  const email = AUTH.user.email
  const { error: errLogin } = await db.auth.signInWithPassword({
    email,
    password: senhaAtual,
  })

  if (errLogin) {
    toast('❌ Senha atual incorreta.', '#e74c3c')
    document.getElementById('inp-pf-senha-atual').classList.add('erro')
    document.getElementById('inp-pf-senha-atual').focus()
    return
  }

  document.getElementById('inp-pf-senha-atual').classList.remove('erro')

  // Altera a senha
  const { error: errUpdate } = await db.auth.updateUser({ password: senhaNova })

  if (errUpdate) {
    console.error(errUpdate)
    toast('❌ Erro ao alterar a senha. Tente novamente.', '#e74c3c')
    return
  }

  limparCamposSenha()
  toast('✅ Senha alterada com sucesso! 🔑')
}

// ================================================================
//  TOAST
// ================================================================
function toast(msg, cor = '#6b8e4e') {
  const el = document.getElementById('perfil-toast')
  el.textContent   = msg
  el.style.background = cor
  el.style.display    = 'block'
  el.style.animation  = 'none'
  void el.offsetWidth
  el.style.animation  = 'pfToast .3s ease'
  clearTimeout(el._timer)
  el._timer = setTimeout(() => { el.style.display = 'none' }, 3500)
}
