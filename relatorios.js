// ================================================================
//  relatorios.js — Menu Relatórios (Financeiro, Frequência de Cultos,
//  Visitantes). Frequência de Cultos é só leitura aqui — o lançamento
//  é feito direto no evento, em Agenda.
// ================================================================

// ── Helper CSV compartilhado por todos os exports desta página ──
function baixarCSV(nomeBase, headers, linhas) {
  const csv = [headers, ...linhas]
    .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeBase}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ================================================================
//  ABA: FINANCEIRO
// ================================================================
let rfLancamentos = []
let rfModo = 'saidas' // 'entradas' | 'saidas' | 'saldo'
let rfChartPizza = null
let rfChartBarras = null
const RF_COR_ENTRADA = '#2BBFB3'
const RF_COR_SAIDA   = '#e85a5a'

function rfValorEmCentavos(v) { return Math.round(parseFloat(v || 0) * 100) }
function rfFormatarMoeda(v)   { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function rfIsoMesAtual() {
  const d = new Date()
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)]
    .map(x => x.toISOString().slice(0, 10))
}
function rfIsoMesAnterior() {
  const d = new Date()
  return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 0)]
    .map(x => x.toISOString().slice(0, 10))
}
function rfIsoAnoAtual() {
  const d = new Date()
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`]
}
function rfPeriodoSelecionado() {
  const v = document.getElementById('rf-filtro-periodo').value
  if (v === 'mes-atual')    return rfIsoMesAtual()
  if (v === 'mes-anterior') return rfIsoMesAnterior()
  if (v === 'ano-atual')    return rfIsoAnoAtual()
  if (v === 'custom') {
    return [
      document.getElementById('rf-filtro-de').value || null,
      document.getElementById('rf-filtro-ate').value || null,
    ]
  }
  return [null, null] // 'tudo'
}

function rfAoMudarPeriodo() {
  const v = document.getElementById('rf-filtro-periodo').value
  document.getElementById('rf-filtro-datas-custom').style.display = (v === 'custom') ? 'flex' : 'none'
  if (v !== 'custom') carregarRelatorioFinanceiro()
}

async function carregarRelatorioFinanceiro() {
  const [de, ate] = rfPeriodoSelecionado()
  const tipo = document.getElementById('rf-filtro-tipo').value

  let q = db.from('financeiro')
    .select('*, financeiro_categorias(id, nome)')
    .order('data_pagamento', { ascending: false })
  if (de)   q = q.gte('data_pagamento', de)
  if (ate)  q = q.lte('data_pagamento', ate)
  if (tipo) q = q.eq('tipo', tipo)

  const { data, error } = await q
  if (error) { console.error('Erro ao carregar relatório financeiro:', error); return }

  rfLancamentos = data || []
  rfAtualizarResumo(rfLancamentos)
  rfRenderTabela(rfLancamentos)
  rfRenderGraficos()
}

function rfAtualizarResumo(lista) {
  const entradasC = lista.filter(l => l.tipo === 'entrada').reduce((a, l) => a + rfValorEmCentavos(l.valor), 0)
  const saidasC   = lista.filter(l => l.tipo === 'saida').reduce((a, l) => a + rfValorEmCentavos(l.valor), 0)
  document.getElementById('rf-total-entradas').textContent = rfFormatarMoeda(entradasC / 100)
  document.getElementById('rf-total-saidas').textContent   = rfFormatarMoeda(saidasC / 100)
  document.getElementById('rf-saldo').textContent          = rfFormatarMoeda((entradasC - saidasC) / 100)
}

function rfRenderTabela(lista) {
  const tbody = document.getElementById('rf-tbody')
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum lançamento encontrado.</td></tr>'
    return
  }
  tbody.innerHTML = lista.map(l => `
    <tr>
      <td>${l.data_pagamento ? new Date(l.data_pagamento).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${l.descricao ?? '—'}</td>
      <td>${l.tipo === 'entrada' ? '💚 Entrada' : '🔴 Saída'}</td>
      <td>${rfFormatarMoeda(parseFloat(l.valor || 0))}</td>
      <td>${l.financeiro_categorias?.nome ?? '—'}</td>
    </tr>
  `).join('')
}

function rfSetModo(modo) {
  rfModo = modo
  document.querySelectorAll('#aba-financeiro .rel-tab').forEach(b => b.classList.toggle('ativo', b.dataset.modo === modo))
  rfRenderGraficos()
}

function rfRenderGraficos() {
  if (typeof Chart === 'undefined') return
  const tp = document.getElementById('rf-titulo-pizza')
  const tb = document.getElementById('rf-titulo-barras')
  if (rfModo === 'entradas') {
    tp.textContent = 'Entradas por categoria'; tb.textContent = 'Entradas (últimos 12 meses)'
  } else if (rfModo === 'saidas') {
    tp.textContent = 'Saídas por categoria'; tb.textContent = 'Saídas (últimos 12 meses)'
  } else {
    tp.textContent = 'Entradas vs Saídas (período filtrado)'; tb.textContent = 'Saldo mensal (últimos 12 meses)'
  }
  rfRenderPizza()
  rfRenderBarras()
}

function rfRenderPizza() {
  const ctx = document.getElementById('rf-grafico-pizza')
  if (!ctx) return
  if (rfChartPizza) rfChartPizza.destroy()

  let labels = [], data = [], cores = []
  if (rfModo === 'saldo') {
    const ent = rfLancamentos.filter(l => l.tipo === 'entrada').reduce((a, l) => a + rfValorEmCentavos(l.valor), 0) / 100
    const sai = rfLancamentos.filter(l => l.tipo === 'saida').reduce((a, l) => a + rfValorEmCentavos(l.valor), 0) / 100
    labels = ['Entradas', 'Saídas']; data = [ent, sai]; cores = [RF_COR_ENTRADA, RF_COR_SAIDA]
  } else {
    const tipoFiltro = rfModo === 'entradas' ? 'entrada' : 'saida'
    const acc = new Map()
    rfLancamentos.filter(l => l.tipo === tipoFiltro).forEach(l => {
      const nome = l.financeiro_categorias?.nome ?? 'Sem categoria'
      acc.set(nome, (acc.get(nome) || 0) + rfValorEmCentavos(l.valor))
    })
    labels = [...acc.keys()]
    data   = [...acc.values()].map(c => c / 100)
    cores  = labels.map((_, i) => `hsl(${(i * 47) % 360} 65% 55%)`)
  }

  rfChartPizza = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: cores }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${rfFormatarMoeda(c.parsed)}` } },
      },
    },
  })
}

