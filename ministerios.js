const _supabase = db;

let ministerioAtualId = null;
let ministerioAtualNome = '';
let voluntariosCache = [];
let editandoId = null;

// =============================================
// MAPA DE MINISTÉRIOS → SLUGS DE PERMISSÃO
// =============================================
const SLUG_MINISTERIOS = {
  'comunicacao':  'ministerios_comunicacao',
  'integracao':   'ministerios_integracao',
  'levinho':      'ministerios_levinho',
  'midia':        'ministerios_midia',
  'musica':       'ministerios_musica',
  'som':          'ministerios_som',
};

// =============================================
// MAPA DE MINISTÉRIOS → PÁGINAS
// =============================================
const PAGINAS_MINISTERIOS = {
  'comunicacao':  'ministerios-comunicacao.html',
  'integracao':   'ministerios-integracao.html',
  'levinho':      'ministerios-levinho.html',
  'midia':        'ministerios-midia.html',
  'musica':       'ministerios-musica.html',
  'som':          'ministerios-som.html',
};

function normalizarNome(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolverPagina(nomeMinisterio) {
  return PAGINAS_MINISTERIOS[normalizarNome(nomeMinisterio)] || null;
}

function resolverSlug(nomeMinisterio) {
  return SLUG_MINISTERIOS[normalizarNome(nomeMinisterio)] || null;
}

// =============================================
// VERIFICA PERMISSÃO PARA VER UM MINISTÉRIO
// Fonte unica: permissoes_granular via temAcessoPagina.
// =============================================
function podeVerMinisterio(nomeMinisterio) {
  if (window.AUTH?.isAdmin) return true;
  if (typeof temAcessoPagina !== 'function') return false;

  const slug = resolverSlug(nomeMinisterio);
  // Sem subpagina propria → basta permissao geral em ministerios
  if (!slug) return temAcessoPagina('ministerios');
  // Com subpagina: especifica OU geral
  return temAcessoPagina(slug) || temAcessoPagina('ministerios');
}

// =============================================
// AGUARDA AUTH ESTAR PRONTO E CARREGA
// ✅ Resolve o bug do grid sumir (timing)
// =============================================
function aguardarAuthECarregar(tentativas = 0) {
  if (window.AUTH?.user !== null || tentativas > 30) {
    iniciarPagina();
  } else {
    setTimeout(() => aguardarAuthECarregar(tentativas + 1), 100);
  }
}

// Fase 7.2a — espera auth.js terminar (popular permissoesGranular) antes
// de aplicar gate granular. Em paralelo, dispara o carregamento dos cards.
async function iniciarPagina() {
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

  await carregarMinisterios();

  // Gate granular para botoes [data-acao] dentro de [data-aba="_default"].
  // Reaplicado via MutationObserver porque o grid e re-renderizado a cada
  // alteracao de ministerio.
  aplicarGateAcoesMinisterios();
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesMinisterios())
      .observe(painel, { childList: true, subtree: true });
  });
}

// Fase 7.2a — esconde botoes [data-acao] sem permissao em
// permissoes_granular(ministerios, _default, acao). Admin curto-circuita.
function aplicarGateAcoesMinisterios() {
  if (window.AUTH?.isAdmin) return;
  document.querySelectorAll('[data-aba]').forEach(painel => {
    const aba = painel.dataset.aba;
    painel.querySelectorAll('[data-acao]').forEach(btn => {
      const ok = (typeof temPermissaoAba === 'function')
        ? temPermissaoAba('ministerios', aba, btn.dataset.acao)
        : true;
      btn.style.display = ok ? '' : 'none';
    });
  });
}

// =============================================
// TELA 1 — MINISTÉRIOS
// =============================================

