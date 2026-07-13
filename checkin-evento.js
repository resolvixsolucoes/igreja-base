// =============================================================
//  checkin-evento.js — Check-in via QR (autenticado)
// =============================================================
//
// Dois modos:
//
// 1) QR GERAL (impresso na entrada, permanente):
//    URL: /checkin-evento.html         (sem params)
//    Página descobre via auth quem é o vol e busca escalas de hoje.
//      0 → mensagem "não escalado hoje"
//      1 → marca automaticamente
//      2+ → mostra picker (raro)
//
// 2) QR ESPECÍFICO de evento:
//    URL: /checkin-evento.html?evento=UUID
//    Marca direto pra esse evento (continua funcionando).

const _$ = id => document.getElementById(id)
const _icone     = _$('icone')
const _titulo    = _$('titulo')
const _subtitulo = _$('subtitulo')
const _conteudo  = _$('conteudo')

const _params  = new URLSearchParams(location.search)
const _evento  = (_params.get('evento') || '').trim()

function fmtDataLong(dataStr) {
  if (!dataStr) return ''
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })
}

function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR',
    { hour: '2-digit', minute: '2-digit' })
}

function mostrarErro(titulo, msg) {
  _icone.textContent     = '❌'
  _titulo.textContent    = titulo
  _subtitulo.textContent = ''
  _conteudo.innerHTML    = '<div class="erro">' + msg + '</div>'
}

function mostrarSucesso(reg, jaMarcado) {
  _icone.textContent     = '✅'
  _titulo.textContent    = jaMarcado
    ? 'Você já está com presença marcada'
    : 'Presença confirmada!'
  _subtitulo.textContent = 'Bem-vindo(a), ' + (reg.voluntario_nome || 'voluntário') + '. Bom serviço!'
  _conteudo.innerHTML =
    '<div class="info-bloco">' +
      '<span class="label">Evento</span>' +
      '<span class="valor">' + reg.evento_nome + '</span>' +
      '<span class="data">' + fmtDataLong(reg.evento_data) +
        (reg.evento_hora ? ' · ' + reg.evento_hora.slice(0, 5) : '') + '</span>' +
    '</div>' +
    '<div class="info-bloco" style="background:#f0fdf4;border-color:#bbf7d0;">' +
      '<span class="label" style="color:#15803d;">Check-in</span>' +
      '<span class="valor" style="color:#166534;">✓ ' + fmtHora(reg.checkin_em) + '</span>' +
    '</div>'
}

function mostrarPicker(escalas) {
  _icone.textContent     = '🤔'
  _titulo.textContent    = 'Você tem mais de uma escala hoje'
  _subtitulo.textContent = 'Selecione pra qual evento marcar presença:'
  const itens = escalas.map(e => {
    const hora = e.evento_hora ? e.evento_hora.slice(0, 5) : '—'
    const status = e.ja_marcado
      ? `<span style="color:#16a34a;font-size:12px;font-weight:700;">✓ marcado ${e.checkin_em ? fmtHora(e.checkin_em) : ''}</span>`
      : '<span style="color:#4a6a35;font-size:12px;font-weight:600;">marcar →</span>'
    return `
      <button class="picker-item" onclick="marcarEvento('${e.evento_id}')"
        style="display:flex;align-items:center;justify-content:space-between;
               width:100%;padding:14px 16px;margin:0;
               border:1px solid #d0f0ee;border-radius:12px;background:#f7faee;
               cursor:pointer;text-align:left;font-family:inherit;">
        <div>
          <div style="font-weight:700;color:#242e1a;font-size:15px;">${e.evento_nome}</div>
          <div style="color:#888;font-size:12px;">${hora}</div>
        </div>
        ${status}
      </button>`
  }).join('')
  _conteudo.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:10px;">' + itens + '</div>'
}

window.marcarEvento = async function(eventoId) {
  _icone.textContent     = '⏳'
  _titulo.textContent    = 'Registrando…'
  _subtitulo.textContent = ''
  _conteudo.innerHTML    = ''
  const { data, error } = await db.rpc('escala_voluntario_checkin_por_evento',
    { p_evento_id: eventoId })
  if (error) { mostrarErro('Não foi possível fazer check-in', error.message || 'Erro.'); return }
  const reg = Array.isArray(data) ? data[0] : data
  if (!reg) { mostrarErro('Resposta inesperada', 'Tente novamente.'); return }
  mostrarSucesso(reg, !!reg.ja_marcado)
}

async function carregar() {
  // Garante sessão; se não tiver, manda pro login com returnTo
  const { data: { session } } = await db.auth.getSession()
  if (!session) {
    const url = location.pathname + location.search
    location.href = 'login.html?returnTo=' + encodeURIComponent(url)
    return
  }

  // Modo 2: QR específico de evento
  if (_evento) {
    return marcarEvento(_evento)
  }

  // Modo 1: QR geral — busca escalas de hoje do voluntário autenticado
  const { data, error } = await db.rpc('escala_voluntario_minhas_escalas_hoje')
  if (error) {
    mostrarErro('Não foi possível verificar suas escalas', error.message || 'Erro.')
    return
  }

  const escalas = data || []
  if (!escalas.length) {
    _icone.textContent     = '🤷'
    _titulo.textContent    = 'Nenhuma escala hoje'
    _subtitulo.textContent = 'Você não está escalado(a) para nenhum evento de hoje.'
    _conteudo.innerHTML    =
      '<div class="alerta">Se você acha que isso é um engano, fale com a liderança do seu ministério.</div>'
    return
  }

  if (escalas.length === 1) {
    return marcarEvento(escalas[0].evento_id)
  }

  // 2+: mostra picker
  mostrarPicker(escalas)
}

carregar()
