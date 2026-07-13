// ===== ESTADO =====
let membros = []
let editandoId = null
let mesasCache = []
let ministeriosCache = []

// ===== ESTADO DO MAPA =====
let mapaObj = null
let mapaMarkers = []
let mapaInfoWindowAberta = null
let mapaGeocodificado = false
let mapaVisivel = false

// ===== INIT =====
async function init() {
  // Fase 7.1: espera auth.js terminar antes de aplicar gates granulares.
  // Mesma logica do piloto conteudos.html — IIFE assincrona pode nao ter
  // populado AUTH.permissoesGranular ainda quando o init() roda.
  if (!window.AUTH?._initDone) {
    await new Promise(resolve => {
      const onReady = () => { window.removeEventListener('auth:ready', onReady); resolve() }
      window.addEventListener('auth:ready', onReady)
      const iv = setInterval(() => {
        if (window.AUTH?._initDone) { clearInterval(iv); onReady() }
      }, 50)
      setTimeout(() => { clearInterval(iv); onReady() }, 3000)
    })
  }

  await Promise.all([
    carregarMesasSelect(),
    carregarMinisteriosChecks(),
    carregarMembros()
  ])
  iniciarAutoCompleteConjuge()

  // ── Permissões por campo ──
  await carregarPermissoesCampos('membros')
  aplicarPermissoesCampos('membros')

  // Fase 7.1: gate de acoes granular (V/A/E/X) por aba='_default'.
  // Reaplicado via MutationObserver porque a tabela e re-renderizada
  // a cada filtragem/recarga de membros.
  aplicarGateAcoesMembros()
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesMembros())
      .observe(painel, { childList: true, subtree: true })
  })
}

// Fase 7.1 — esconde botoes [data-acao] sem permissao em
// permissoes_granular(membros, _default, acao). Admin curto-circuita.
function aplicarGateAcoesMembros() {
  if (window.AUTH?.isAdmin) return
  document.querySelectorAll('[data-aba]').forEach(painel => {
    const aba = painel.dataset.aba
    painel.querySelectorAll('[data-acao]').forEach(btn => {
      const ok = (typeof temPermissaoAba === 'function')
        ? temPermissaoAba('membros', aba, btn.dataset.acao)
        : true
      btn.style.display = ok ? '' : 'none'
    })
  })
}

// ===== CARREGAR MESAS NO SELECT =====
async function carregarMesasSelect() {
  const { data, error } = await db.from('mesas').select('id, nome').order('nome')
  if (error) { console.error('Erro ao carregar mesas:', error); return }
  mesasCache = data || []

  const select = document.getElementById('input-mesa-id')
  select.innerHTML = '<option value="">— Selecione uma mesa —</option>'
  mesasCache.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.nome
    select.appendChild(opt)
  })
}

// ===== CARREGAR MINISTÉRIOS COMO CHECKBOXES =====
async function carregarMinisteriosChecks() {
  const { data, error } = await db.from('ministerios').select('id, nome, icone').order('nome')
  if (error) { console.error('Erro ao carregar ministérios:', error); return }
  ministeriosCache = data || []

  const container = document.getElementById('lista-ministerios-checks')
  container.innerHTML = ''

  ministeriosCache.forEach(m => {
    const label = document.createElement('label')
    label.innerHTML = `
      <input type="checkbox" value="${m.id}" />
      ${m.icone ?? ''} ${m.nome}
    `.trim()
    container.appendChild(label)
  })
}

// ===== OBTER IDs SELECIONADOS NOS CHECKBOXES =====
function obterMinisteriosSelecionados() {
  const checks = document.querySelectorAll('#lista-ministerios-checks input[type="checkbox"]:checked')
  return Array.from(checks).map(c => c.value)
}

// ===== MARCAR CHECKBOXES DE MINISTÉRIOS =====
function marcarMinisterios(ids = []) {
  const checks = document.querySelectorAll('#lista-ministerios-checks input[type="checkbox"]')
  checks.forEach(c => { c.checked = ids.includes(c.value) })
}

// ===== LIMPAR CHECKBOXES DE MINISTÉRIOS =====
function limparMinisterios() {
  const checks = document.querySelectorAll('#lista-ministerios-checks input[type="checkbox"]')
  checks.forEach(c => c.checked = false)
}

