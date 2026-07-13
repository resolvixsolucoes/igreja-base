// ===== DETECTA SE É FLUXO DE CONVITE / RESET / CONFIRMACAO =====
window.addEventListener('load', async () => {
  const hash   = window.location.hash
  const params = new URLSearchParams(hash.replace('#', '?'))
  const tipo   = params.get('type')
  const erroDesc = params.get('error_description') || params.get('error')

  // Erro vindo do verify endpoint (link expirado, já usado, etc)
  if (erroDesc) {
    history.replaceState(null, '', window.location.pathname)
    mostrarMsg('login-erro', '❌ ' + decodeURIComponent(erroDesc.replace(/\+/g, ' ')), 'erro')
    return
  }

  if (tipo === 'invite' || tipo === 'recovery') {
    const { data: { session } } = await db.auth.getSession()

    if (session) {
      mostrarTela('tela-nova-senha')
    } else {
      try {
        const token = params.get('access_token')

        if (token) {
          const { error } = await db.auth.setSession({
            access_token:  token,
            refresh_token: params.get('refresh_token') || '',
          })

          if (!error) {
            mostrarTela('tela-nova-senha')
          } else {
            mostrarMsg('login-erro', '❌ Link inválido ou expirado. Solicite um novo.', 'erro')
          }
        }
      } catch (e) {
        console.error('Erro ao processar token:', e)
      }
    }
    return
  }

  // Confirmação de e-mail (signup) — Supabase já validou o token e redireciona
  // pra cá. Mostra banner de sucesso e auto-loga se a sessão veio no hash.
  if (tipo === 'signup' || tipo === 'email_change' || tipo === 'magiclink') {
    history.replaceState(null, '', window.location.pathname)
    const msg = tipo === 'email_change'
      ? '✅ E-mail alterado com sucesso!'
      : '✅ E-mail confirmado com sucesso! Bem-vindo(a) à Ministério Semente.'
    mostrarMsg('login-erro', msg, 'sucesso')

    // Se o hash trouxe access_token, a sessão já está ativa → redireciona.
    const accessToken = params.get('access_token')
    if (accessToken) {
      try {
        await db.auth.setSession({
          access_token:  accessToken,
          refresh_token: params.get('refresh_token') || '',
        })
      } catch (e) { console.warn('setSession falhou:', e) }
      setTimeout(() => { window.location.href = 'dashboard.html' }, 1800)
    }
  }
})

// ===== ALTERNAR TELAS =====
function mostrarTela(id) {
  ['tela-login', 'tela-esqueci', 'tela-nova-senha'].forEach(t => {
    document.getElementById(t).style.display = t === id ? 'block' : 'none'
  })
}

// ===== TOGGLE MOSTRAR/OCULTAR SENHA =====
function toggleSenha(inputId, btn) {
  const input = document.getElementById(inputId)
  if (input.type === 'password') {
    input.type = 'text'
    btn.textContent = '🙈'
  } else {
    input.type = 'password'
    btn.textContent = '👁️'
  }
}

// ===== MOSTRAR MENSAGEM =====
function mostrarMsg(elId, texto, tipo = 'erro') {
  const el = document.getElementById(elId)
  el.textContent = texto
  el.className = `erro-msg ${tipo}`
  el.style.display = 'block'
}

function ocultarMsg(elId) {
  const el = document.getElementById(elId)
  el.style.display = 'none'
}

// ===== FAZER LOGIN =====
async function fazerLogin() {
  const email = document.getElementById('input-email').value.trim()
  const senha = document.getElementById('input-senha').value

  ocultarMsg('login-erro')

  if (!email || !senha) {
    mostrarMsg('login-erro', 'Preencha e-mail e senha.', 'erro')
    return
  }

  const btn = document.getElementById('btn-entrar')
  btn.disabled = true
  btn.textContent = 'Entrando...'

  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })

  if (error) {
    btn.disabled = false
    btn.textContent = 'Entrar'

    const msg = error.message.includes('Invalid login')
      ? 'E-mail ou senha incorretos.'
      : error.message.includes('Email not confirmed')
      ? 'Confirme seu e-mail antes de entrar.'
      : 'Erro ao fazer login. Tente novamente.'

    mostrarMsg('login-erro', msg, 'erro')
    return
  }

  const { data: perfil } = await db
    .from('perfis')
    .select('ativo, role')
    .eq('id', data.user.id)
    .single()

  if (perfil && !perfil.ativo) {
    await db.auth.signOut()
    btn.disabled = false
    btn.textContent = 'Entrar'
    mostrarMsg('login-erro', 'Sua conta está desativada. Contate o administrador.', 'erro')
    return
  }

  // Se veio de uma URL protegida (ex: ?returnTo=/checkin-evento.html?evento=...),
  // volta pra ela ao invés do dashboard. Só aceita paths relativos pra evitar
  // open-redirect.
  const _ret = new URLSearchParams(location.search).get('returnTo')
  if (_ret && _ret.startsWith('/') && !_ret.startsWith('//')) {
    window.location.href = _ret
    return
  }
  window.location.href = 'dashboard.html'  // ← era index.html
}

// ===== ENVIAR LINK DE RESET =====
async function enviarReset() {
  const email = document.getElementById('input-email-reset').value.trim()
  ocultarMsg('reset-msg')

  if (!email) {
    mostrarMsg('reset-msg', 'Informe seu e-mail.', 'erro')
    return
  }

  const btn = document.getElementById('btn-reset')
  btn.disabled = true
  btn.textContent = 'Enviando...'

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html'
  })

  btn.disabled = false
  btn.textContent = 'Enviar link'

  if (error) {
    mostrarMsg('reset-msg', 'Erro ao enviar e-mail. Verifique o endereço.', 'erro')
  } else {
    mostrarMsg('reset-msg', '✅ Link enviado! Verifique sua caixa de entrada.', 'sucesso')
  }
}

// ===== DEFINIR NOVA SENHA (convite ou reset) =====
async function definirNovaSenha() {
  const nova     = document.getElementById('input-nova-senha').value
  const confirma = document.getElementById('input-confirma-senha').value
  ocultarMsg('nova-senha-msg')

  if (!nova || nova.length < 6) {
    mostrarMsg('nova-senha-msg', 'A senha deve ter no mínimo 6 caracteres.', 'erro')
    return
  }

  if (nova !== confirma) {
    mostrarMsg('nova-senha-msg', 'As senhas não coincidem.', 'erro')
    return
  }

  const btn = document.getElementById('btn-nova-senha')
  btn.disabled = true
  btn.textContent = 'Salvando...'

  const { error } = await db.auth.updateUser({ password: nova })

  if (error) {
    btn.disabled = false
    btn.textContent = 'Salvar senha e entrar'
    mostrarMsg('nova-senha-msg', 'Erro ao definir senha. O link pode ter expirado. Solicite um novo.', 'erro')
    return
  }

  mostrarMsg('nova-senha-msg', '✅ Senha alterada com sucesso! Redirecionando...', 'sucesso')
  setTimeout(() => { window.location.href = 'dashboard.html' }, 1500)  // ← era index.html
}