function rfRenderBarras() {
  const hoje = new Date()
  const meses = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    meses.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    })
  }
  const ent = new Map(meses.map(m => [m.key, 0]))
  const sai = new Map(meses.map(m => [m.key, 0]))
  rfLancamentos.forEach(l => {
    if (!l.data_pagamento) return
    const k = l.data_pagamento.slice(0, 7)
    if (!ent.has(k)) return
    const c = rfValorEmCentavos(l.valor)
    if (l.tipo === 'entrada') ent.set(k, ent.get(k) + c)
    else                      sai.set(k, sai.get(k) + c)
  })

  let datasets = []
  if (rfModo === 'entradas') {
    datasets = [{ label: 'Entradas', data: meses.map(m => ent.get(m.key) / 100), backgroundColor: RF_COR_ENTRADA }]
  } else if (rfModo === 'saidas') {
    datasets = [{ label: 'Saídas', data: meses.map(m => sai.get(m.key) / 100), backgroundColor: RF_COR_SAIDA }]
  } else {
    const valores = meses.map(m => (ent.get(m.key) - sai.get(m.key)) / 100)
    datasets = [{ label: 'Saldo', data: valores, backgroundColor: valores.map(v => v >= 0 ? RF_COR_ENTRADA : RF_COR_SAIDA) }]
  }

  const ctx = document.getElementById('rf-grafico-barras')
  if (!ctx) return
  if (rfChartBarras) rfChartBarras.destroy()
  rfChartBarras = new Chart(ctx, {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${rfFormatarMoeda(c.parsed.y)}` } },
      },
      scales: { y: { ticks: { callback: v => rfFormatarMoeda(v) } } },
    },
  })
}

function rfExportarCSV() {
  if (!rfLancamentos.length) { alert('Nada pra exportar.'); return }
  const headers = ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria']
  const linhas = rfLancamentos.map(l => [
    l.data_pagamento ?? '',
    l.tipo === 'entrada' ? 'Entrada' : 'Saída',
    l.descricao ?? '',
    parseFloat(l.valor || 0).toFixed(2).replace('.', ','),
    l.financeiro_categorias?.nome ?? '',
  ])
  baixarCSV('financeiro', headers, linhas)
}

function rfExportarPDF() {
  if (!rfLancamentos.length) { alert('Nada pra exportar.'); return }
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()
  doc.setFontSize(16); doc.text('Relatório Financeiro', 14, 20)
  doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)
  doc.autoTable({
    startY: 34,
    head: [['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria']],
    body: rfLancamentos.map(l => [
      l.data_pagamento ? new Date(l.data_pagamento).toLocaleDateString('pt-BR') : '—',
      l.descricao ?? '—',
      l.tipo === 'entrada' ? 'Entrada' : 'Saída',
      rfFormatarMoeda(parseFloat(l.valor || 0)),
      l.financeiro_categorias?.nome ?? '—',
    ]),
    headStyles: { fillColor: [43, 191, 179] },
    alternateRowStyles: { fillColor: [245, 255, 254] },
    styles: { fontSize: 9 },
  })
  doc.save(`financeiro-${Date.now()}.pdf`)
}

// ================================================================
//  ABA: FREQUÊNCIA DE CULTOS (só leitura — lançamento é na Agenda)
//  Adultos/Salão vem de eventos_igreja.total_presentes_adultos;
//  crianças vêm por sala, priorizando check-in (RPC
//  relatorios_criancas_por_sala) sobre o valor manual salvo em
//  frequencia_cultos_criancas.
// ================================================================
let _fcSalas = []
let _fcEventos = []
let _fcChart = null

async function carregarSalasFrequencia() {
  if (_fcSalas.length) return
  const { data, error } = await db.from('levinho_salas').select('id, nome, ordem').order('ordem')
  if (error) { console.error('Erro ao carregar salas:', error); return }
  _fcSalas = data || []
}

async function carregarFrequenciaCultos() {
  await carregarSalasFrequencia()

  let ini = document.getElementById('fc-ini').value
  let fim = document.getElementById('fc-fim').value
  if (!ini || !fim) {
    const f = new Date()
    const i = new Date(); i.setDate(i.getDate() - 90)
    fim = f.toISOString().slice(0, 10)
    ini = i.toISOString().slice(0, 10)
    document.getElementById('fc-ini').value = ini
    document.getElementById('fc-fim').value = fim
  }

  const { data: eventos, error } = await db.from('eventos_igreja')
    .select('id, nome, data, hora, total_presentes_adultos')
    .eq('finalidade', 'culto')
    .gte('data', ini).lte('data', fim)
    .order('data', { ascending: true })

  if (error) { console.error('Erro frequência de cultos:', error); return }

  const eventosList = eventos || []
  const ids = eventosList.map(e => e.id)

  const manualMap = new Map() // `${evento_id}|${sala_id}` -> total_manual
  if (ids.length) {
    const { data: manuais, error: errManual } = await db.from('frequencia_cultos_criancas')
      .select('evento_id, sala_id, total_manual').in('evento_id', ids)
    if (errManual) console.error('Erro ao carregar totais manuais:', errManual)
    ;(manuais || []).forEach(m => manualMap.set(`${m.evento_id}|${m.sala_id}`, m.total_manual))
  }

  const autoResultados = await Promise.all(
    eventosList.map(e => db.rpc('relatorios_criancas_por_sala', { p_evento_id: e.id, p_data: e.data }))
  )

  _fcEventos = eventosList.map((e, i) => {
    const autoData = autoResultados[i]?.data || []
    const criancas = {}
    let totalCriancas = 0
    _fcSalas.forEach(sala => {
      const auto = autoData.find(a => a.sala_id === sala.id)
      const usaCheckin = auto && auto.total_checkin > 0
      const valor = usaCheckin ? auto.total_checkin : (manualMap.get(`${e.id}|${sala.id}`) ?? null)
      criancas[sala.id] = valor
      totalCriancas += valor || 0
    })
    const adultos = e.total_presentes_adultos ?? null
    return {
      ...e,
      criancas,
      totalGeral: (adultos || 0) + totalCriancas,
      temDado: adultos != null || totalCriancas > 0,
    }
  })

  renderFrequenciaCultos()
}

function renderFrequenciaCultos() {
  const thead = document.getElementById('fc-thead')
  thead.innerHTML = `
    <tr>
      <th>Data</th><th>Culto</th><th>Hora</th><th>Adultos/Salão</th>
      ${_fcSalas.map(s => `<th>${s.nome}</th>`).join('')}
      <th>Total geral</th>
    </tr>
  `

  const lista = _fcEventos
  const comDado = lista.filter(e => e.temDado)
  const totais = comDado.map(e => e.totalGeral)
  const media = totais.length ? Math.round(totais.reduce((a, b) => a + b, 0) / totais.length) : 0
  const maior = totais.length ? Math.max(...totais) : 0
  const menor = totais.length ? Math.min(...totais) : 0

  document.getElementById('fc-stats').innerHTML = `
    <div class="stat-box"><div class="stat-num">${lista.length}</div><div class="stat-label">Cultos no período</div></div>
    <div class="stat-box verde"><div class="stat-num">${media}</div><div class="stat-label">Média geral</div></div>
    <div class="stat-box"><div class="stat-num">${maior}</div><div class="stat-label">Maior frequência</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${menor}</div><div class="stat-label">Menor frequência</div></div>
  `

  const tbody = document.getElementById('fc-tbody')
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${5 + _fcSalas.length}" style="text-align:center;">Nenhum culto encontrado no período.</td></tr>`
  } else {
    tbody.innerHTML = lista.map(e => `
      <tr>
        <td>${new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${e.nome}</td>
        <td>${e.hora ? e.hora.slice(0, 5) : '—'}</td>
        <td>${e.total_presentes_adultos ?? '—'}</td>
        ${_fcSalas.map(s => `<td>${e.criancas[s.id] ?? '—'}</td>`).join('')}
        <td><strong>${e.temDado ? e.totalGeral : '—'}</strong></td>
      </tr>
    `).join('')
  }

  renderGraficoFrequenciaCultos()
}

