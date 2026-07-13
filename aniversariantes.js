// ===== MESES =====
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const EMOJIS_MES = ['❄️','💝','🍀','🌸','🌻','☀️','🏖️','🌊','🍂','🎃','🍁','🎄'];

// ===== ESTADO =====
let todosMembros = [];
let todosFilhos  = [];

// ===== CARREGAR =====
async function carregarAniversariantes() {
  const [resMembros, resFilhos] = await Promise.all([
    db.from('membros')
      .select('id, nome, data_nascimento, telefone, ministerio')
      .not('data_nascimento', 'is', null),

    // JOIN com membros para puxar telefone do responsável
    db.from('filhos')
      .select('id, nome, data_nascimento, membro_id, membros(telefone, nome)')
      .not('data_nascimento', 'is', null),
  ]);

  if (resMembros.error) {
    console.error('Erro ao carregar membros:', resMembros.error);
    return;
  }
  if (resFilhos.error) {
    console.error('Erro ao carregar filhos:', resFilhos.error);
  }

  todosMembros = resMembros.data.filter(m => m.data_nascimento);
  todosFilhos  = (resFilhos.data || []).filter(f => f.data_nascimento);

  renderizar(todosMembros, todosFilhos);
}

// ===== EXCLUIR MEMBRO =====
async function excluirMembro(id) {
  if (!confirm('Deseja excluir este registro duplicado?')) return;

  const { error } = await db.from('membros').delete().eq('id', id);
  if (error) { alert('Erro ao excluir registro!'); console.error(error); return; }

  todosMembros = todosMembros.filter(m => m.id !== id);
  renderizar(todosMembros, todosFilhos);
}

// ===== EXCLUIR FILHO =====
async function excluirFilho(id) {
  if (!confirm('Deseja excluir este registro duplicado?')) return;

  const { error } = await db.from('filhos').delete().eq('id', id);
  if (error) { alert('Erro ao excluir registro!'); console.error(error); return; }

  todosFilhos = todosFilhos.filter(f => f.id !== id);
  renderizar(todosMembros, todosFilhos);
}

