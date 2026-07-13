// ===== ESTADO =====
let mesas = [];
let editandoId = null;
let mesaAtualId = null;
let membrosCache = [];

// Cache global de TODOS os membros (pra autocomplete de líder no modal)
let membrosTodos = [];

// ===== ESTADO DO MAPA =====
let mapaMesaObj = null;
let mapaMesaMarkers = [];
let mapaMesaVisivel = false;
let mapaMesaGeocodificado = false;
let mapaMesaInfoWindowAberta = null;

// ===== CARREGAR MESAS =====
async function carregarMesas() {
  const { data, error } = await db.from('mesas').select('*').order('nome');

  if (error) {
    console.error('Erro ao carregar mesas:', error);
    return;
  }

  mesas = data;
  renderizarGrid(mesas);
}

// ===== CARREGAR MEMBROS PARA AUTOCOMPLETE =====
async function carregarMembrosTodos() {
  const { data, error } = await db
    .from('membros')
    .select('id, nome')
    .order('nome');
  if (error) {
    console.error('Erro ao carregar membros:', error);
    return;
  }
  membrosTodos = data || [];
}

// ===== AUTOCOMPLETE DE LÍDER =====
function iniciarAutoCompleteLider(inputId, listaId) {
  const input = document.getElementById(inputId);
  const lista = document.getElementById(listaId);
  if (!input || !lista) return;

  input.addEventListener('input', () => {
    const termo = input.value.trim().toLowerCase();
    input.dataset.membroId = '';
    lista.innerHTML = '';
    lista.style.display = 'none';
    if (termo.length < 2) return;

    const resultados = membrosTodos
      .filter(m => m.nome.toLowerCase().includes(termo))
      .slice(0, 8);
    if (resultados.length === 0) return;

    resultados.forEach(m => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `<span>${m.nome}</span>`;
      item.addEventListener('mousedown', () => {
        input.value = m.nome;
        input.dataset.membroId = m.id;
        lista.style.display = 'none';
      });
      lista.appendChild(item);
    });

    lista.style.display = 'block';
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { lista.style.display = 'none'; }, 150);
  });
}

// ===== RENDERIZAR GRID DE CARDS =====
function renderizarGrid(lista) {
  const grid = document.getElementById('mesas-grid');
  grid.innerHTML = '';

  if (lista.length === 0) {
    grid.innerHTML = `
      <p style="color:#aaa; grid-column:1/-1; text-align:center; padding:40px;">
        Nenhuma mesa cadastrada ainda.
      </p>`;
    return;
  }

  const meuMembroId = window.AUTH?.membroId ?? null;
  const ehAdmin     = !!window.AUTH?.isAdmin;

  // Não-admin só enxerga as mesas onde é líder.
  const visiveis = ehAdmin
    ? lista
    : lista.filter(m =>
        !!meuMembroId && (
          m.lider_1_membro_id === meuMembroId ||
          m.lider_2_membro_id === meuMembroId
        )
      );

  if (visiveis.length === 0) {
    grid.innerHTML = `
      <p style="color:#aaa; grid-column:1/-1; text-align:center; padding:40px;">
        ${ehAdmin ? 'Nenhuma mesa cadastrada ainda.' : 'Você ainda não está vinculado como líder de nenhuma mesa.'}
      </p>`;
    return;
  }

  visiveis.forEach(m => {
    const souLiderDestaMesa = !!meuMembroId && (
      m.lider_1_membro_id === meuMembroId ||
      m.lider_2_membro_id === meuMembroId
    );
    // Líder edita SÓ a própria mesa; admin edita/exclui qualquer.
    // Botão de líder NÃO usa data-acao pra não ser gateado pelo
    // aplicarGateAcoesGranular (líder tem editar=false na RPC).
    const btnEditarAdmin  = ehAdmin
      ? `<button class="btn-excluir-mesa" data-acao="editar"  onclick="editarMesaCard(event, '${m.id}')">✏️ Editar</button>`
      : '';
    const btnEditarLider  = (!ehAdmin && souLiderDestaMesa)
      ? `<button class="btn-excluir-mesa" onclick="editarMesaCard(event, '${m.id}')">✏️ Editar</button>`
      : '';
    const btnExcluir = ehAdmin
      ? `<button class="btn-excluir-mesa" data-acao="excluir" onclick="excluirMesa(event, '${m.id}')">🗑️ Excluir</button>`
      : '';

    const card = document.createElement('div');
    card.className = 'mesa-card';
    card.innerHTML = `
      <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 10px;">${m.nome}</h3>
      <p>👤 ${m.lider || '—'}</p>
      <p>🕐 ${m.horario || '—'}</p>
      <p>📍 ${m.local || '—'}</p>
      <p>👥 ${m.total_membros ?? 0} membro${(m.total_membros ?? 0) !== 1 ? 's' : ''}</p>
      <div style="display:flex; gap:8px; margin-top:12px;">
        ${btnEditarAdmin}${btnEditarLider}${btnExcluir}
      </div>
    `;

    card.addEventListener('click', () => abrirMesa(m.id, m.nome));
    grid.appendChild(card);
  });
}

