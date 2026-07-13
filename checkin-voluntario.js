// =============================================================
//  checkin-voluntario.js — Auto check-in via token (caminho B)
// =============================================================
//
// Voluntário abre o link/QR ?token=XXX, vê os dados da escala
// e clica num botão grande "Estou presente". A RPC valida que é
// o dia do evento e marca checkin_em = now().
//
// Sem auth: o token já é credencial pessoal. O `escala_voluntario_checkin`
// está exposto a `anon`.

const _$ = id => document.getElementById(id)

const _icone     = _$('icone')
const _titulo    = _$('titulo')
const _subtitulo = _$('subtitulo')
const _conteudo  = _$('conteudo')

const _params = new URLSearchParams(location.search)
const _token  = (_params.get('token') || '').trim()

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

function mostrarSucesso(nome, evNome, evData, hora) {
  _icone.textContent     = '✅'
  _titulo.textContent    = 'Presença registrada!'
  _subtitulo.textContent = 'Obrigado por servir, ' + (nome || 'voluntário') + '.'
  _conteudo.innerHTML =
    '<div class="info-bloco">' +
      '<span class="label">Evento</span>' +
      '<span class="valor">' + evNome + '</span>' +
      '<span class="data">' + fmtDataLong(evData) + '</span>' +
    '</div>' +
    '<div class="info-bloco" style="background:#f0fdf4;border-color:#bbf7d0;">' +
      '<span class="label" style="color:#15803d;">Check-in</span>' +
      '<span class="valor" style="color:#166534;">✓ ' + hora + '</span>' +
    '</div>'
}

async function carregar() {
  if (!_token) {
    mostrarErro('Link inválido',
      'Este link não tem token. Use o link que você recebeu pelo WhatsApp.')
    return
  }

  // Busca a escala pra mostrar dados antes de marcar
  const { data: escala, error } = await db
    .from('ministerio_escala')
    .select('id, status, checkin_em, eventos_igreja(nome, data, hora), voluntarios(nome)')
    .eq('token', _token)
    .maybeSingle()

  if (error || !escala) {
    mostrarErro('Link inválido ou expirado',
      'Não encontramos a escala. Confirme com o líder se o link está correto.')
    return
  }

  const ev      = escala.eventos_igreja
  const volNome = escala.voluntarios?.nome || 'Voluntário'

  // Já fez check-in? Só mostra confirmação.
  if (escala.checkin_em) {
    mostrarSucesso(volNome, ev?.nome || 'Evento', ev?.data, fmtHora(escala.checkin_em))
    return
  }

  // Verifica data do evento (compara em São Paulo localtime)
  const hoje = new Date()
  const hojeStr = hoje.getFullYear() + '-' +
    String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoje.getDate()).padStart(2, '0')

  const ehHoje = ev?.data === hojeStr

  _icone.textContent     = ehHoje ? '🙌' : '📅'
  _titulo.textContent    = 'Olá, ' + volNome + '!'
  _subtitulo.textContent = ehHoje
    ? 'Confirme sua presença abaixo.'
    : 'Seu check-in só fica disponível no dia do evento.'

  let html =
    '<div class="info-bloco">' +
      '<span class="label">Evento</span>' +
      '<span class="valor">' + (ev?.nome || '—') + '</span>' +
      '<span class="data">' + fmtDataLong(ev?.data) +
        (ev?.hora ? ' · ' + ev.hora.slice(0, 5) : '') + '</span>' +
    '</div>'

  if (ehHoje) {
    html += '<button id="btn-presente" class="btn-presente" onclick="marcarPresente()">' +
            '✓ Estou presente</button>'
  } else {
    html += '<div class="alerta">⏰ Volte aqui no dia <strong>' +
            fmtDataLong(ev?.data) + '</strong> pra fazer seu check-in.</div>'
  }

  _conteudo.innerHTML = html
}

window.marcarPresente = async function() {
  const btn = _$('btn-presente')
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Registrando…' }

  const { data, error } = await db.rpc('escala_voluntario_checkin',
    { p_escala_id: null, p_token: _token })

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Estou presente' }
    mostrarErro('Não foi possível registrar', error.message || 'Erro desconhecido.')
    return
  }

  const reg = Array.isArray(data) ? data[0] : data
  if (!reg) {
    mostrarErro('Resposta inesperada', 'Tente novamente em alguns segundos.')
    return
  }

  mostrarSucesso(reg.voluntario_nome, reg.evento_nome, reg.evento_data,
    fmtHora(reg.checkin_em))
}

carregar()