// ===== CARREGAR MEMBROS =====
async function carregarMembros() {
  const { data, error } = await db.from('membros').select('*').order('nome')
  if (error) { console.error('Erro ao carregar membros:', error); return }
  membros = data
  renderizarMembros(membros)
}

// ===== RENDERIZAR TABELA =====
function renderizarMembros(lista) {
  const tbody = document.getElementById('tabela-membros')
  tbody.innerHTML = ''

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#aaa; padding:30px;">Nenhum membro encontrado.</td></tr>'
    return
  }

  lista.forEach(m => {
    const endParts = [m.rua, m.numero, m.complemento, m.bairro, m.cidade].filter(Boolean)
    const enderecoFormatado = endParts.length > 0 ? endParts.join(', ') : '—'

    const mesaObj = mesasCache.find(x => x.id === m.mesa_id)
    const mesaNome = mesaObj ? mesaObj.nome : '—'

    const ids = Array.isArray(m.ministerio_ids) ? m.ministerio_ids : []
    const minNomes = ids
      .map(id => {
        const min = ministeriosCache.find(x => x.id === id)
        return min ? `✅ ${min.icone ?? ''} ${min.nome}`.trim() : null
      })
      .filter(Boolean)

    const minCelula = m.voluntario === 'Sim' && minNomes.length > 0
      ? minNomes.join('<br/>')
      : '—'

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${m.nome}</td>
      <td>${m.telefone ?? '—'}</td>
      <td>${enderecoFormatado}</td>
      <td>${m.estado_civil ?? '—'}${m.conjuge ? ` <small>(${m.conjuge})</small>` : ''}</td>
      <td>${mesaNome}</td>
      <td>${minCelula}</td>
      <td><span class="badge ${m.status === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">${m.status}</span></td>
      <td>
        <button class="btn btn-secondary" data-acao="editar" onclick="editarMembro('${m.id}')">✏️ Editar</button>
        <button class="btn btn-danger" data-acao="excluir" onclick="excluirMembro('${m.id}')">🗑️ Excluir</button>
      </td>
    `
    tbody.appendChild(tr)
  })

  const salvo = sessionStorage.getItem('permissoes_campos_membros')
  if (salvo) ocultarColunasSemPermissao(JSON.parse(salvo))
}

// ===== FILTRAR =====
function filtrarMembros() {
  const busca = document.getElementById('busca-membro').value.toLowerCase()
  const filtrados = membros.filter(m => {
    const mesaObj = mesasCache.find(x => x.id === m.mesa_id)
    const ids = Array.isArray(m.ministerio_ids) ? m.ministerio_ids : []
    const minNomes = ids.map(id => ministeriosCache.find(x => x.id === id)?.nome ?? '').join(' ')
    return (
      m.nome.toLowerCase().includes(busca) ||
      (m.bairro ?? '').toLowerCase().includes(busca) ||
      (m.cidade ?? '').toLowerCase().includes(busca) ||
      (mesaObj?.nome ?? '').toLowerCase().includes(busca) ||
      minNomes.toLowerCase().includes(busca)
    )
  })
  renderizarMembros(filtrados)
}

// ===== TOGGLE CAMPOS CONDICIONAIS =====
function toggleConjuge() {
  const val = document.getElementById('input-estado-civil').value
  document.getElementById('campo-conjuge').style.display = val === 'Casado' ? 'flex' : 'none'
}

function toggleFilhos() {
  const val = document.getElementById('input-possui-filhos').value
  document.getElementById('campo-filhos').style.display = val === 'Sim' ? 'block' : 'none'
}

function toggleMesa() {
  const val = document.getElementById('input-participa-mesa').value
  document.getElementById('campo-mesa').style.display = val === 'Sim' ? 'flex' : 'none'
  if (val === 'Não') document.getElementById('input-mesa-id').value = ''
}

function toggleMinisterio() {
  const val = document.getElementById('input-voluntario').value
  document.getElementById('campo-ministerio').style.display = val === 'Sim' ? 'flex' : 'none'
  if (val === 'Não') limparMinisterios()
}

// ===== AUTOCOMPLETE CÔNJUGE =====
function iniciarAutoCompleteConjuge() {
  const input = document.getElementById('input-conjuge')
  const lista = document.getElementById('autocomplete-conjuge')
  if (!input || !lista) return

  input.addEventListener('input', () => {
    const termo = input.value.trim().toLowerCase()
    lista.innerHTML = ''
    lista.style.display = 'none'
    if (termo.length < 2) return

    const resultados = membros.filter(m =>
      m.nome.toLowerCase().includes(termo) && m.id !== editandoId
    )
    if (resultados.length === 0) return

    resultados.slice(0, 8).forEach(m => {
      const item = document.createElement('div')
      item.className = 'autocomplete-item'
      item.innerHTML = `
        <span>${m.nome}</span>
        ${m.data_nascimento ? `<span class="autocomplete-nasc">${formatarDataBR(m.data_nascimento)}</span>` : ''}
      `
      item.addEventListener('mousedown', () => {
        input.value = m.nome
        input.dataset.membroId = m.id
        lista.style.display = 'none'
      })
      lista.appendChild(item)
    })

    lista.style.display = 'block'
  })

  input.addEventListener('blur', () => {
    setTimeout(() => { lista.style.display = 'none' }, 150)
  })
}

// ===== AUTOCOMPLETE FILHOS — busca no banco + membros =====
async function buscarSugestoesFilho(termo) {
  const resultados = []
  const termoLower = termo.toLowerCase()

  // Busca na tabela filhos
  const { data: filhosDB } = await db
    .from('filhos')
    .select('nome, data_nascimento')
    .ilike('nome', `%${termo}%`)
    .limit(10)

  if (filhosDB) {
    filhosDB.forEach(f => {
      resultados.push({
        nome: f.nome,
        nascimento: f.data_nascimento ?? '',
        origem: '👶 Filho cadastrado'
      })
    })
  }

  // Busca também em membros (jovens/crianças que já são membros)
  membros
    .filter(m => m.nome.toLowerCase().includes(termoLower) && m.id !== editandoId)
    .slice(0, 5)
    .forEach(m => {
      const jaExiste = resultados.some(r => r.nome.toLowerCase() === m.nome.toLowerCase())
      if (!jaExiste) {
        resultados.push({
          nome: m.nome,
          nascimento: m.data_nascimento ?? '',
          origem: '👤 Membro'
        })
      }
    })

  return resultados
}

// ===== FORMATAR DATA BR =====
function formatarDataBR(data) {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

// ===== ADICIONAR FILHO COM AUTOCOMPLETE =====
function adicionarFilhoComAutoComplete(nome = '', nascimento = '') {
  const lista = document.getElementById('lista-filhos')
  const wrapper = document.createElement('div')
  wrapper.style = 'position:relative; margin-bottom:8px;'

  wrapper.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center;">
      <div style="flex:2; position:relative;">
        <input type="text" placeholder="Nome do filho" value="${nome}"
          class="input-filho-nome"
          style="width:100%; box-sizing:border-box;"
          autocomplete="off" />
        <div class="autocomplete-lista" style="display:none;"></div>
      </div>
      <input type="date" value="${nascimento}" class="input-filho-nasc" style="flex:1;" />
      <button type="button" class="btn btn-danger"
        onclick="this.closest('div[style]').remove()">✕</button>
    </div>
  `

  lista.appendChild(wrapper)

  const inputNome = wrapper.querySelector('.input-filho-nome')
  const inputNasc = wrapper.querySelector('.input-filho-nasc')
  const dropDown  = wrapper.querySelector('.autocomplete-lista')

  inputNome.addEventListener('input', async () => {
    const termo = inputNome.value.trim()
    dropDown.innerHTML = ''
    dropDown.style.display = 'none'
    if (termo.length < 2) return

    const sugestoes = await buscarSugestoesFilho(termo)
    if (sugestoes.length === 0) return

    sugestoes.forEach(s => {
      const item = document.createElement('div')
      item.className = 'autocomplete-item'
      item.innerHTML = `
        <span>${s.nome}</span>
        <small>${s.origem}</small>
        ${s.nascimento ? `<span class="autocomplete-nasc">${formatarDataBR(s.nascimento)}</span>` : ''}
      `
      item.addEventListener('mousedown', () => {
        inputNome.value = s.nome
        if (s.nascimento) inputNasc.value = s.nascimento
        dropDown.style.display = 'none'
      })
      dropDown.appendChild(item)
    })

    dropDown.style.display = 'block'
  })

  inputNome.addEventListener('blur', () => {
    setTimeout(() => { dropDown.style.display = 'none' }, 150)
  })
}

// ===== FILHOS DINÂMICOS (agora usa autocomplete) =====
function adicionarFilho(nome = '', nascimento = '') {
  adicionarFilhoComAutoComplete(nome, nascimento)
}

function obterFilhos() {
  const wrappers = document.querySelectorAll('#lista-filhos > div')
  const filhos = []
  wrappers.forEach(wrapper => {
    const nome       = wrapper.querySelector('.input-filho-nome')?.value.trim()
    const nascimento = wrapper.querySelector('.input-filho-nasc')?.value
    if (nome) filhos.push({ nome, nascimento })
  })
  return filhos
}

function preencherFilhos(filhos = []) {
  document.getElementById('lista-filhos').innerHTML = ''
  filhos.forEach(f => adicionarFilhoComAutoComplete(f.nome, f.nascimento || f.data_nascimento || ''))
}

// ===== CARREGAR FILHOS DO MEMBRO =====
async function carregarFilhosMembro(membroId) {
  const { data, error } = await db
    .from('filhos')
    .select('nome, data_nascimento')
    .eq('membro_id', membroId)

  if (error) {
    console.error('❌ Erro ao carregar filhos do membro:', error)
    return []
  }

  return (data || []).map(f => ({
    nome:       f.nome,
    nascimento: f.data_nascimento || '',
  }))
}

// ===== SINCRONIZAR FILHOS NA TABELA `filhos` =====
async function sincronizarFilhos(membroId, filhosDoForm) {
  const { data: filhosExistentes, error } = await db
    .from('filhos')
    .select('id, nome, data_nascimento')
    .eq('membro_id', membroId)

  if (error) {
    console.error('❌ Erro ao buscar filhos existentes:', error)
    return
  }

  for (const filho of filhosDoForm) {
    if (!filho.nome) continue

    const nomeNorm   = filho.nome.trim().toLowerCase()
    const nascimento = filho.nascimento || null

    const jaExisteNesteMembro = filhosExistentes.some(f =>
      f.nome.toLowerCase() === nomeNorm &&
      f.data_nascimento === nascimento
    )

    if (jaExisteNesteMembro) continue

    const { data: global } = await db
      .from('filhos')
      .select('id, membro_id')
      .ilike('nome', filho.nome.trim())
      .eq('data_nascimento', nascimento)
      .maybeSingle()

    if (global) {
      console.warn(`⚠️ Filho duplicado ignorado: ${filho.nome} (${nascimento})`)
      continue
    }

    const { error: errInsert } = await db.from('filhos').insert({
      nome:            filho.nome.trim(),
      data_nascimento: nascimento,
      membro_id:       membroId,
    })

    if (errInsert) {
      console.warn(`⚠️ Banco bloqueou duplicata: ${filho.nome}`, errInsert.message)
    } else {
      console.log(`✅ Filho inserido: ${filho.nome}`)
    }
  }

  for (const existente of filhosExistentes) {
    const nomeNorm = existente.nome.toLowerCase()
    const aindaNoForm = filhosDoForm.some(f =>
      f.nome.trim().toLowerCase() === nomeNorm &&
      (f.nascimento || null) === existente.data_nascimento
    )
    if (!aindaNoForm) {
      await db.from('filhos').delete().eq('id', existente.id)
      console.log(`🗑️ Filho removido: ${existente.nome}`)
    }
  }
}

// ===== LIMPAR ENDEREÇO =====
function limparEndereco() {
  document.getElementById('input-rua').value = ''
  document.getElementById('input-numero').value = ''
  document.getElementById('input-complemento').value = ''
  document.getElementById('input-bairro').value = ''
  document.getElementById('input-cidade').value = ''
}

// ===== MÁSCARA CEP =====
function mascaraCep(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8)
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5)
  input.value = v
  if (v.replace(/\D/g, '').length === 8) buscarCep(v)
}