// ===== RENDERIZAR =====
function renderizar(listaMembros, listaFilhos) {
  const salvo = sessionStorage.getItem('permissoes_campos_aniversariantes')
  const perms = salvo ? JSON.parse(salvo) : {}
  const verTelefone = perms['*']?.ver || perms['telefone']?.ver || false

  const hoje    = new Date();
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth();

  // ---- Monta lista unificada ----
  const membrosFormatados = listaMembros.map(m => ({
    id:              m.id,
    nome:            m.nome,
    data_nascimento: m.data_nascimento,
    telefone:        m.telefone || null,
    ministerio:      m.ministerio || null,
    tipo:            'membro',
    responsavel:     null,
  }));

  const filhosFormatados = listaFilhos.map(f => ({
    id:              f.id,
    nome:            f.nome,
    data_nascimento: f.data_nascimento,
    telefone:        f.membros?.telefone || null,   // telefone do responsável
    responsavel:     f.membros?.nome     || null,   // nome do responsável
    ministerio:      null,
    tipo:            'filho',
  }));

  const todos = [...membrosFormatados, ...filhosFormatados];

  // ---- Ordena tudo por mês/dia ----
  todos.sort((a, b) => {
    const da = new Date(a.data_nascimento + 'T00:00:00');
    const db_ = new Date(b.data_nascimento + 'T00:00:00');
    if (da.getMonth() !== db_.getMonth()) return da.getMonth() - db_.getMonth();
    return da.getDate() - db_.getDate();
  });

  // ---- Aniversariantes do dia ----
  const doHoje = todos.filter(p => {
    const d = new Date(p.data_nascimento + 'T00:00:00');
    return d.getDate() === diaHoje && d.getMonth() === mesHoje;
  });

  const secaoHoje = document.getElementById('secao-hoje');
  const hojeGrid  = document.getElementById('hoje-grid');
  hojeGrid.innerHTML = '';

  if (doHoje.length > 0) {
    secaoHoje.style.display = 'block';
    doHoje.forEach(p => {
      const idade   = calcularIdade(p.data_nascimento);
      const emoji   = p.tipo === 'filho' ? '👶' : '🎂';
      const excluir = p.tipo === 'filho'
        ? `<button class="btn-excluir-aniv" data-acao="excluir" onclick="excluirFilho('${p.id}')">🗑️ Excluir</button>`
        : `<button class="btn-excluir-aniv" data-acao="excluir" onclick="excluirMembro('${p.id}')">🗑️ Excluir</button>`;

      hojeGrid.innerHTML += `
        <div class="card-hoje">
          <div class="aniversario-emoji">${emoji}</div>
          <h3>${p.nome}</h3>
          ${p.tipo === 'filho' ? `<p>🧒 Criança</p>` : ''}
          ${p.ministerio  ? `<p>✨ ${p.ministerio}</p>` : ''}
          ${p.responsavel ? `<p>👨‍👦 ${p.responsavel}</p>` : ''}
          ${verTelefone && p.telefone ? `<p>📱 ${p.telefone}</p>` : ''}
          ${idade !== null ? `<p>🎈 ${idade} anos hoje!</p>` : ''}
          <div class="badge-hoje">🎉 Parabéns!</div>
          ${excluir}
        </div>
      `;
    });
  } else {
    secaoHoje.style.display = 'none';
  }

  // ---- Agrupar por mês (ordem natural jan→dez) ----
  const porMes = Array.from({ length: 12 }, () => []);

  todos.forEach(p => {
    const d = new Date(p.data_nascimento + 'T00:00:00');
    porMes[d.getMonth()].push({ ...p, _dia: d.getDate(), _mes: d.getMonth() });
  });

  // Já vêm ordenados por dia pois o sort acima garantiu isso
  const container = document.getElementById('container-meses');
  container.innerHTML = '';

  // Exibe meses a partir do mês atual → dezembro → janeiro → até mês anterior
  for (let i = 0; i < 12; i++) {
    const idxMes  = (mesHoje + i) % 12;
    const pessoas = porMes[idxMes];
    if (pessoas.length === 0) continue;

    const bloco = document.createElement('div');
    bloco.className = 'mes-bloco';
    bloco.innerHTML = `
      <div class="mes-titulo">
        ${EMOJIS_MES[idxMes]} ${MESES[idxMes]}
        <span class="count">${pessoas.length} aniversariante${pessoas.length !== 1 ? 's' : ''}</span>
      </div>
      <table class="aniv-table">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Ministério / Responsável</th>
            <th>Telefone</th>
            <th>Idade</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pessoas.map(p => {
            const isHoje  = p._dia === diaHoje && p._mes === mesHoje;
            const idade   = calcularIdade(p.data_nascimento);

            const tipoBadge = p.tipo === 'filho'
              ? '<span style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">👶 Criança</span>'
              : '<span style="background:#eef5e2;color:#6b8e4e;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">👤 Membro</span>';

            // Ministério para membros, nome do responsável para filhos
            const infoExtra = p.tipo === 'filho'
              ? (p.responsavel ? `👨‍👦 ${p.responsavel}` : '—')
              : (p.ministerio  || '—');

            const excluirBtn = p.tipo === 'filho'
              ? `<button class="btn-excluir-aniv" data-acao="excluir" onclick="excluirFilho('${p.id}')">🗑️ Excluir</button>`
              : `<button class="btn-excluir-aniv" data-acao="excluir" onclick="excluirMembro('${p.id}')">🗑️ Excluir</button>`;

            return `
              <tr>
                <td><span class="dia-badge">${String(p._dia).padStart(2,'0')}</span></td>
                <td>
                  ${p.nome}
                  ${isHoje ? '<span class="hoje-badge-row">🎉 Hoje!</span>' : ''}
                </td>
                <td>${tipoBadge}</td>
                <td>${infoExtra}</td>
                <td>${verTelefone ? (p.telefone || '—') : '—'}</td>                
                <td>${idade !== null ? idade + ' anos' : '—'}</td>
                <td>${excluirBtn}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    container.appendChild(bloco);
  }

  if (container.innerHTML === '') {
    container.innerHTML = `<p class="empty-msg">Nenhum aniversariante encontrado.</p>`;
  }
}

// ===== CALCULAR IDADE =====
function calcularIdade(dataNasc) {
  if (!dataNasc) return null;
  const hoje = new Date();
  const nasc = new Date(dataNasc + 'T00:00:00');
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

// ===== FILTRAR =====
function filtrarAniversariantes() {
  const busca = document.getElementById('busca-aniv').value.toLowerCase();

  const membFiltrados = todosMembros.filter(m =>
    m.nome.toLowerCase().includes(busca) ||
    (m.ministerio ?? '').toLowerCase().includes(busca)
  );
  const filhFiltrados = todosFilhos.filter(f =>
    f.nome.toLowerCase().includes(busca) ||
    (f.membros?.nome ?? '').toLowerCase().includes(busca)
  );

  renderizar(membFiltrados, filhFiltrados);
}

// ===== INIT =====
async function init() {
  await aguardarAuthReady()
  await carregarPermissoesCampos('aniversariantes')
  await carregarAniversariantes()
  aplicarGateAcoesGranular('aniversariantes')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('aniversariantes'))
      .observe(painel, { childList: true, subtree: true })
  })
}
init()



