// ===== ESTADO =====
let lancamentos = []
let categorias  = []
let contas      = []
let formasPgto  = []
let editandoId = null
let comprovantePathAtual = null // path do comprovante no modal (ao editar)
const BUCKET_COMPROVANTES = 'financeiro-comprovantes'

// ===== UTILS =====
function valorEmCentavos(v) {
  return Math.round(parseFloat(v || 0) * 100)
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Mascara de moeda BR: usuario digita "1234" e ve "12,34"; "150000" ve "1.500,00".
function aplicarMascaraMoeda(el) {
  if (!el || el.dataset.maskMoeda === '1') return
  el.dataset.maskMoeda = '1'
  el.addEventListener('input', () => {
    const digitos = el.value.replace(/\D/g, '')
    if (!digitos) { el.value = ''; return }
    el.value = (parseInt(digitos, 10) / 100)
      .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  })
}

function lerMascaraMoeda(el) {
  const digitos = (el?.value || '').replace(/\D/g, '')
  return digitos ? parseInt(digitos, 10) / 100 : 0
}

function setMascaraMoedaValor(el, valor) {
  if (!el) return
  if (valor == null || valor === '') { el.value = ''; return }
  el.value = parseFloat(valor)
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isoMesAtual() {
  const d = new Date()
  return [
    new Date(d.getFullYear(), d.getMonth(), 1),
    new Date(d.getFullYear(), d.getMonth() + 1, 0)
  ].map(x => x.toISOString().slice(0,10))
}

function isoMesAnterior() {
  const d = new Date()
  return [
    new Date(d.getFullYear(), d.getMonth() - 1, 1),
    new Date(d.getFullYear(), d.getMonth(), 0)
  ].map(x => x.toISOString().slice(0,10))
}

function isoAnoAtual() {
  const d = new Date()
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`]
}

function periodoSelecionado() {
  const v = document.getElementById('filtro-periodo').value
  if (v === 'mes-atual')    return isoMesAtual()
  if (v === 'mes-anterior') return isoMesAnterior()
  if (v === 'ano-atual')    return isoAnoAtual()
  if (v === 'custom') {
    return [
      document.getElementById('filtro-de').value || null,
      document.getElementById('filtro-ate').value || null
    ]
  }
  return [null, null] // 'tudo'
}

// ===== CARREGAR CATEGORIAS =====
async function carregarCategorias() {
  const { data, error } = await db
    .from('financeiro_categorias')
    .select('id, nome, tipo, cor, icone, ativo')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) { console.error('Erro categorias:', error); return }
  categorias = data || []

  // Popular filtro
  const fSel = document.getElementById('filtro-categoria')
  fSel.innerHTML = '<option value="">Todas</option>' +
    categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')

  // Popular modal de lancamento
  preencherSelectCategoriaModal()

  // Botao "+" so admin
  const btnNova = document.getElementById('btn-nova-categoria')
  if (btnNova) btnNova.style.display = window.AUTH?.isAdmin ? '' : 'none'
}

// ===== CARREGAR CONTAS =====
async function carregarContas() {
  const { data, error } = await db
    .from('financeiro_contas')
    .select('id, nome, tipo, saldo_inicial, ativo')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome',  { ascending: true })

  if (error) { console.error('Erro contas:', error); return }
  contas = data || []

  const fSel = document.getElementById('filtro-conta')
  fSel.innerHTML = '<option value="">Todas</option>' +
    contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')

  const mSel = document.getElementById('input-conta-id')
  if (mSel) {
    mSel.innerHTML = '<option value="">— selecione —</option>' +
      contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
  }

  const btnNova = document.getElementById('btn-nova-conta')
  if (btnNova) btnNova.style.display = window.AUTH?.isAdmin ? '' : 'none'
}

// ===== CARREGAR FORMAS DE PAGAMENTO =====
async function carregarFormasPgto() {
  const { data, error } = await db
    .from('financeiro_formas_pgto')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome',  { ascending: true })

  if (error) { console.error('Erro formas pgto:', error); return }
  formasPgto = data || []

  const sel = document.getElementById('input-forma-pgto-id')
  if (sel) {
    sel.innerHTML = '<option value="">— opcional —</option>' +
      formasPgto.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')
  }
}

function preencherSelectCategoriaModal() {
  const sel = document.getElementById('input-categoria-id')
  if (!sel) return
  const tipoAtual = document.getElementById('input-tipo').value
  const filtradas = categorias.filter(c => c.tipo === 'ambos' || c.tipo === tipoAtual)
  const valorAtual = sel.value
  sel.innerHTML = '<option value="">— selecione —</option>' +
    filtradas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
  if (valorAtual && filtradas.some(c => c.id === valorAtual)) sel.value = valorAtual
}

// ===== CARREGAR LANCAMENTOS =====
async function carregarFinanceiro() {
  const [de, ate] = periodoSelecionado()
  const tipo = document.getElementById('filtro-tipo').value
  const catId = document.getElementById('filtro-categoria').value
  const contaId = document.getElementById('filtro-conta').value

  let q = db.from('financeiro')
    .select('*, financeiro_categorias(id, nome, cor, icone), financeiro_contas(id, nome, tipo), financeiro_formas_pgto(id, nome)')
    .order('data_pagamento', { ascending: false })

  if (de)      q = q.gte('data_pagamento', de)
  if (ate)     q = q.lte('data_pagamento', ate)
  if (tipo)    q = q.eq('tipo', tipo)
  if (catId)   q = q.eq('categoria_id', catId)
  if (contaId) q = q.eq('conta_id', contaId)

  const { data, error } = await q
  if (error) { console.error('Erro ao carregar financeiro:', error); return }

  lancamentos = data || []
  atualizarResumo(lancamentos)
  renderizarFinanceiro(lancamentos)
  renderizarSubtotais(lancamentos)

  // Atualiza graficos se estao visiveis
  const cont = document.getElementById('relatorios-conteudo')
  if (cont && cont.style.display !== 'none') renderizarGraficos()

  await carregarPermissoesCampos('financeiro')
  aplicarPermissoesCampos('financeiro')
}

function aoMudarPeriodo() {
  const v = document.getElementById('filtro-periodo').value
  document.getElementById('filtro-datas-custom').style.display = (v === 'custom') ? 'flex' : 'none'
  if (v !== 'custom') aplicarFiltros()
}

function aplicarFiltros() {
  carregarFinanceiro()
}

// ===== RESUMO =====
function atualizarResumo(lista) {
  const entradasC = lista.filter(l => l.tipo === 'entrada')
    .reduce((acc, l) => acc + valorEmCentavos(l.valor), 0)
  const saidasC = lista.filter(l => l.tipo === 'saida')
    .reduce((acc, l) => acc + valorEmCentavos(l.valor), 0)
  const saldoC = entradasC - saidasC

  document.getElementById('total-entradas').textContent = formatarMoeda(entradasC / 100)
  document.getElementById('total-saidas').textContent   = formatarMoeda(saidasC / 100)
  document.getElementById('saldo').textContent          = formatarMoeda(saldoC / 100)
}

// ===== RENDERIZAR =====
function renderizarFinanceiro(lista) {
  const tbody = document.getElementById('tabela-financeiro')
  tbody.innerHTML = ''

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum lançamento encontrado.</td></tr>'
    return
  }

  lista.forEach(l => {
    const tr = document.createElement('tr')
    tr.classList.add(l.tipo === 'entrada' ? 'linha-entrada' : 'linha-saida')
    const tipoLabel = l.tipo === 'entrada' ? '💚 Entrada' : '🔴 Saída'
    const catNome   = l.financeiro_categorias?.nome ?? '—'
    const contaNome = l.financeiro_contas?.nome ?? '—'
    const btnStyle = 'padding:6px 12px; font-size:12px;'
    const anexo = l.comprovante_path
      ? `<button class="btn btn-secondary" style="${btnStyle}" onclick="abrirComprovante('${l.comprovante_path}')">📎 Ver</button>`
      : '—'
    tr.innerHTML = `
      <td>${l.descricao}</td>
      <td>${tipoLabel}</td>
      <td>${formatarMoeda(parseFloat(l.valor || 0))}</td>
      <td>${l.data_pagamento ? new Date(l.data_pagamento).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${catNome}</td>
      <td>${contaNome}</td>
      <td>${anexo}</td>
      <td>
        <button class="btn btn-secondary" style="${btnStyle}" data-acao="editar" onclick="editarLancamento('${l.id}')">✏️ Editar</button>
        <button class="btn btn-danger" data-acao="excluir" onclick="excluirLancamento('${l.id}')">🗑️ Excluir</button>
      </td>
    `
    tbody.appendChild(tr)
  })
}

// ===== BUSCA TEXTUAL (sobre o conjunto ja filtrado) =====
function filtrarFinanceiro() {
  const busca = document.getElementById('busca-financeiro').value.toLowerCase()
  const filtrados = lancamentos.filter(l =>
    (l.descricao ?? '').toLowerCase().includes(busca) ||
    (l.financeiro_categorias?.nome ?? '').toLowerCase().includes(busca) ||
    (l.financeiro_contas?.nome ?? '').toLowerCase().includes(busca) ||
    (l.tipo ?? '').toLowerCase().includes(busca)
  )
  renderizarFinanceiro(filtrados)
  atualizarResumo(filtrados)
  renderizarSubtotais(filtrados)
}

// ===== SUBTOTAIS POR CATEGORIA =====
function renderizarSubtotais(lista) {
  const div = document.getElementById('subtotais-cat')
  if (!div) return
  if (!lista.length) { div.style.display = 'none'; return }

  // Agrega por categoria + tipo
  const acc = new Map() // key = "tipo|categoria"
  lista.forEach(l => {
    const cat = l.financeiro_categorias?.nome ?? 'Sem categoria'
    const key = `${l.tipo}|${cat}`
    acc.set(key, (acc.get(key) || 0) + valorEmCentavos(l.valor))
  })

  const entradas = [...acc.entries()].filter(([k]) => k.startsWith('entrada|'))
    .map(([k, c]) => ({ cat: k.slice(8), c }))
    .sort((a, b) => b.c - a.c)
  const saidas = [...acc.entries()].filter(([k]) => k.startsWith('saida|'))
    .map(([k, c]) => ({ cat: k.slice(6), c }))
    .sort((a, b) => b.c - a.c)

  const totEnt = entradas.reduce((a, x) => a + x.c, 0)
  const totSai = saidas.reduce((a, x) => a + x.c, 0)

  const renderBloco = (titulo, itens, tot) => `
    <div>
      <h4>${titulo}</h4>
      ${itens.map(i =>
        `<div class="linha"><span>${i.cat}</span><span>${formatarMoeda(i.c/100)}</span></div>`
      ).join('')}
      <div class="linha"><span>Total</span><span>${formatarMoeda(tot/100)}</span></div>
    </div>`

  const cols = []
  if (entradas.length) cols.push(renderBloco('💚 Entradas por categoria', entradas, totEnt))
  if (saidas.length)   cols.push(renderBloco('🔴 Saídas por categoria',   saidas,   totSai))

  div.innerHTML = `<div style="display:grid; grid-template-columns:repeat(${cols.length},1fr); gap:16px;">${cols.join('')}</div>`
  div.style.display = cols.length ? 'block' : 'none'
}

// ===== COMPROVANTE =====
async function abrirComprovante(path) {
  const { data, error } = await db.storage
    .from(BUCKET_COMPROVANTES)
    .createSignedUrl(path, 300) // 5 min
  if (error) { alert('Erro ao abrir comprovante: ' + error.message); return }
  window.open(data.signedUrl, '_blank', 'noopener')
}

async function uploadComprovante(file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage
    .from(BUCKET_COMPROVANTES)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  return path
}

function removerComprovanteAtual() {
  // marca pra remover na hora de salvar (nao apaga o arquivo no bucket por
  // ora — preserva auditoria; admin limpa via dashboard se quiser).
  comprovantePathAtual = null
  const div = document.getElementById('comprovante-atual')
  if (div) div.style.display = 'none'
}

async function mostrarComprovanteAtualNoModal(path) {
  comprovantePathAtual = path || null
  const div  = document.getElementById('comprovante-atual')
  const link = document.getElementById('comprovante-link')
  if (!div || !link) return
  if (!path) { div.style.display = 'none'; return }
  const { data, error } = await db.storage
    .from(BUCKET_COMPROVANTES)
    .createSignedUrl(path, 300)
  if (error) { div.style.display = 'none'; return }
  link.href = data.signedUrl
  div.style.display = 'block'
}

// ===== MODAL LANCAMENTO =====
function abrirModal() {
  editandoId = null
  document.getElementById('modal-titulo').textContent = 'Novo Lançamento'
  document.getElementById('input-descricao').value = ''
  document.getElementById('input-tipo').value = 'entrada'
  document.getElementById('input-valor').value = ''
  aplicarMascaraMoeda(document.getElementById('input-valor'))
  document.getElementById('input-data').value = new Date().toISOString().slice(0,10)
  preencherSelectCategoriaModal()
  document.getElementById('input-categoria-id').value = ''
  // Conta default: unica ativa, ou primeira da lista
  const contaSel = document.getElementById('input-conta-id')
  if (contaSel) contaSel.value = contas.length === 1 ? contas[0].id : ''
  const formaSel = document.getElementById('input-forma-pgto-id')
  if (formaSel) formaSel.value = ''
  document.getElementById('input-observacao').value = ''
  document.getElementById('input-comprovante').value = ''
  comprovantePathAtual = null
  const div = document.getElementById('comprovante-atual')
  if (div) div.style.display = 'none'
  document.getElementById('modal-overlay').classList.add('active')
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active')
}

// Listener pra refiltrar categoria do modal quando muda o tipo
document.addEventListener('DOMContentLoaded', () => {
  const tipoEl = document.getElementById('input-tipo')
  if (tipoEl) tipoEl.addEventListener('change', preencherSelectCategoriaModal)
})

// ===== EDITAR =====
function editarLancamento(id) {
  const l = lancamentos.find(l => l.id === id)
  if (!l) return

  editandoId = id
  document.getElementById('modal-titulo').textContent = 'Editar Lançamento'
  document.getElementById('input-descricao').value = l.descricao
  document.getElementById('input-tipo').value = l.tipo
  setMascaraMoedaValor(document.getElementById('input-valor'), l.valor)
  aplicarMascaraMoeda(document.getElementById('input-valor'))
  document.getElementById('input-data').value = l.data_pagamento ?? ''
  preencherSelectCategoriaModal()
  document.getElementById('input-categoria-id').value = l.categoria_id ?? ''
  document.getElementById('input-conta-id').value = l.conta_id ?? ''
  document.getElementById('input-forma-pgto-id').value = l.forma_pgto_id ?? ''
  document.getElementById('input-observacao').value = l.observacao ?? ''
  document.getElementById('input-comprovante').value = ''
  mostrarComprovanteAtualNoModal(l.comprovante_path ?? null)
  document.getElementById('modal-overlay').classList.add('active')
}

// ===== SALVAR =====
async function salvarLancamento() {
  const catId = document.getElementById('input-categoria-id').value || null

  const payload = {
    descricao: document.getElementById('input-descricao').value.trim(),
    tipo: document.getElementById('input-tipo').value,
    valor: lerMascaraMoeda(document.getElementById('input-valor')),
    data_pagamento: document.getElementById('input-data').value || null,
    categoria_id: catId,
    conta_id: document.getElementById('input-conta-id').value || null,
    forma_pgto_id: document.getElementById('input-forma-pgto-id').value || null,
    observacao: document.getElementById('input-observacao').value.trim() || null,
    comprovante_path: comprovantePathAtual, // pode ter sido removido
  }

  if (!payload.descricao) { alert('A descrição é obrigatória!'); return }
  if (payload.valor <= 0) { alert('Informe um valor válido!'); return }
  if (!payload.conta_id)  { alert('Selecione a conta!'); return }

  // Upload novo comprovante (se selecionado) — substitui o atual.
  const file = document.getElementById('input-comprovante').files[0]
  if (file) {
    try {
      payload.comprovante_path = await uploadComprovante(file)
    } catch (e) {
      alert('Erro ao enviar comprovante: ' + (e.message || e))
      return
    }
  }

  if (editandoId) {
    const { error } = await db.from('financeiro').update(payload).eq('id', editandoId)
    if (error) { alert('Erro ao atualizar lançamento!'); return }
  } else {
    const { error } = await db.from('financeiro').insert(payload)
    if (error) { alert('Erro ao cadastrar lançamento!'); return }
  }

  fecharModal()
  carregarFinanceiro()
}

// ===== EXCLUIR =====
async function excluirLancamento(id) {
  if (!confirm('Deseja excluir este lançamento?')) return
  const { error } = await db.rpc('financeiro_excluir', { p_id: id })
  if (error) { alert('Erro ao excluir lançamento!'); return }
  carregarFinanceiro()
}

// ===== MODAL CATEGORIA (admin) =====
function abrirModalCategoria() {
  if (!window.AUTH?.isAdmin) return
  document.getElementById('cat-nome').value = ''
  document.getElementById('cat-tipo').value = 'ambos'
  document.getElementById('modal-categoria-overlay').classList.add('active')
}

function fecharModalCategoria() {
  document.getElementById('modal-categoria-overlay').classList.remove('active')
}

async function salvarCategoria() {
  const nome = document.getElementById('cat-nome').value.trim()
  const tipo = document.getElementById('cat-tipo').value
  if (!nome) { alert('Informe o nome da categoria!'); return }

  const { data, error } = await db.from('financeiro_categorias')
    .insert({ nome, tipo })
    .select('id')
    .single()
  if (error) { alert('Erro ao criar categoria: ' + error.message); return }

  fecharModalCategoria()
  await carregarCategorias()
  // Pre-seleciona a categoria recem-criada no modal de lancamento
  const sel = document.getElementById('input-categoria-id')
  if (sel && data?.id) sel.value = data.id
}

// ===== MODAL CONTA (admin) =====
function abrirModalConta() {
  if (!window.AUTH?.isAdmin) return
  document.getElementById('conta-nome').value = ''
  document.getElementById('conta-tipo').value = 'caixa'
  setMascaraMoedaValor(document.getElementById('conta-saldo-inicial'), 0)
  aplicarMascaraMoeda(document.getElementById('conta-saldo-inicial'))
  document.getElementById('modal-conta-overlay').classList.add('active')
}

function fecharModalConta() {
  document.getElementById('modal-conta-overlay').classList.remove('active')
}

async function salvarConta() {
  const nome = document.getElementById('conta-nome').value.trim()
  const tipo = document.getElementById('conta-tipo').value
  const saldoInicial = lerMascaraMoeda(document.getElementById('conta-saldo-inicial'))
  if (!nome) { alert('Informe o nome da conta!'); return }

  const { data, error } = await db.from('financeiro_contas')
    .insert({ nome, tipo, saldo_inicial: saldoInicial })
    .select('id')
    .single()
  if (error) { alert('Erro ao criar conta: ' + error.message); return }

  fecharModalConta()
  await carregarContas()
  const sel = document.getElementById('input-conta-id')
  if (sel && data?.id) sel.value = data.id
}

// ===== RELATORIOS =====
let chartPizza = null
let chartBarras = null
let relatorioModo = 'saidas' // 'entradas' | 'saidas' | 'saldo'

const COR_ENTRADA = '#6b8e4e'
const COR_SAIDA   = '#e85a5a'

function setRelatorioModo(modo) {
  relatorioModo = modo
  document.querySelectorAll('.rel-tab').forEach(b => {
    b.classList.toggle('ativo', b.dataset.modo === modo)
  })
  renderizarGraficos()
}

function toggleRelatorios() {
  const cont = document.getElementById('relatorios-conteudo')
  const btn  = document.getElementById('btn-toggle-relatorios')
  const aberto = cont.style.display !== 'none'
  cont.style.display = aberto ? 'none' : 'block'
  btn.textContent = aberto ? 'Mostrar gráficos ▾' : 'Esconder gráficos ▴'
  if (!aberto) renderizarGraficos()
}

function renderizarGraficos() {
  if (typeof Chart === 'undefined') return
  atualizarTitulosRelatorio()
  renderPizzaCategorias()
  renderBarrasMensal()
}

function atualizarTitulosRelatorio() {
  const tp = document.getElementById('rel-titulo-pizza')
  const tb = document.getElementById('rel-titulo-barras')
  if (!tp || !tb) return
  if (relatorioModo === 'entradas') {
    tp.textContent = 'Entradas por categoria'
    tb.textContent = 'Entradas (últimos 12 meses)'
  } else if (relatorioModo === 'saidas') {
    tp.textContent = 'Saídas por categoria'
    tb.textContent = 'Saídas (últimos 12 meses)'
  } else {
    tp.textContent = 'Entradas vs Saídas (período filtrado)'
    tb.textContent = 'Saldo mensal (últimos 12 meses)'
  }
}

function renderPizzaCategorias() {
  const ctx = document.getElementById('grafico-pizza-cat')
  if (!ctx) return
  if (chartPizza) chartPizza.destroy()

  let labels = [], data = [], cores = []

  if (relatorioModo === 'saldo') {
    // 2 fatias: Total Entradas vs Total Saidas no periodo filtrado
    const ent = lancamentos.filter(l => l.tipo === 'entrada')
      .reduce((a, l) => a + valorEmCentavos(l.valor), 0) / 100
    const sai = lancamentos.filter(l => l.tipo === 'saida')
      .reduce((a, l) => a + valorEmCentavos(l.valor), 0) / 100
    labels = ['Entradas', 'Saídas']
    data   = [ent, sai]
    cores  = [COR_ENTRADA, COR_SAIDA]
  } else {
    // 'entradas' ou 'saidas': agrupa por categoria
    const tipoFiltro = relatorioModo === 'entradas' ? 'entrada' : 'saida'
    const acc = new Map()
    lancamentos.filter(l => l.tipo === tipoFiltro).forEach(l => {
      const nome = l.financeiro_categorias?.nome ?? 'Sem categoria'
      acc.set(nome, (acc.get(nome) || 0) + valorEmCentavos(l.valor))
    })
    labels = [...acc.keys()]
    data   = [...acc.values()].map(c => c / 100)
    cores  = labels.map((_, i) => `hsl(${(i * 47) % 360} 65% 55%)`)
  }

  chartPizza = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: cores }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${formatarMoeda(c.parsed)}` } }
      }
    }
  })
}