async function carregarMinisterios() {
  const { data: ministerios, error } = await _supabase
    .from('ministerios')
    .select('*')
    .order('nome');

  if (error) { console.error(error); return; }

  const { data: voluntarios } = await _supabase
    .from('voluntarios')
    .select('ministerio_ids');

  const contagem = {};
  (voluntarios || []).forEach(v => {
    const ids = Array.isArray(v.ministerio_ids) ? v.ministerio_ids : [];
    ids.forEach(id => {
      contagem[id] = (contagem[id] || 0) + 1;
    });
  });

  const grid = document.getElementById('ministerios-grid');
  grid.innerHTML = '';

  // ✅ Filtra apenas os ministérios que o usuário pode ver
  const ministeriosVisiveis = ministerios.filter(m => podeVerMinisterio(m.nome));

  if (ministeriosVisiveis.length === 0) {
    grid.innerHTML = `
      <p style="color:#aaa; grid-column:1/-1; text-align:center; padding:40px;">
        Nenhum ministério disponível para seu perfil.
      </p>`;
    return;
  }

  ministeriosVisiveis.forEach(m => {
    const qtd    = contagem[m.id] || 0;
    const pagina = resolverPagina(m.nome);
    const slug   = resolverSlug(m.nome);

    const card = document.createElement('div');
    card.className = 'card ministerio-card';
    card.innerHTML = `
      <div class="ministerio-icon">${m.icone}</div>
      <h3>${m.nome}</h3>
      <p>${qtd} voluntário${qtd !== 1 ? 's' : ''}</p>
      ${window.AUTH?.isAdmin ? `
        <button class="btn-excluir-ministerio" data-acao="excluir"
          onclick="excluirMinisterio(event, '${m.id}', '${m.nome}')">🗑️</button>
      ` : ''}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-excluir-ministerio')) return;

      if (pagina) {
        const isAdmin = window.AUTH?.isAdmin === true;
        const temPermEspecifica = slug !== null
          && typeof temAcessoPagina === 'function'
          && temAcessoPagina(slug);

        if (isAdmin || temPermEspecifica) {
          // Tem permissão na subpágina → redireciona
          window.location.href = pagina;
        } else {
          // Sem permissão → toast de acesso negado
          mostrarToastAcessoNegado();
        }
      } else {
        abrirMinisterio(m.id, `${m.icone} ${m.nome}`);
      }
    });

    grid.appendChild(card);
  });
}

async function excluirMinisterio(event, id, nome) {
  event.stopPropagation();

  if (!confirm(`Deseja excluir o ministério "${nome}"?\nTodos os voluntários vinculados serão desvinculados.`)) return;

  const { data: voluntarios } = await _supabase
    .from('voluntarios')
    .select('id, ministerio_ids')
    .contains('ministerio_ids', [id]);

  for (const v of (voluntarios || [])) {
    const novosIds = (v.ministerio_ids || []).filter(mid => mid !== id);
    await _supabase.from('voluntarios').update({ ministerio_ids: novosIds }).eq('id', v.id);
  }

  const { data: membros } = await _supabase
    .from('membros')
    .select('id, ministerio_ids')
    .contains('ministerio_ids', [id]);

  for (const m of (membros || [])) {
    const novosIds = (m.ministerio_ids || []).filter(mid => mid !== id);
    await _supabase.from('membros').update({ ministerio_ids: novosIds }).eq('id', m.id);
  }

  const { error } = await _supabase.from('ministerios').delete().eq('id', id);
  if (error) { alert('Erro ao excluir ministério.'); console.error(error); return; }

  carregarMinisterios();
}

// ===== MODAL MINISTÉRIO =====
function abrirModalMinisterio() {
  document.getElementById('input-icone').value = '';
  document.getElementById('input-nome-ministerio').value = '';
  document.getElementById('modal-ministerio').classList.add('active');
}

function fecharModalMinisterio() {
  document.getElementById('modal-ministerio').classList.remove('active');
}

async function salvarMinisterio() {
  const icone = document.getElementById('input-icone').value.trim() || '✨';
  const nome  = document.getElementById('input-nome-ministerio').value.trim();

  if (!nome) { alert('Informe o nome do ministério.'); return; }

  const { error } = await _supabase.from('ministerios').insert([{ nome, icone }]);
  if (error) { alert('Erro ao salvar ministério.'); console.error(error); return; }

  fecharModalMinisterio();
  carregarMinisterios();
}

// =============================================
// TELA 2 — VOLUNTÁRIOS (inline, sem subpágina)
// =============================================

async function abrirMinisterio(id, nome) {
  ministerioAtualId = id;
  ministerioAtualNome = nome;

  document.getElementById('titulo-ministerio').textContent = nome;
  document.getElementById('tela-ministerios').style.display = 'none';
  document.getElementById('tela-voluntarios').style.display = 'block';
  document.getElementById('busca-voluntario').value = '';

  await carregarVoluntarios();
}

function voltarMinisterios() {
  ministerioAtualId = null;
  document.getElementById('tela-voluntarios').style.display = 'none';
  document.getElementById('tela-ministerios').style.display = 'block';
  carregarMinisterios();
}

async function carregarVoluntarios() {
  const { data, error } = await _supabase
    .from('voluntarios')
    .select('*')
    .contains('ministerio_ids', [ministerioAtualId])
    .order('nome');

  if (error) { console.error(error); return; }
  voluntariosCache = data || [];
  renderizarTabela(voluntariosCache);
}

function renderizarTabela(lista) {
  const tbody = document.getElementById('tabela-voluntarios');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:#aaa; padding:30px;">
          Nenhum voluntário cadastrado neste ministério.
        </td>
      </tr>`;
    return;
  }

  lista.forEach(v => {
    const nascimento = v.nascimento
      ? new Date(v.nascimento + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—';

    const mesaInfo = v.participa_mesa === 'sim'
      ? `✅ ${v.mesa || 'Sim'}`
      : '❌ Não';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.nome}</td>
      <td>${v.telefone || '—'}</td>
      <td>${v.endereco || '—'}</td>
      <td>${nascimento}</td>
      <td>${mesaInfo}</td>
      <td>
        <span class="badge ${v.status === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">
          ${v.status}
        </span>
      </td>
      <td style="display:flex; gap:6px;">
        <button class="btn btn-primary" style="padding:6px 12px; font-size:12px;"
          onclick="editarVoluntario('${v.id}')">✏️ Editar</button>
        <button class="btn btn-danger"
          onclick="excluirVoluntario('${v.id}')">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filtrarVoluntarios() {
  const termo = document.getElementById('busca-voluntario').value.toLowerCase();
  const filtrados = voluntariosCache.filter(v =>
    v.nome.toLowerCase().includes(termo) ||
    (v.telefone && v.telefone.toLowerCase().includes(termo)) ||
    (v.endereco && v.endereco.toLowerCase().includes(termo)) ||
    (v.mesa     && v.mesa.toLowerCase().includes(termo))
  );
  renderizarTabela(filtrados);
}

function toggleMesa() {
  const val = document.getElementById('input-participa-mesa').value;
  document.getElementById('campo-mesa').style.display = val === 'sim' ? 'block' : 'none';
  if (val === 'nao') document.getElementById('input-mesa').value = '';
}

function abrirModalVoluntario() {
  editandoId = null;
  document.getElementById('modal-titulo-voluntario').textContent = 'Novo Voluntário';
  document.getElementById('input-nome').value           = '';
  document.getElementById('input-telefone').value       = '';
  document.getElementById('input-endereco').value       = '';
  document.getElementById('input-nascimento').value     = '';
  document.getElementById('input-participa-mesa').value = 'nao';
  document.getElementById('input-mesa').value           = '';
  document.getElementById('campo-mesa').style.display   = 'none';
  document.getElementById('input-status').value         = 'Ativo';
  document.getElementById('modal-voluntario').classList.add('active');
}

function fecharModalVoluntario() {
  document.getElementById('modal-voluntario').classList.remove('active');
}

async function salvarVoluntario() {
  const participaMesa = document.getElementById('input-participa-mesa').value;

  const dados = {
    nome:           document.getElementById('input-nome').value.trim(),
    telefone:       document.getElementById('input-telefone').value.trim(),
    endereco:       document.getElementById('input-endereco').value.trim(),
    nascimento:     document.getElementById('input-nascimento').value || null,
    participa_mesa: participaMesa,
    mesa:           participaMesa === 'sim'
                      ? document.getElementById('input-mesa').value.trim()
                      : null,
    ministerio_ids: [ministerioAtualId],
    ministerio_id:  ministerioAtualId,
    status:         document.getElementById('input-status').value,
  };

  if (!dados.nome) { alert('Informe o nome do voluntário.'); return; }

  if (editandoId) {
    const original  = voluntariosCache.find(x => x.id === editandoId);
    const idsAtuais = Array.isArray(original?.ministerio_ids) ? original.ministerio_ids : [];
    dados.ministerio_ids = idsAtuais.includes(ministerioAtualId)
      ? idsAtuais
      : [...idsAtuais, ministerioAtualId];

    await _supabase.from('voluntarios').update(dados).eq('id', editandoId);
  } else {
    await _supabase.from('voluntarios').insert([dados]);
  }

  fecharModalVoluntario();
  carregarVoluntarios();
}

function editarVoluntario(id) {
  const v = voluntariosCache.find(x => x.id === id);
  if (!v) return;
  editandoId = id;
  document.getElementById('modal-titulo-voluntario').textContent  = 'Editar Voluntário';
  document.getElementById('input-nome').value                     = v.nome;
  document.getElementById('input-telefone').value                 = v.telefone || '';
  document.getElementById('input-endereco').value                 = v.endereco || '';
  document.getElementById('input-nascimento').value               = v.nascimento || '';
  document.getElementById('input-participa-mesa').value           = v.participa_mesa || 'nao';
  document.getElementById('input-mesa').value                     = v.mesa || '';
  document.getElementById('campo-mesa').style.display             = v.participa_mesa === 'sim' ? 'block' : 'none';
  document.getElementById('input-status').value                   = v.status;
  document.getElementById('modal-voluntario').classList.add('active');
}

async function excluirVoluntario(id) {
  if (!confirm('Deseja excluir este voluntário?')) return;
  await _supabase.from('voluntarios').delete().eq('id', id);
  carregarVoluntarios();
}

// =============================================
// TOAST — ACESSO NEGADO
// =============================================
function mostrarToastAcessoNegado() {
  const existente = document.getElementById('toast-acesso-negado');
  if (existente) existente.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-acesso-negado';
  toast.innerHTML = '🔒 Você não tem permissão para acessar este ministério.';
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: #e74c3c;
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.18);
    z-index: 9999;
    white-space: nowrap;
    animation: fadeInUp 0.3s ease;
  `;

  if (!document.getElementById('style-toast-anim')) {
    const style = document.createElement('style');
    style.id = 'style-toast-anim';
    style.textContent = `
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateX(-50%) translateY(12px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// =============================================
// INIT
// =============================================
aguardarAuthECarregar();