// ===== ABRIR MESA (TELA DE MEMBROS) =====
async function abrirMesa(id, nome) {
  mesaAtualId = id;

  document.getElementById('titulo-mesa').textContent = `🟤 ${nome}`;
  document.getElementById('tela-mesas').style.display = 'none';
  document.getElementById('tela-membros').style.display = 'block';
  document.getElementById('busca-membro-mesa').value = '';

  // Reseta o mapa pois cada mesa tem seus próprios membros
  fecharMapaMesa();
  mapaMesaGeocodificado = false;
  limparMarkersMapaMesa();

  await carregarMembrosDaMesa();
}

// ===== CARREGAR MEMBROS DA MESA =====
async function carregarMembrosDaMesa() {
  const { data, error } = await db
    .from('membros')
    .select('id, nome, telefone, rua, numero, complemento, bairro, cidade, ministerio, status')
    .eq('mesa_id', mesaAtualId)
    .order('nome');

  if (error) {
    console.error('Erro ao carregar membros da mesa:', error);
    return;
  }

  membrosCache = data || [];
  renderizarMembrosMesa(membrosCache);
}

// ===== RENDERIZAR TABELA DE MEMBROS =====
function renderizarMembrosMesa(lista) {
  const tbody = document.getElementById('tabela-membros-mesa');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#aaa; padding:30px;">
          Nenhum membro nesta mesa.
        </td>
      </tr>`;
    return;
  }

  lista.forEach(m => {
    const endParts = [m.rua, m.numero, m.complemento, m.bairro, m.cidade].filter(Boolean);
    const endereco = endParts.length > 0 ? endParts.join(', ') : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.nome}</td>
      <td>${m.telefone ?? '—'}</td>
      <td>${endereco}</td>
      <td>${m.ministerio ?? '—'}</td>
      <td><span class="badge ${m.status === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">${m.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== FILTRAR MEMBROS DA MESA =====
function filtrarMembrosMesa() {
  const busca = document.getElementById('busca-membro-mesa').value.toLowerCase();
  const filtrados = membrosCache.filter(m =>
    m.nome.toLowerCase().includes(busca) ||
    (m.telefone ?? '').toLowerCase().includes(busca) ||
    (m.bairro ?? '').toLowerCase().includes(busca) ||
    (m.cidade ?? '').toLowerCase().includes(busca) ||
    (m.ministerio ?? '').toLowerCase().includes(busca)
  );
  renderizarMembrosMesa(filtrados);
}

// ===== FILTRAR MESAS =====
function filtrarMesas() {
  const busca = document.getElementById('busca-mesa').value.toLowerCase();
  const filtrados = mesas.filter(m =>
    m.nome.toLowerCase().includes(busca) ||
    (m.lider ?? '').toLowerCase().includes(busca) ||
    (m.local ?? '').toLowerCase().includes(busca)
  );
  renderizarGrid(filtrados);
}

// ===== ABRIR MODAL NOVA MESA =====
function abrirModal() {
  editandoId = null;
  document.getElementById('modal-titulo').textContent = 'Nova Mesa';
  document.getElementById('input-nome').value = '';
  document.getElementById('input-horario').value = '';
  document.getElementById('input-local').value = '';
  resetarLiderInput('input-lider-1');
  resetarLiderInput('input-lider-2');
  document.getElementById('modal-overlay').classList.add('active');
}

function resetarLiderInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.dataset.membroId = '';
}

function preencherLiderInput(id, membroId, nomeFallback) {
  const el = document.getElementById(id);
  if (!el) return;
  if (membroId) {
    const m = membrosTodos.find(x => x.id === membroId);
    el.value = m?.nome ?? nomeFallback ?? '';
    el.dataset.membroId = membroId;
  } else {
    el.value = '';
    el.dataset.membroId = '';
  }
}

// ===== FECHAR MODAL =====
function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ===== EDITAR (via card) =====
function editarMesaCard(event, id) {
  event.stopPropagation();
  const m = mesas.find(m => m.id === id);
  if (!m) return;

  editandoId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Mesa';
  document.getElementById('input-nome').value = m.nome;
  document.getElementById('input-horario').value = m.horario ?? '';
  document.getElementById('input-local').value = m.local ?? '';
  preencherLiderInput('input-lider-1', m.lider_1_membro_id, null);
  preencherLiderInput('input-lider-2', m.lider_2_membro_id, null);
  document.getElementById('modal-overlay').classList.add('active');
}

// ===== SALVAR =====
async function salvarMesa() {
  const lider1El = document.getElementById('input-lider-1');
  const lider2El = document.getElementById('input-lider-2');

  // Se o usuário digitou texto mas não selecionou ninguém da lista,
  // o membro_id fica vazio. Mantém o nome digitado no campo `lider`
  // (livre) pra retrocompat, mas avisa.
  const lider1Id   = lider1El.dataset.membroId || null;
  const lider2Id   = lider2El.dataset.membroId || null;
  const lider1Nome = lider1El.value.trim();
  const lider2Nome = lider2El.value.trim();

  if (lider1Nome && !lider1Id) {
    if (!confirm('Líder 1 não foi selecionado da lista de membros — salvar mesmo assim sem vínculo (sem dar acesso automático)?')) return;
  }
  if (lider2Nome && !lider2Id) {
    if (!confirm('Líder 2 não foi selecionado da lista de membros — salvar mesmo assim sem vínculo (sem dar acesso automático)?')) return;
  }

  const liderTexto = [lider1Nome, lider2Nome].filter(Boolean).join(' e ');

  const payload = {
    nome:              document.getElementById('input-nome').value.trim(),
    lider:             liderTexto,
    lider_1_membro_id: lider1Id,
    lider_2_membro_id: lider2Id,
    horario:           document.getElementById('input-horario').value.trim(),
    local:             document.getElementById('input-local').value.trim(),
  };

  if (!payload.nome) {
    alert('O nome da mesa é obrigatório!');
    return;
  }

  if (editandoId) {
    const { error } = await db.from('mesas').update(payload).eq('id', editandoId);
    if (error) { alert('Erro ao atualizar mesa!'); return; }
  } else {
    const { error } = await db.from('mesas').insert(payload);
    if (error) { alert('Erro ao cadastrar mesa!'); return; }
  }

  fecharModal();
  carregarMesas();
}

// ===== EXCLUIR =====
async function excluirMesa(event, id) {
  event.stopPropagation();

  const { count: totalMembros, error: errCount } = await db
    .from('membros')
    .select('id', { count: 'exact', head: true })
    .eq('mesa_id', id);

  if (errCount) {
    console.error('❌ Erro ao contar membros da mesa:', errCount);
    alert(`Erro ao verificar membros da mesa!\n\n${errCount.message}`);
    return;
  }

  const msg = totalMembros
    ? `Esta mesa tem ${totalMembros} membro(s) vinculado(s). Eles serão desvinculados (não excluídos). Deseja continuar?`
    : 'Deseja excluir esta mesa?';
  if (!confirm(msg)) return;

  if (totalMembros) {
    const { error: errUnlink } = await db
      .from('membros')
      .update({ mesa_id: null, mesa: null })
      .eq('mesa_id', id);
    if (errUnlink) {
      console.error('❌ Erro ao desvincular membros da mesa:', errUnlink);
      alert(`Erro ao desvincular membros!\n\n${errUnlink.message}`);
      return;
    }
  }

  const { error } = await db.from('mesas').delete().eq('id', id);
  if (error) {
    console.error('❌ Erro ao excluir mesa:', error);
    alert(`Erro ao excluir mesa!\n\n${error.message}`);
    return;
  }

  carregarMesas();
}

// ===== VOLTAR PARA LISTA =====
function voltarMesas() {
  mesaAtualId = null;
  membrosCache = [];
  fecharMapaMesa();
  mapaMesaGeocodificado = false;
  limparMarkersMapaMesa();
  document.getElementById('tela-membros').style.display = 'none';
  document.getElementById('tela-mesas').style.display = 'block';
  carregarMesas();
}

// ============================================================
// ===== MAPA INLINE (membros da mesa) =====
// ============================================================

async function toggleMapaMesa() {
  if (mapaMesaVisivel) fecharMapaMesa();
  else await abrirMapaMesa();
}

async function abrirMapaMesa() {
  const secao = document.getElementById('secao-mapa-mesa');
  secao.classList.add('active');
  mapaMesaVisivel = true;
  secao.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await esperarGoogleMaps();

  if (!mapaMesaObj) {
    mapaMesaObj = new google.maps.Map(document.getElementById('map-membros-mesa'), {
      center: { lat: -19.4678, lng: -42.5379 },
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }

  if (!mapaMesaGeocodificado) {
    document.getElementById('mapa-loading-mesa').style.display = 'flex';
    limparMarkersMapaMesa();
    await geocodificarMembrosMesa();
    mapaMesaGeocodificado = true;
    document.getElementById('mapa-loading-mesa').style.display = 'none';
    enquadrarMapaMesa();
  }

  google.maps.event.trigger(mapaMesaObj, 'resize');
  renderizarListaMapaMesa(membrosCache);
}

function fecharMapaMesa() {
  const secao = document.getElementById('secao-mapa-mesa');
  if (!secao) return;
  secao.classList.remove('active');
  mapaMesaVisivel = false;
  const busca = document.getElementById('mapa-busca-mesa');
  if (busca) busca.value = '';
  if (mapaMesaInfoWindowAberta) mapaMesaInfoWindowAberta.close();
}

function esperarGoogleMaps() {
  return new Promise(resolve => {
    if (window.google && window.google.maps) { resolve(); return; }
    const iv = setInterval(() => {
      if (window.google && window.google.maps) {
        clearInterval(iv);
        resolve();
      }
    }, 150);
  });
}

function limparMarkersMapaMesa() {
  mapaMesaMarkers.forEach(m => m.marker?.setMap(null));
  mapaMesaMarkers = [];
}

async function geocodificarMembrosMesa() {
  const geocoder = new google.maps.Geocoder();

  for (const membro of membrosCache) {
    const cidadePadrao = (window.APP_CONFIG && window.APP_CONFIG.CIDADE_PADRAO) || ''
    const partes = [membro.rua, membro.numero, membro.bairro, membro.cidade || cidadePadrao, 'Brasil'];
    const enderecoCompleto = partes.filter(Boolean).join(', ');

    if (!membro.rua && !membro.bairro) {
      mapaMesaMarkers.push({ id: membro.id, marker: null });
      continue;
    }

    await new Promise(resolve => {
      geocoder.geocode({ address: enderecoCompleto }, (results, status) => {
        if (status === 'OK' && results[0]) {
          membro._lat = results[0].geometry.location.lat();
          membro._lng = results[0].geometry.location.lng();
          const marker = criarMarkerMembroMesa(membro);
          mapaMesaMarkers.push({ id: membro.id, marker });
        } else {
          membro._lat = null;
          membro._lng = null;
          mapaMesaMarkers.push({ id: membro.id, marker: null });
          console.warn(`Endereço não encontrado: ${enderecoCompleto}`);
        }
        resolve();
      });
    });
  }
}

function criarMarkerMembroMesa(membro) {
  const svgPin = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
      <path d="M18 2 C9.163 2 2 9.163 2 18 C2 30.5 18 46 18 46 C18 46 34 30.5 34 18 C34 9.163 26.837 2 18 2 Z"
        fill="white" stroke="#6b8e4e" stroke-width="3"/>
      <circle cx="18" cy="17" r="8" fill="white" stroke="#6b8e4e" stroke-width="3"/>
    </svg>
  `.trim();

  const iconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgPin);

  const marker = new google.maps.Marker({
    position: { lat: membro._lat, lng: membro._lng },
    map: mapaMesaObj,
    title: membro.nome,
    icon: {
      url: iconUrl,
      scaledSize: new google.maps.Size(36, 48),
      anchor: new google.maps.Point(18, 46),
    },
  });

  const endParts = [membro.rua, membro.numero, membro.bairro].filter(Boolean);

  const conteudo = `
    <div class="map-info-box">
      <h3>${membro.nome}</h3>
      <p>📍 ${endParts.join(', ') || '—'}</p>
      <p>📞 ${membro.telefone ?? '—'}</p>
      ${membro.ministerio ? `<span class="map-badge">✨ ${membro.ministerio}</span>` : ''}
      <span class="map-badge">${membro.status}</span>
    </div>
  `;

  const infoWindow = new google.maps.InfoWindow({ content: conteudo });

  marker.addListener('click', () => {
    if (mapaMesaInfoWindowAberta) mapaMesaInfoWindowAberta.close();
    infoWindow.open(mapaMesaObj, marker);
    mapaMesaInfoWindowAberta = infoWindow;
    destacarCardMapaMesa(membro.id);
  });

  return marker;
}