// ===== BUSCAR CEP (ViaCEP) =====
async function buscarCep(cep) {
  const spinner = document.getElementById('cep-spinner')
  const ok      = document.getElementById('cep-ok')
  const err     = document.getElementById('cep-err')

  // Reset visual
  spinner.style.display = 'inline'
  ok.style.display      = 'none'
  err.style.display     = 'none'

  const numeros = cep.replace(/\D/g, '')

  try {
    const res  = await fetch(`https://viacep.com.br/ws/${numeros}/json/`)
    const data = await res.json()

    spinner.style.display = 'none'

    if (data.erro) {
      err.style.display = 'inline'
      return
    }

    // Preenche os campos
    document.getElementById('input-rua').value    = data.logradouro || ''
    document.getElementById('input-bairro').value = data.bairro     || ''
    document.getElementById('input-cidade').value = data.localidade || ''

    // Foca no campo número após preencher
    document.getElementById('input-numero').focus()

    ok.style.display = 'inline'
    setTimeout(() => { ok.style.display = 'none' }, 2500)

  } catch (e) {
    spinner.style.display = 'none'
    err.style.display     = 'inline'
    console.error('Erro ao buscar CEP:', e)
  }
}


// ===== MODAL ABRIR =====
function abrirModal() {
  editandoId = null
  document.getElementById('modal-titulo').textContent = 'Novo Membro'
  document.getElementById('input-nome').value = ''
  document.getElementById('input-data-nascimento').value = ''
  document.getElementById('input-telefone').value = ''
  limparEndereco()
  document.getElementById('input-estado-civil').value = 'Solteiro'
  document.getElementById('input-conjuge').value = ''
  document.getElementById('campo-conjuge').style.display = 'none'
  document.getElementById('input-possui-filhos').value = 'Não'
  document.getElementById('campo-filhos').style.display = 'none'
  document.getElementById('lista-filhos').innerHTML = ''
  document.getElementById('input-participa-mesa').value = 'Não'
  document.getElementById('campo-mesa').style.display = 'none'
  document.getElementById('input-mesa-id').value = ''
  document.getElementById('input-voluntario').value = 'Não'
  document.getElementById('campo-ministerio').style.display = 'none'
  limparMinisterios()
  document.getElementById('input-status').value = 'Ativo'
  document.querySelector('.modal').scrollTop = 0
  document.getElementById('modal-overlay').classList.add('active')
  document.getElementById('input-cep').value = ''
  document.getElementById('cep-ok').style.display  = 'none'
  document.getElementById('cep-err').style.display = 'none'

}