function renderGraficoFrequenciaCultos() {
  if (typeof Chart === 'undefined') return
  const ctx = document.getElementById('fc-grafico')
  if (!ctx) return
  if (_fcChart) _fcChart.destroy()
  const comDado = _fcEventos.filter(e => e.temDado)
  _fcChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: comDado.map(e => new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')),
      datasets: [{ label: 'Total geral', data: comDado.map(e => e.totalGeral), backgroundColor: '#2BBFB3' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  })
}

function exportarCSVFrequenciaCultos() {
  if (!_fcEventos.length) { alert('Nada pra exportar.'); return }
  const headers = ['Data', 'Culto', 'Hora', 'Adultos/Salão', ..._fcSalas.map(s => s.nome), 'Total geral']
  const linhas = _fcEventos.map(e => [
    e.data || '', e.nome || '', e.hora ? e.hora.slice(0, 5) : '',
    e.total_presentes_adultos ?? '',
    ..._fcSalas.map(s => e.criancas[s.id] ?? ''),
    e.temDado ? e.totalGeral : '',
  ])
  baixarCSV('frequencia_cultos', headers, linhas)
}

function exportarPDFFrequenciaCultos() {
  if (!_fcEventos.length) { alert('Nada pra exportar.'); return }
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()
  doc.setFontSize(16); doc.text('Relatório de Frequência de Cultos', 14, 20)
  doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)
  doc.autoTable({
    startY: 34,
    head: [['Data', 'Culto', 'Hora', 'Adultos/Salão', ..._fcSalas.map(s => s.nome), 'Total geral']],
    body: _fcEventos.map(e => [
      new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR'),
      e.nome,
      e.hora ? e.hora.slice(0, 5) : '—',
      e.total_presentes_adultos ?? '—',
      ..._fcSalas.map(s => e.criancas[s.id] ?? '—'),
      e.temDado ? e.totalGeral : '—',
    ]),
    headStyles: { fillColor: [43, 191, 179] },
    alternateRowStyles: { fillColor: [245, 255, 254] },
    styles: { fontSize: 9 },
  })
  doc.save(`frequencia-cultos-${Date.now()}.pdf`)
}

