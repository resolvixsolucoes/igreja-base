// plataforma-auth.js
// Guard de autenticação para todas as páginas da plataforma de cursos.
// Inclua APÓS supabase.js em cada página da plataforma.

window.ALUNO = {
  user:      null,
  perfil:    null,
  isMembro:  false,
}

;(async function initPlataformaAuth() {
  const { data: { session } } = await db.auth.getSession()

  if (!session) {
    window.location.href = '/cursos-login.html'
    return
  }

  const { data: aluno, error } = await db
    .from('alunos')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error || !aluno || !aluno.ativo) {
    window.location.href = '/cursos-login.html'
    return
  }

  ALUNO.user     = session.user
  ALUNO.perfil   = aluno
  ALUNO.isMembro = aluno.is_membro

  // Preenche nome e avatar no header se existirem no DOM
  const nomeEl = document.getElementById('plat-user-nome')
  const avatarEl = document.getElementById('plat-user-avatar')
  if (nomeEl) nomeEl.textContent = aluno.nome?.split(' ')[0] || 'Aluno'
  if (avatarEl) {
    if (aluno.foto_url) {
      avatarEl.innerHTML = `<img src="${aluno.foto_url}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    } else {
      avatarEl.textContent = (aluno.nome || 'A')[0].toUpperCase()
    }
  }

  // Dispara evento para que a página saiba que auth está pronta
  document.dispatchEvent(new CustomEvent('plataforma:ready', { detail: { aluno } }))
})()

// ── LOGOUT ────────────────────────────────────────────────────
async function platLogout() {
  await db.auth.signOut()
  window.location.href = '/cursos-login.html'
}

// ── VERIFICA SE ALUNO TEM MATRÍCULA ATIVA ────────────────────
async function temMatricula(cursoId) {
  const { data } = await db
    .from('matriculas_lms')
    .select('id, tipo_acesso, status')
    .eq('aluno_id', ALUNO.user.id)
    .eq('curso_id', cursoId)
    .in('status', ['ativa', 'concluida'])
    .maybeSingle()
  return data || null
}

// ── MATRICULAR (membro = gratuito, outros = pagamento) ────────
async function matricularAluno(cursoId, curso) {
  if (!ALUNO.user) return { ok: false, motivo: 'sem_sessao' }

  // Já matriculado?
  const existente = await temMatricula(cursoId)
  if (existente) return { ok: true, matricula: existente, ja_existia: true }

  const tipoAcesso = ALUNO.isMembro ? 'membro'
    : curso.preco === 0              ? 'gratuito'
    : 'pago'

  if (tipoAcesso === 'pago') {
    // Retorna sinalização para a página iniciar fluxo de pagamento
    return { ok: false, motivo: 'pagamento_necessario', preco: curso.preco }
  }

  const { data, error } = await db.from('matriculas_lms').insert({
    aluno_id:    ALUNO.user.id,
    curso_id:    cursoId,
    tipo_acesso: tipoAcesso,
    status:      'ativa',
  }).select().single()

  if (error) return { ok: false, motivo: 'erro_db', detail: error.message }
  return { ok: true, matricula: data }
}

// ── MARCAR AULA COMO CONCLUÍDA ────────────────────────────────
async function marcarAulaConcluida(matriculaId, aulaId, percentual = 100) {
  await db.from('progresso_aulas_lms').upsert({
    matricula_id:        matriculaId,
    aula_id:             aulaId,
    concluida:           percentual >= 90,
    percentual_assistido: percentual,
  }, { onConflict: 'matricula_id,aula_id' })
}

// ── CALCULAR PROGRESSO DO CURSO ───────────────────────────────
async function calcularProgresso(matriculaId, totalAulas) {
  if (!totalAulas) return 0
  const { count } = await db
    .from('progresso_aulas_lms')
    .select('*', { count: 'exact', head: true })
    .eq('matricula_id', matriculaId)
    .eq('concluida', true)
  return Math.round(((count || 0) / totalAulas) * 100)
}