// ===== MODAL FECHAR =====
function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active')
}

// ===== EDITAR =====
async function editarMembro(id) {
  const m = membros.find(m => m.id === id)
  if (!m) return

  editandoId = id
  document.getElementById('modal-titulo').textContent = 'Editar Membro'
  document.getElementById('input-nome').value = m.nome
  document.getElementById('input-data-nascimento').value = m.data_nascimento ?? ''
  document.getElementById('input-telefone').value = m.telefone ?? ''
  document.getElementById('input-rua').value = m.rua ?? ''
  document.getElementById('input-numero').value = m.numero ?? ''
  document.getElementById('input-complemento').value = m.complemento ?? ''
  document.getElementById('input-bairro').value = m.bairro ?? ''
  document.getElementById('input-cidade').value = m.cidade ?? ''

  document.getElementById('input-estado-civil').value = m.estado_civil ?? 'Solteiro'
  document.getElementById('input-conjuge').value = m.conjuge ?? ''
  document.getElementById('campo-conjuge').style.display = m.estado_civil === 'Casado' ? 'flex' : 'none'

  document.getElementById('input-cep').value = ''
  document.getElementById('cep-ok').style.display  = 'none'
  document.getElementById('cep-err').style.display = 'none'


  const filhosDB = await carregarFilhosMembro(id)
  const temFilhos = filhosDB.length > 0 ? 'Sim' : 'Não'
  document.getElementById('input-possui-filhos').value = temFilhos
  document.getElementById('campo-filhos').style.display = temFilhos === 'Sim' ? 'block' : 'none'
  preencherFilhos(filhosDB)

  const temMesa = m.mesa_id ? 'Sim' : 'Não'
  document.getElementById('input-participa-mesa').value = temMesa
  document.getElementById('campo-mesa').style.display = temMesa === 'Sim' ? 'flex' : 'none'
  document.getElementById('input-mesa-id').value = m.mesa_id ?? ''

  document.getElementById('input-voluntario').value = m.voluntario ?? 'Não'

  const idsMinisterios = Array.isArray(m.ministerio_ids) ? m.ministerio_ids : []
  const temMin = idsMinisterios.length > 0 ? 'Sim' : 'Não'
  document.getElementById('campo-ministerio').style.display = temMin === 'Sim' ? 'flex' : 'none'
  marcarMinisterios(idsMinisterios)

  document.getElementById('input-status').value = m.status
  document.querySelector('.modal').scrollTop = 0
  document.getElementById('modal-overlay').classList.add('active')
}