// ================================================================
//  ABA: VISITANTES
// ================================================================
let _visitantesCache = []

async function carregarRelatorioVisitantes() {
  let ini = document.getElementById('vis-ini').value
  let fim = document.getElementById('vis-fim').value
  if (!ini || !fim) {
    const f = new Date()
    const i = new Date(); i.setDate(i.getDate() - 90)
    fim = f.toISOString().slice(0, 10)
    ini = i.toISOString().slice(0, 10)
    document.getElementById('vis-ini').value = ini
    document.getElementById('vis-fim').value = fim
  }

  let q = db.from('visitantes')
    .select('id, nome, telefone, data_visita, como_conheceu, contactado')
    .order('data_visita', { ascending: false })
  if (ini) q = q.gte('data_visita', ini)
  if (fim) q = q.lte('data_visita', fim)

  const { data, error } = await q
  if (error) { console.error('Erro relatório visitantes:', error); return }
  _visitantesCache = data || []
  renderRelatorioVisitantes()
}

function renderRelatorioVisitantes() {
  const lista = _visitantesCache
  const total = lista.length
  const contactados = lista.filter(v => v.contactado).length
  const pct = total ? Math.round((contactados / total) * 100) : 0

  document.getElementById('vis-stats').innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">Visitantes no período</div></div>
    <div class="stat-box verde"><div class="stat-num">${contactados}</div><div class="stat-label">Contactados</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${pct}%</div><div class="stat-label">Taxa de contato</div></div>
  `

  const tbody = document.getElementById('vis-tbody')
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum visitante encontrado no período.</td></tr>'
    return
  }
  tbody.innerHTML = lista.map(v => `
    <tr>
      <td>${v.nome || '—'}</td>
      <td>${v.telefone || '—'}</td>
      <td>${v.data_visita ? new Date(v.data_visita + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td>${v.como_conheceu || '—'}</td>
      <td><span class="pill ${v.contactado ? 'pill-sim' : 'pill-nao'}">${v.contactado ? '✅ Sim' : '❌ Não'}</span></td>
    </tr>
  `).join('')
}

function exportarCSVVisitantes() {
  if (!_visitantesCache.length) { alert('Nada pra exportar.'); return }
  const headers = ['Nome', 'Telefone', 'Data da Visita', 'Como Conheceu', 'Contactado']
  const linhas = _visitantesCache.map(v => [
    v.nome || '', v.telefone || '', v.data_visita || '', v.como_conheceu || '', v.contactado ? 'Sim' : 'Não',
  ])
  baixarCSV('visitantes', headers, linhas)
}

function exportarPDFVisitantes() {
  if (!_visitantesCache.length) { alert('Nada pra exportar.'); return }
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()
  doc.setFontSize(16); doc.text('Relatório de Visitantes', 14, 20)
  doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)
  doc.autoTable({
    startY: 34,
    head: [['Nome', 'Telefone', 'Data da Visita', 'Como Conheceu', 'Contactado']],
    body: _visitantesCache.map(v => [
      v.nome || '—',
      v.telefone || '—',
      v.data_visita ? new Date(v.data_visita + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
      v.como_conheceu || '—',
      v.contactado ? 'Sim' : 'Não',
    ]),
    headStyles: { fillColor: [43, 191, 179] },
    alternateRowStyles: { fillColor: [245, 255, 254] },
    styles: { fontSize: 9 },
  })
  doc.save(`visitantes-${Date.now()}.pdf`)
}

// ================================================================
//  TROCA DE ABA + INIT
// ================================================================
async function trocarAbaRelatorio(nome, btn) {
  if (!temPermissaoAba('relatorios', nome, 'ver')) return

  document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('active'))
  document.getElementById('aba-' + nome).classList.add('active')
  btn.classList.add('active')

  if (nome === 'financeiro') {
    await carregarRelatorioFinanceiro()
  } else if (nome === 'frequencia_cultos') {
    await carregarFrequenciaCultos()
  } else if (nome === 'visitantes') {
    await carregarRelatorioVisitantes()
  }
}

async function init() {
  await aguardarAuthReady()

  aplicarGateAbasGranular('relatorios')
  aplicarGateAcoesGranular('relatorios')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('relatorios'))
      .observe(painel, { childList: true, subtree: true })
  })

  const btns = Array.from(document.querySelectorAll('.aba-btn'))
  const primeiraBtn = btns.find(b => b.style.display !== 'none') || btns[0]
  if (primeiraBtn) await trocarAbaRelatorio(primeiraBtn.dataset.aba, primeiraBtn)
}
init()