function enquadrarMapaMesa() {
  const comCoords = membrosCache.filter(m => m._lat != null);
  if (!comCoords.length) return;
  const bounds = new google.maps.LatLngBounds();
  comCoords.forEach(m => bounds.extend({ lat: m._lat, lng: m._lng }));
  mapaMesaObj.fitBounds(bounds);
  if (comCoords.length === 1) mapaMesaObj.setZoom(15);
}

function renderizarListaMapaMesa(lista) {
  const container = document.getElementById('mapa-member-list-mesa');
  const count = document.getElementById('mapa-member-count-mesa');
  const comEndereco = lista.filter(m => m.rua || m.bairro);
  count.textContent = `${lista.length} membro(s) — ${comEndereco.length} com endereço`;

  container.innerHTML = '';
  lista.forEach(membro => {
    const temCoords = membro._lat != null;
    const card = document.createElement('div');
    card.className = `mapa-member-card${temCoords ? '' : ' sem-coords'}`;
    card.dataset.id = membro.id;
    const endParts = [membro.bairro, membro.cidade].filter(Boolean);
    card.innerHTML = `
      <h4>${membro.nome}</h4>
      <p>${endParts.join(', ') || '⚠️ Sem endereço'}</p>
    `;

    if (temCoords) {
      card.addEventListener('click', () => {
        mapaMesaObj.panTo({ lat: membro._lat, lng: membro._lng });
        mapaMesaObj.setZoom(16);
        const entry = mapaMesaMarkers.find(x => x.id === membro.id);
        if (entry?.marker) google.maps.event.trigger(entry.marker, 'click');
        destacarCardMapaMesa(membro.id);
      });
    }
    container.appendChild(card);
  });
}