// ===== SALVAR =====
async function salvarMembro() {
  const estadoCivil    = document.getElementById('input-estado-civil').value
  const possuiFilhos   = document.getElementById('input-possui-filhos').value
  const participaMesa  = document.getElementById('input-participa-mesa').value
  const voluntario     = document.getElementById('input-voluntario').value
  const dataNasc       = document.getElementById('input-data-nascimento').value
  const mesaId         = document.getElementById('input-mesa-id').value || null
  const ministerioIds  = voluntario === 'Sim' ? obterMinisteriosSelecionados() : []

  const mesaObj = mesasCache.find(x => x.id === mesaId)

  const minNomes = ministerioIds
    .map(id => ministeriosCache.find(x => x.id === id)?.nome)
    .filter(Boolean)
    .join(', ')

  const filhosDoForm = possuiFilhos === 'Sim' ? obterFilhos() : []

  const payload = {
    nome:             document.getElementById('input-nome').value.trim(),
    data_nascimento:  dataNasc || null,
    telefone:         document.getElementById('input-telefone').value.trim() || null,
    rua:              document.getElementById('input-rua').value.trim() || null,
    numero:           document.getElementById('input-numero').value.trim() || null,
    complemento:      document.getElementById('input-complemento').value.trim() || null,
    bairro:           document.getElementById('input-bairro').value.trim() || null,
    cidade:           document.getElementById('input-cidade').value.trim() || null,
    estado_civil:     estadoCivil,
    conjuge:          estadoCivil === 'Casado'
                        ? document.getElementById('input-conjuge').value.trim() || null
                        : null,
    mesa_id:          participaMesa === 'Sim' ? mesaId : null,
    mesa:             participaMesa === 'Sim' ? (mesaObj?.nome ?? null) : null,
    voluntario:       voluntario,
    ministerio_ids:   ministerioIds,
    ministerio:       minNomes || null,
    status:           document.getElementById('input-status').value,
  }

  delete payload.filhos

  if (!payload.nome) {
    alert('O nome é obrigatório!')
    return
  }

  let membroId = editandoId

  if (editandoId) {
    const membroAntigo = membros.find(m => m.id === editandoId)

    const { error } = await db.from('membros').update(payload).eq('id', editandoId)
    if (error) {
      console.error('❌ Erro ao atualizar membro:', error)
      alert(`Erro ao atualizar membro!\n\n${error.message}`)
      return
    }

    if (membroAntigo?.mesa_id && membroAntigo.mesa_id !== payload.mesa_id) {
      await recalcularTotalMesa(membroAntigo.mesa_id)
    }

    await sincronizarVoluntario(membroId, payload, membroAntigo)

  } else {
    const { data, error } = await db.from('membros').insert(payload).select().single()
    if (error) {
      console.error('❌ Erro ao cadastrar membro:', error)
      alert(`Erro ao cadastrar membro!\n\n${error.message}`)
      return
    }
    membroId = data.id
    await sincronizarVoluntario(membroId, payload, null)
  }

  await sincronizarFilhos(membroId, filhosDoForm)

  if (payload.mesa_id) {
    await recalcularTotalMesa(payload.mesa_id)
  }

  mapaGeocodificado = false

  fecharModal()
  carregarMembros()
}