function renderBarrasMensal() {
  // Ultimos 12 meses a partir de hoje.
  const hoje = new Date()
  const meses = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    meses.push({
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    })
  }
  const ent = new Map(meses.map(m => [m.key, 0]))
  const sai = new Map(meses.map(m => [m.key, 0]))
  lancamentos.forEach(l => {
    if (!l.data_pagamento) return
    const k = l.data_pagamento.slice(0,7)
    if (!ent.has(k)) return
    const c = valorEmCentavos(l.valor)
    if (l.tipo === 'entrada') ent.set(k, ent.get(k) + c)
    else                      sai.set(k, sai.get(k) + c)
  })

  let datasets = []
  if (relatorioModo === 'entradas') {
    datasets = [{ label: 'Entradas', data: meses.map(m => ent.get(m.key) / 100), backgroundColor: COR_ENTRADA }]
  } else if (relatorioModo === 'saidas') {
    datasets = [{ label: 'Saídas', data: meses.map(m => sai.get(m.key) / 100), backgroundColor: COR_SAIDA }]
  } else {
    // saldo: entradas - saidas; cor segundo o sinal
    const valores = meses.map(m => (ent.get(m.key) - sai.get(m.key)) / 100)
    datasets = [{
      label: 'Saldo',
      data: valores,
      backgroundColor: valores.map(v => v >= 0 ? COR_ENTRADA : COR_SAIDA)
    }]
  }

  const ctx = document.getElementById('grafico-barras-mes')
  if (!ctx) return
  if (chartBarras) chartBarras.destroy()
  chartBarras = new Chart(ctx, {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { display: relatorioModo !== 'saldo' ? false : false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatarMoeda(c.parsed.y)}` } }
      },
      scales: { y: { ticks: { callback: v => formatarMoeda(v) } } }
    }
  })
}

// ===== EXPORTAR CSV =====
function exportarCSV() {
  if (!lancamentos.length) { alert('Nada pra exportar.'); return }
  const headers = ['Data','Tipo','Descrição','Valor','Categoria','Conta','Forma de pagamento','Observação']
  const linhas = lancamentos.map(l => [
    l.data_pagamento ?? '',
    l.tipo === 'entrada' ? 'Entrada' : 'Saída',
    (l.descricao ?? '').replace(/"/g, '""'),
    parseFloat(l.valor || 0).toFixed(2).replace('.', ','),
    l.financeiro_categorias?.nome ?? '',
    l.financeiro_contas?.nome ?? '',
    l.financeiro_formas_pgto?.nome ?? '',
    (l.observacao ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' '),
  ])
  const csv = [headers, ...linhas]
    .map(row => row.map(c => `"${c}"`).join(';'))
    .join('\n')
  // BOM pro Excel ler acentos corretamente
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `financeiro_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ===== RECORRÊNCIAS =====
let recorrencias = []
let editandoRecId = null

function abrirModalRecorrencias() {
  if (!window.AUTH?.isAdmin) {
    alert('Apenas admin pode gerenciar recorrências.')
    return
  }
  // Default: mes atual
  const d = new Date()
  document.getElementById('rec-mes-ref').value =
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  fecharFormRecorrencia()
  document.getElementById('modal-recorrencias-overlay').classList.add('active')
  carregarRecorrencias()
}

function fecharModalRecorrencias() {
  document.getElementById('modal-recorrencias-overlay').classList.remove('active')
}

async function carregarRecorrencias() {
  const lista = document.getElementById('rec-lista')
  lista.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Carregando...</div>'
  const { data, error } = await db
    .from('financeiro_recorrencias')
    .select('*, financeiro_categorias(nome), financeiro_contas(nome), financeiro_formas_pgto(nome)')
    .order('ativo', { ascending: false })
    .order('descricao', { ascending: true })
  if (error) { lista.innerHTML = `<div style="color:#c00;">Erro: ${error.message}</div>`; return }
  recorrencias = data || []
  renderRecorrencias()
}

function renderRecorrencias() {
  const lista = document.getElementById('rec-lista')
  if (!recorrencias.length) {
    lista.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Nenhuma recorrência cadastrada.</div>'
    return
  }
  lista.innerHTML = recorrencias.map(r => {
    const tipoLabel = r.tipo === 'entrada' ? '💚' : '🔴'
    const ativo = r.ativo ? '' : 'opacity:0.5;'
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #f0f0f0; ${ativo}">
        <div style="flex:1;">
          <div style="font-weight:600;">${tipoLabel} ${r.descricao} — ${formatarMoeda(parseFloat(r.valor))}</div>
          <div style="font-size:12px; color:#666;">
            Dia ${r.dia_do_mes} ·
            ${r.financeiro_contas?.nome ?? '—'} ·
            ${r.financeiro_categorias?.nome ?? '—'}
            ${r.financeiro_formas_pgto?.nome ? ' · ' + r.financeiro_formas_pgto.nome : ''}
            ${r.ativo ? '' : ' · <em>inativa</em>'}
          </div>
        </div>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="editarRecorrencia('${r.id}')">✏️</button>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="alternarRecorrencia('${r.id}', ${r.ativo})">${r.ativo ? '⏸️' : '▶️'}</button>
        <button class="btn btn-danger" onclick="excluirRecorrencia('${r.id}')">🗑️</button>
      </div>`
  }).join('')
}

function abrirFormRecorrencia() {
  editandoRecId = null
  document.getElementById('rec-form-titulo').textContent = 'Nova recorrência'
  document.getElementById('rec-descricao').value = ''
  document.getElementById('rec-tipo').value = 'saida'
  document.getElementById('rec-valor').value = ''
  aplicarMascaraMoeda(document.getElementById('rec-valor'))
  document.getElementById('rec-dia').value = 1
  preencherSelectsRec()
  document.getElementById('rec-categoria-id').value = ''
  document.getElementById('rec-conta-id').value = contas.length === 1 ? contas[0].id : ''
  document.getElementById('rec-forma-pgto-id').value = ''
  document.getElementById('rec-form').style.display = 'block'
}

function fecharFormRecorrencia() {
  document.getElementById('rec-form').style.display = 'none'
  editandoRecId = null
}

function preencherSelectsRec() {
  const cat = document.getElementById('rec-categoria-id')
  cat.innerHTML = '<option value="">— selecione —</option>' +
    categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
  const con = document.getElementById('rec-conta-id')
  con.innerHTML = '<option value="">— selecione —</option>' +
    contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
  const fp = document.getElementById('rec-forma-pgto-id')
  fp.innerHTML = '<option value="">— opcional —</option>' +
    formasPgto.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')
}

function editarRecorrencia(id) {
  const r = recorrencias.find(x => x.id === id)
  if (!r) return
  editandoRecId = id
  document.getElementById('rec-form-titulo').textContent = 'Editar recorrência'
  preencherSelectsRec()
  document.getElementById('rec-descricao').value = r.descricao
  document.getElementById('rec-tipo').value = r.tipo
  setMascaraMoedaValor(document.getElementById('rec-valor'), r.valor)
  aplicarMascaraMoeda(document.getElementById('rec-valor'))
  document.getElementById('rec-dia').value = r.dia_do_mes
  document.getElementById('rec-categoria-id').value = r.categoria_id ?? ''
  document.getElementById('rec-conta-id').value = r.conta_id ?? ''
  document.getElementById('rec-forma-pgto-id').value = r.forma_pgto_id ?? ''
  document.getElementById('rec-form').style.display = 'block'
}

async function salvarRecorrencia() {
  const payload = {
    descricao:    document.getElementById('rec-descricao').value.trim(),
    tipo:         document.getElementById('rec-tipo').value,
    valor:        lerMascaraMoeda(document.getElementById('rec-valor')),
    dia_do_mes:   parseInt(document.getElementById('rec-dia').value, 10) || 1,
    categoria_id: document.getElementById('rec-categoria-id').value || null,
    conta_id:     document.getElementById('rec-conta-id').value || null,
    forma_pgto_id:document.getElementById('rec-forma-pgto-id').value || null,
  }
  if (!payload.descricao) { alert('Descrição obrigatória'); return }
  if (payload.valor <= 0) { alert('Valor inválido'); return }
  if (!payload.conta_id)  { alert('Selecione a conta'); return }
  if (payload.dia_do_mes < 1 || payload.dia_do_mes > 31) { alert('Dia inválido'); return }

  const op = editandoRecId
    ? db.from('financeiro_recorrencias').update(payload).eq('id', editandoRecId)
    : db.from('financeiro_recorrencias').insert(payload)
  const { error } = await op
  if (error) { alert('Erro: ' + error.message); return }

  fecharFormRecorrencia()
  carregarRecorrencias()
}

async function alternarRecorrencia(id, ativoAtual) {
  const { error } = await db.from('financeiro_recorrencias')
    .update({ ativo: !ativoAtual }).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  carregarRecorrencias()
}

async function excluirRecorrencia(id) {
  if (!confirm('Excluir recorrência? Lançamentos já gerados permanecem.')) return
  const { error } = await db.from('financeiro_recorrencias').delete().eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  carregarRecorrencias()
}

async function gerarRecorrenciasDoMes() {
  const ref = document.getElementById('rec-mes-ref').value // "YYYY-MM"
  if (!ref) { alert('Informe o mês de referência.'); return }
  const [ano, mes] = ref.split('-').map(n => parseInt(n, 10))
  const { data, error } = await db.rpc('financeiro_gerar_recorrencias',
    { p_ano: ano, p_mes: mes })
  if (error) { alert('Erro ao gerar: ' + error.message); return }

  const criados = (data || []).filter(r => !r.pulado).length
  const pulados = (data || []).filter(r =>  r.pulado).length
  alert(`✅ ${criados} criado(s), ${pulados} já existia(m).`)
  carregarFinanceiro()
}

// ===== FECHAMENTO MENSAL =====
function abrirModalFechamento() {
  if (!window.AUTH?.isAdmin) {
    alert('Apenas admin pode fechar/reabrir meses.')
    return
  }
  const d = new Date()
  document.getElementById('fech-mes').value =
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  document.getElementById('modal-fechamento-overlay').classList.add('active')
  carregarFechamentos()
}

function fecharModalFechamento() {
  document.getElementById('modal-fechamento-overlay').classList.remove('active')
}

async function carregarFechamentos() {
  const lista = document.getElementById('fech-lista')
  lista.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Carregando...</div>'
  const { data, error } = await db
    .from('financeiro_fechamentos')
    .select('id, ano, mes, fechado_em, fechado_por')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
  if (error) {
    lista.innerHTML = `<div style="color:#c00; padding:12px;">Erro: ${error.message}</div>`
    return
  }
  if (!data || data.length === 0) {
    lista.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Nenhum mês fechado.</div>'
    return
  }
  lista.innerHTML = data.map(f => {
    const label = new Date(f.ano, f.mes - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const quando = f.fechado_em
      ? new Date(f.fechado_em).toLocaleDateString('pt-BR')
      : '—'
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid #f0f0f0;">
        <div style="flex:1;">
          <div style="font-weight:600; text-transform:capitalize;">🔒 ${label}</div>
          <div style="font-size:12px; color:#666;">Fechado em ${quando}</div>
        </div>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;"
          onclick="reabrirMesDireto(${f.ano}, ${f.mes})">🔓 Reabrir</button>
      </div>`
  }).join('')
}

async function fecharMesAcao() {
  const ref = document.getElementById('fech-mes').value
  if (!ref) { alert('Informe o mês.'); return }
  const [ano, mes] = ref.split('-').map(n => parseInt(n, 10))
  if (!confirm(`Fechar ${String(mes).padStart(2,'0')}/${ano}?\nApós fechar, lançamentos desse mês ficam bloqueados para alteração.`)) return
  const { error } = await db.rpc('financeiro_fechar_mes', { p_ano: ano, p_mes: mes })
  if (error) { alert('Erro: ' + error.message); return }
  carregarFechamentos()
  carregarFinanceiro()
}

async function reabrirMesAcao() {
  const ref = document.getElementById('fech-mes').value
  if (!ref) { alert('Informe o mês.'); return }
  const [ano, mes] = ref.split('-').map(n => parseInt(n, 10))
  await reabrirMesDireto(ano, mes)
}

async function reabrirMesDireto(ano, mes) {
  if (!confirm(`Reabrir ${String(mes).padStart(2,'0')}/${ano}?\nUse apenas para correções.`)) return
  const { error } = await db.rpc('financeiro_reabrir_mes', { p_ano: ano, p_mes: mes })
  if (error) { alert('Erro: ' + error.message); return }
  carregarFechamentos()
  carregarFinanceiro()
}

// ===== PRINT: redimensiona Chart.js antes de imprimir =====
// Chart.js le dimensoes do container; precisamos forca-lo a re-medir
// apos o @media print aplicar. matchMedia dispara antes do beforeprint,
// no momento certo da troca de media.
function _resizeChartsPrint() {
  if (chartPizza)  chartPizza.resize()
  if (chartBarras) chartBarras.resize()
}
const _mqlPrint = window.matchMedia('print')
if (_mqlPrint.addEventListener) {
  _mqlPrint.addEventListener('change', _resizeChartsPrint)
} else if (_mqlPrint.addListener) {
  _mqlPrint.addListener(_resizeChartsPrint)
}
window.addEventListener('beforeprint', _resizeChartsPrint)
window.addEventListener('afterprint',  _resizeChartsPrint)

// ===== ATALHOS =====
// Tecla "N" abre modal de novo lancamento (sem modificador, fora de input/modal).
// Ctrl+N e capturado pelo browser, por isso usa N sozinha.
document.addEventListener('keydown', e => {
  if (e.key !== 'n' && e.key !== 'N') return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  const tag = (document.activeElement?.tagName || '').toLowerCase()
  if (['input','textarea','select'].includes(tag)) return
  if (document.activeElement?.isContentEditable) return
  // Algum modal aberto?
  if (document.querySelector('.modal-overlay.active')) return
  if (!window.AUTH?.permissoesGranular) return
  e.preventDefault()
  abrirModal()
})

// ===== INIT =====
;(async () => {
  await aguardarAuthReady()
  await Promise.all([carregarCategorias(), carregarContas(), carregarFormasPgto()])
  await carregarFinanceiro()
  aplicarGateAcoesGranular('financeiro')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('financeiro'))
      .observe(painel, { childList: true, subtree: true })
  })
})()