function destacarCardMapaMesa(id) {
  document.querySelectorAll('#mapa-member-list-mesa .mapa-member-card')
    .forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`#mapa-member-list-mesa .mapa-member-card[data-id="${id}"]`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function filtrarMapaMesa() {
  const termo = document.getElementById('mapa-busca-mesa').value.toLowerCase().trim();
  const filtrados = membrosCache.filter(m =>
    m.nome.toLowerCase().includes(termo) ||
    (m.bairro ?? '').toLowerCase().includes(termo) ||
    (m.cidade ?? '').toLowerCase().includes(termo)
  );
  membrosCache.forEach(m => {
    const entry = mapaMesaMarkers.find(x => x.id === m.id);
    if (entry?.marker) entry.marker.setVisible(filtrados.some(f => f.id === m.id));
  });
  renderizarListaMapaMesa(filtrados);
}

// ===== INIT =====
;(async () => {
  await aguardarAuthReady()
  await carregarMembrosTodos()
  iniciarAutoCompleteLider('input-lider-1', 'autocomplete-lider-1')
  iniciarAutoCompleteLider('input-lider-2', 'autocomplete-lider-2')
  await carregarMesas()
  aplicarGateAcoesGranular('mesas')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('mesas'))
      .observe(painel, { childList: true, subtree: true })
  })
})()