// ===== SINCRONIZAR COM TABELA VOLUNTARIOS =====
async function sincronizarVoluntario(membroId, payload, membroAntigo) {
  const semMinisterios = !payload.ministerio_ids || payload.ministerio_ids.length === 0

  if (semMinisterios) {
    await db.from('voluntarios').delete().eq('membro_id', membroId)
    return
  }

  if (payload.voluntario === 'Sim' && !semMinisterios) {
    const dadosVoluntario = {
      nome:           payload.nome,
      telefone:       payload.telefone,
      nascimento:     payload.data_nascimento,
      endereco:       [payload.rua, payload.numero, payload.complemento, payload.bairro, payload.cidade]
                        .filter(Boolean)
                        .join(', ') || null,
      participa_mesa: payload.mesa_id ? 'sim' : 'nao',
      mesa:           payload.mesa ?? null,
      ministerio_ids: payload.ministerio_ids,
      ministerio:     payload.ministerio ?? null,
      status:         payload.status,
      membro_id:      membroId,
    }

    const { data: existente } = await db
      .from('voluntarios')
      .select('id')
      .eq('membro_id', membroId)
      .maybeSingle()

    if (existente) {
      const { error } = await db.from('voluntarios').update(dadosVoluntario).eq('membro_id', membroId)
      if (error) console.error('❌ Erro ao atualizar voluntário:', error)
    } else {
      const { error } = await db.from('voluntarios').insert(dadosVoluntario).select()
      if (error) console.error('❌ Erro ao inserir voluntário:', error)
    }
  }
}

// ===== RECALCULAR TOTAL DE MEMBROS DA MESA =====
async function recalcularTotalMesa(mesaId) {
  const { count } = await db
    .from('membros')
    .select('id', { count: 'exact', head: true })
    .eq('mesa_id', mesaId)

  await db.from('mesas').update({ total_membros: count ?? 0 }).eq('id', mesaId)
}

// ===== EXCLUIR =====
async function excluirMembro(id) {
  if (!confirm('Deseja excluir este membro?')) return

  const membro = membros.find(m => m.id === id)

  const { error: errFilhos } = await db.from('filhos').delete().eq('membro_id', id)
  if (errFilhos) {
    console.error('❌ Erro ao remover filhos:', errFilhos)
    alert(`Erro ao remover filhos!\n\n${errFilhos.message}`)
    return
  }

  const { error: errVol } = await db.from('voluntarios').delete().eq('membro_id', id)
  if (errVol) {
    console.error('❌ Erro ao remover voluntário:', errVol)
    alert(`Erro ao remover voluntário!\n\n${errVol.message}`)
    return
  }

  const { error } = await db.from('membros').delete().eq('id', id)
  if (error) {
    console.error('❌ Erro ao excluir membro:', error)
    alert(`Erro ao excluir membro!\n\n${error.message}`)
    return
  }

  if (membro?.mesa_id) {
    await recalcularTotalMesa(membro.mesa_id)
  }

  mapaGeocodificado = false
  carregarMembros()
}

// ============================================================
// ===== MAPA INLINE =====
// ============================================================

async function toggleMapa() {
  if (mapaVisivel) {
    fecharMapa()
  } else {
    await abrirMapa()
  }
}

async function abrirMapa() {
  const secao = document.getElementById('secao-mapa')
  secao.classList.add('active')
  mapaVisivel = true

  secao.scrollIntoView({ behavior: 'smooth', block: 'start' })

  await esperarGoogleMaps()

  if (!mapaObj) {
    mapaObj = new google.maps.Map(document.getElementById('map-membros'), {
      center: { lat: -19.4678, lng: -42.5379 },
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    })
  }

  if (!mapaGeocodificado) {
    document.getElementById('mapa-loading').style.display = 'flex'
    limparMarkersDoMapa()
    await geocodificarEPlotarMembros()
    mapaGeocodificado = true
    document.getElementById('mapa-loading').style.display = 'none'
  }

  google.maps.event.trigger(mapaObj, 'resize')
  renderizarListaMapa(membros)
}

function fecharMapa() {
  const secao = document.getElementById('secao-mapa')
  secao.classList.remove('active')
  mapaVisivel = false
  document.getElementById('mapa-busca').value = ''
  if (mapaInfoWindowAberta) mapaInfoWindowAberta.close()
}

function esperarGoogleMaps() {
  return new Promise(resolve => {
    if (window.google && window.google.maps) { resolve(); return }
    const interval = setInterval(() => {
      if (window.google && window.google.maps) {
        clearInterval(interval)
        resolve()
      }
    }, 150)
  })
}

function limparMarkersDoMapa() {
  mapaMarkers.forEach(m => m.marker?.setMap(null))
  mapaMarkers = []
}

async function geocodificarEPlotarMembros() {
  const geocoder = new google.maps.Geocoder()

  for (const membro of membros) {
    const cidadePadrao = (window.APP_CONFIG && window.APP_CONFIG.CIDADE_PADRAO) || ''
    const partes = [membro.rua, membro.numero, membro.bairro, membro.cidade || cidadePadrao, 'Brasil']
    const enderecoCompleto = partes.filter(Boolean).join(', ')

    if (!membro.rua && !membro.bairro) {
      mapaMarkers.push({ id: membro.id, marker: null })
      continue
    }

    await new Promise(resolve => {
      geocoder.geocode({ address: enderecoCompleto }, (results, status) => {
        if (status === 'OK' && results[0]) {
          membro._lat = results[0].geometry.location.lat()
          membro._lng = results[0].geometry.location.lng()
          const marker = criarMarkerMembro(membro)
          mapaMarkers.push({ id: membro.id, marker })
        } else {
          membro._lat = null
          membro._lng = null
          mapaMarkers.push({ id: membro.id, marker: null })
          console.warn(`Endereço não encontrado: ${enderecoCompleto}`)
        }
        resolve()
      })
    })
  }
}

function criarMarkerMembro(membro) {
  const svgPin = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
      <path d="M18 2 C9.163 2 2 9.163 2 18 C2 30.5 18 46 18 46 C18 46 34 30.5 34 18 C34 9.163 26.837 2 18 2 Z"
        fill="white" stroke="#6b8e4e" stroke-width="3"/>
      <circle cx="18" cy="17" r="8" fill="white" stroke="#6b8e4e" stroke-width="3"/>
    </svg>
  `.trim()

  const iconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgPin)

  const marker = new google.maps.Marker({
    position: { lat: membro._lat, lng: membro._lng },
    map: mapaObj,
    title: membro.nome,
    icon: {
      url: iconUrl,
      scaledSize: new google.maps.Size(36, 48),
      anchor: new google.maps.Point(18, 46),
    },
  })

  const mesaObj = mesasCache.find(x => x.id === membro.mesa_id)
  const endParts = [membro.rua, membro.numero, membro.bairro].filter(Boolean)

  const conteudo = `
    <div class="map-info-box">
      <h3>${membro.nome}</h3>
      <p>📍 ${endParts.join(', ') || '—'}</p>
      <p>📞 ${membro.telefone ?? '—'}</p>
      ${mesaObj ? `<span class="map-badge">🟤 ${mesaObj.nome}</span>` : ''}
      <span class="map-badge">${membro.status}</span>
    </div>
  `

  const infoWindow = new google.maps.InfoWindow({ content: conteudo })

  marker.addListener('click', () => {
    if (mapaInfoWindowAberta) mapaInfoWindowAberta.close()
    infoWindow.open(mapaObj, marker)
    mapaInfoWindowAberta = infoWindow
    destacarCardMapa(membro.id)
  })

  return marker
}

function renderizarListaMapa(lista) {
  const container = document.getElementById('mapa-member-list')
  const count = document.getElementById('mapa-member-count')

  const comEndereco = lista.filter(m => m.rua || m.bairro)
  count.textContent = `${lista.length} membro(s) — ${comEndereco.length} com endereço`

  container.innerHTML = ''

  lista.forEach(membro => {
    const temCoords = membro._lat != null
    const card = document.createElement('div')
    card.className = `mapa-member-card${temCoords ? '' : ' sem-coords'}`
    card.dataset.id = membro.id

    const endParts = [membro.bairro, membro.cidade].filter(Boolean)

    card.innerHTML = `
      <h4>${membro.nome}</h4>
      <p>${endParts.join(', ') || '⚠️ Sem endereço'}</p>
    `

    if (temCoords) {
      card.addEventListener('click', () => {
        mapaObj.panTo({ lat: membro._lat, lng: membro._lng })
        mapaObj.setZoom(16)

        const entry = mapaMarkers.find(x => x.id === membro.id)
        if (entry?.marker) {
          google.maps.event.trigger(entry.marker, 'click')
        }
        destacarCardMapa(membro.id)
      })
    }

    container.appendChild(card)
  })
}

function destacarCardMapa(id) {
  document.querySelectorAll('.mapa-member-card').forEach(c => c.classList.remove('active'))
  const card = document.querySelector(`.mapa-member-card[data-id="${id}"]`)
  if (card) {
    card.classList.add('active')
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

function filtrarMapaMembros() {
  const termo = document.getElementById('mapa-busca').value.toLowerCase().trim()

  const filtrados = membros.filter(m =>
    m.nome.toLowerCase().includes(termo) ||
    (m.bairro ?? '').toLowerCase().includes(termo) ||
    (m.cidade ?? '').toLowerCase().includes(termo)
  )

  membros.forEach(m => {
    const entry = mapaMarkers.find(x => x.id === m.id)
    if (entry?.marker) {
      entry.marker.setVisible(filtrados.some(f => f.id === m.id))
    }
  })

  renderizarListaMapa(filtrados)
}

// ===== INIT =====
init()
