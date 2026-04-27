/**
 * admin-impressoras.js
 * Gerenciador de Impressoras Térmicas ESC/POS — Pitombo Lanches
 *
 * Funcionalidades:
 * - Listar impressoras salvas no banco
 * - Procurar USB via Windows Spooler (WMIC/PowerShell)
 * - Procurar na rede local (scan subnet porta 9100)
 * - Testar conexão TCP por IP antes de salvar
 * - Testar impressão física (ESC/POS binário via TCP ou Windows Spooler)
 * - Cadastro manual (nome, IP, porta, tipo, setor, papel)
 */

// ─── Listar impressoras cadastradas ──────────────────────────────────────────
window.carregarImpressoras = async function () {
  const container = document.getElementById('grid-impressoras');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:3rem;color:#888;grid-column:1/-1;">Carregando...</div>';

  try {
    const res  = await apiFetch('/api/impressoras');
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:3rem;background:#fff;border:2px dashed #ccc;border-radius:12px;grid-column:1/-1;">
          <div style="font-size:3rem;margin-bottom:1rem;">🖨️</div>
          <h3 style="color:#555;margin-bottom:0.5rem;">Nenhuma impressora cadastrada</h3>
          <p style="color:#888;margin-bottom:1.5rem;">Use os botões acima para procurar ou adicionar manualmente.</p>
          <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
            <button onclick="procurarUSB()" style="background:#e3f2fd;color:#1565c0;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;">💻 Procurar USB (Windows)</button>
            <button onclick="procurarNaRede()" style="background:#e8f5e9;color:#2e7d32;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;">🌐 Procurar na Rede</button>
            <button onclick="abrirModalNovaImpressora()" style="background:#111;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;">+ Adicionar Manual</button>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = data.map(imp => _renderCard(imp)).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:red;background:#fee2e2;padding:1.5rem;border-radius:12px;grid-column:1/-1;">Erro: ${err.message}</div>`;
  }
};

function _renderCard(imp) {
  const statusMap = {
    online:      { bg: '#16a34a', label: '🟢 ONLINE'   },
    offline:     { bg: '#6b7280', label: '⚫ OFFLINE'   },
    erro:        { bg: '#dc2626', label: '🔴 ERRO'      },
    nao_testada: { bg: '#9ca3af', label: '⚪ NÃO TESTADA' },
  };
  const s = statusMap[imp.ultimo_status] || statusMap['nao_testada'];

  const tipoIcon = imp.tipo_conexao === 'rede' ? '🌐' : '💻';
  const enderecoDisplay = imp.tipo_conexao === 'rede'
    ? `${imp.ip}:${imp.porta}`
    : `Fila: ${imp.ip || imp.nome}`;

  const lastCheck = imp.ultima_verificacao
    ? new Date(imp.ultima_verificacao).toLocaleString('pt-BR')
    : 'Nunca';

  return `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:1.5rem;display:flex;flex-direction:column;position:relative;overflow:hidden;">
    ${imp.padrao ? '<div style="position:absolute;top:0;right:0;background:#fef08a;color:#854d0e;padding:4px 16px;font-size:0.7rem;font-weight:bold;border-bottom-left-radius:12px;">⭐ PADRÃO</div>' : ''}

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">
      <div>
        <h3 style="margin:0 0 0.4rem 0;font-size:1.05rem;">${tipoIcon} ${imp.nome}</h3>
        <span style="background:${s.bg};color:#fff;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:bold;">${s.label}</span>
      </div>
    </div>

    <div style="font-size:0.83rem;color:#4b5563;background:#f9fafb;padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
      <div style="margin-bottom:0.25rem;"><strong>Endereço:</strong> ${enderecoDisplay}</div>
      <div style="margin-bottom:0.25rem;"><strong>Setor:</strong> ${imp.setor} &nbsp;|&nbsp; <strong>Papel:</strong> ${imp.papel_mm}mm</div>
      <div style="color:#9ca3af;font-size:0.73rem;">Último teste: ${lastCheck}</div>
      ${imp.ultimo_erro ? `<div style="margin-top:0.4rem;color:#dc2626;font-size:0.73rem;word-break:break-all;">⚠ ${imp.ultimo_erro}</div>` : ''}
    </div>

    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:auto;">
      <button onclick="pingarConexao(${imp.id})" style="background:#f3f4f6;color:#1f2937;border:1px solid #d1d5db;padding:7px 10px;border-radius:8px;font-weight:bold;cursor:pointer;flex:1;" title="Testar conexão TCP">📡 Ping</button>
      <button onclick="testarImpressaoFisica(${imp.id},'${imp.nome.replace(/'/g, "\\'")}')" style="background:#1976d2;color:#fff;border:none;padding:7px 10px;border-radius:8px;font-weight:bold;cursor:pointer;flex:1;" title="Imprimir ticket de teste">🖨️ Imprimir</button>
      <button onclick="removerImpressora(${imp.id})" style="background:#fee2e2;color:#b91c1c;border:none;padding:7px 10px;border-radius:8px;font-weight:bold;cursor:pointer;" title="Remover">🗑️</button>
      <button onclick="abrirModalNovaImpressora(${imp.id},'${imp.nome.replace(/'/g, "\\'")}',' ${imp.ip}',${imp.porta},'${imp.tipo_conexao}','${imp.setor}',${imp.papel_mm},${imp.ativa},${imp.padrao})" style="background:#e5e7eb;color:#374151;border:none;padding:7px 10px;border-radius:8px;font-weight:bold;cursor:pointer;" title="Editar">✏️</button>
    </div>
  </div>`;
}

// ─── Modal abrir/fechar ───────────────────────────────────────────────────────
window.abrirModalNovaImpressora = function (id='', nome='', ip='', porta=9100, tipo='rede', setor='geral', papel=80, ativa=true, padrao=false) {
  document.getElementById('imp_id').value    = id;
  document.getElementById('imp_nome').value  = nome;
  document.getElementById('imp_ip').value    = ip.trim();
  document.getElementById('imp_porta').value = porta;
  document.getElementById('imp_tipo').value  = tipo;
  document.getElementById('imp_setor').value = setor;
  document.getElementById('imp_papel').value = papel;
  document.getElementById('imp_ativa').checked  = ativa;
  document.getElementById('imp_padrao').checked = padrao;

  document.getElementById('modalImpressoraTitulo').innerText = id ? 'Editar Impressora' : 'Adicionar Impressora';
  _resetarBotaoTesteModal();
  document.getElementById('modalImpressora').style.display = 'flex';
};

function _resetarBotaoTesteModal() {
  const btn = document.getElementById('btnTestarIpModal');
  if (!btn) return;
  btn.textContent  = '📡 Testar Conexão';
  btn.style.background = '#6b7280';
  btn.disabled = false;
}

// ─── Procurar USB (Windows Spooler) ──────────────────────────────────────────
window.procurarUSB = async function () {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '🔍 Buscando...'; }

  try {
    const res  = await apiFetch('/api/impressoras/descobrir', { method: 'POST' });
    const data = await res.json();

    if (!data.ok) {
      alert('❌ Scan USB falhou:\n' + (data.error || data.message || 'Erro desconhecido'));
      return;
    }
    if (!data.impressoras?.length) {
      alert('Nenhuma impressora encontrada nas filas do Windows.\n\nVerifique se a impressora está instalada em "Dispositivos e Impressoras" do Windows.');
      return;
    }

    _mostrarResultadoUBS(data.impressoras);
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💻 Procurar USB (Windows)'; }
  }
};

function _mostrarResultadoUBS(lista) {
  const nomes = lista.map(p => `• ${p.nome} (${p.portaWindows || 'USB'}) — ${p.status}`).join('\n');
  const conf = confirm(`${lista.length} impressora(s) encontrada(s) no Windows:\n\n${nomes}\n\nDeseja cadastrar todas automaticamente?`);
  if (!conf) return;

  Promise.all(lista.map(p =>
    apiFetch('/api/impressoras', {
      method: 'POST',
      body: { nome: p.nome, ip: p.portaWindows || p.nome, porta: 0, tipo_conexao: 'windows', setor: 'balcao' }
    })
  )).then(() => {
    alert('Impressoras salvas! Configure o setor de cada uma.');
    carregarImpressoras();
  }).catch(e => alert('Erro ao salvar: ' + e.message));
}

// ─── Procurar na Rede (scan subnet porta 9100) ────────────────────────────────
window.procurarNaRede = async function () {
  const btn = event?.target;

  // Mostrar painel de progresso inline
  const container = document.getElementById('grid-impressoras');
  const progressHtml = `
    <div id="scanProgress" style="grid-column:1/-1;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:12px;padding:1.5rem;text-align:center;">
      <div style="font-size:2rem;margin-bottom:0.5rem;">🌐</div>
      <div style="font-weight:bold;color:#2e7d32;margin-bottom:0.5rem;">Varrendo rede local...</div>
      <div id="scanMsg" style="color:#555;font-size:0.9rem;">Detectando faixa de IP do servidor...</div>
      <div style="margin-top:1rem;background:#c8e6c9;border-radius:4px;height:8px;overflow:hidden;">
        <div id="scanBar" style="height:100%;background:#2e7d32;width:0%;transition:width 0.3s;"></div>
      </div>
      <div style="margin-top:0.75rem;font-size:0.8rem;color:#666;">Isso pode levar até 10 segundos</div>
    </div>`;

  // Prepend progress panel
  container.insertAdjacentHTML('afterbegin', progressHtml);
  if (btn) { btn.disabled = true; btn.textContent = '🌐 Varrendo...'; }

  // Animate bar
  let pct = 0;
  const barTimer = setInterval(() => {
    pct = Math.min(pct + 2, 90);
    const bar = document.getElementById('scanBar');
    if (bar) bar.style.width = pct + '%';
  }, 200);

  try {
    const msgEl = document.getElementById('scanMsg');
    if (msgEl) msgEl.textContent = 'Testando 254 endereços na porta 9100...';

    const res  = await apiFetch('/api/impressoras/escanear-rede', { method: 'POST', body: {} });
    const data = await res.json();

    clearInterval(barTimer);
    const bar = document.getElementById('scanBar');
    if (bar) bar.style.width = '100%';

    const prog = document.getElementById('scanProgress');
    if (prog) prog.remove();

    if (!data.ok) { alert('Erro no scan: ' + data.error); return; }

    if (!data.encontradas?.length) {
      alert(`${data.message}\n\nDica: Verifique se a impressora está ligada e na mesma rede Wi-Fi/Ethernet do servidor.\nSua rede detectada: ${data.subnet || 'desconhecida'}`);
      return;
    }

    _mostrarResultadoRede(data);
  } catch (e) {
    clearInterval(barTimer);
    const prog = document.getElementById('scanProgress');
    if (prog) prog.remove();
    alert('Erro no scan de rede: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🌐 Procurar na Rede'; }
  }
};

function _mostrarResultadoRede(data) {
  const lista = data.encontradas;
  const linhas = lista.map(ip => `• ${ip}:${data.porta}`).join('\n');

  if (lista.length === 1) {
    const conf = confirm(`✅ 1 impressora encontrada na rede:\n\n${linhas}\n\nDeseja cadastrá-la agora?`);
    if (conf) {
      abrirModalNovaImpressora('', 'Impressora Rede', lista[0], data.porta, 'rede', 'geral', 80, true, false);
    }
    return;
  }

  // Multiple: show selection
  const escolhido = prompt(
    `${lista.length} IPs com porta ${data.porta} aberta encontrados:\n\n${linhas}\n\nDigite o IP que deseja cadastrar (ou cancele para fechar):`,
    lista[0]
  );
  if (escolhido && lista.includes(escolhido.trim())) {
    abrirModalNovaImpressora('', 'Impressora Rede', escolhido.trim(), data.porta, 'rede', 'geral', 80, true, false);
  }
}

// ─── Testar IP direto do modal (antes de salvar) ─────────────────────────────
window.testarIpModal = async function () {
  const ip   = document.getElementById('imp_ip')?.value?.trim();
  const porta = document.getElementById('imp_porta')?.value || 9100;
  const tipo  = document.getElementById('imp_tipo')?.value;
  const btn   = document.getElementById('btnTestarIpModal');

  if (tipo === 'windows') {
    alert('Para impressoras USB/Windows, o teste é feito pelo botão "🖨️ Imprimir" após salvar.');
    return;
  }
  if (!ip) { alert('Digite o IP da impressora antes de testar.'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Testando...';
  btn.style.background = '#f59e0b';

  try {
    const res  = await apiFetch('/api/impressoras/testar-ip', { method: 'POST', body: { ip, porta } });
    const data = await res.json();

    if (data.ok) {
      btn.textContent  = '✅ Online!';
      btn.style.background = '#16a34a';
    } else {
      btn.textContent  = '❌ Offline';
      btn.style.background = '#dc2626';
      btn.title = data.message;
    }
  } catch (e) {
    btn.textContent  = '❌ Erro';
    btn.style.background = '#dc2626';
  } finally {
    btn.disabled = false;
    // Reset after 4s
    setTimeout(_resetarBotaoTesteModal, 4000);
  }
};

// ─── Salvar formulário ────────────────────────────────────────────────────────
document.addEventListener('submit', async (e) => {
  if (!e.target || e.target.id !== 'formImpressora') return;
  e.preventDefault();

  const id   = document.getElementById('imp_id').value;
  const tipo = document.getElementById('imp_tipo').value;

  const payload = {
    nome:         document.getElementById('imp_nome').value.trim(),
    ip:           document.getElementById('imp_ip').value.trim() || '127.0.0.1',
    porta:        parseInt(document.getElementById('imp_porta').value, 10) || 9100,
    tipo_conexao: tipo,
    setor:        document.getElementById('imp_setor').value,
    papel_mm:     parseInt(document.getElementById('imp_papel').value, 10) || 80,
    ativa:        document.getElementById('imp_ativa').checked,
    padrao:       document.getElementById('imp_padrao').checked,
  };

  const method = id ? 'PUT' : 'POST';
  const url    = id ? `/api/impressoras/${id}` : '/api/impressoras';

  try {
    const r = await apiFetch(url, { method, body: payload });
    if (!r.ok) throw new Error('Falha HTTP ' + r.status);
    document.getElementById('modalImpressora').style.display = 'none';
    carregarImpressoras();
  } catch (err) {
    alert('Falha ao salvar:\n' + err.message);
  }
});

// ─── Ping conexão de impressora salva ─────────────────────────────────────────
window.pingarConexao = async function (id) {
  try {
    const r    = await apiFetch(`/api/impressoras/${id}/testar-conexao`, { method: 'POST' });
    const data = await r.json();
    const icon = data.ok ? '✅' : '❌';
    alert(`${icon} ${data.status?.toUpperCase() || ''}\n\n${data.message}`);
    carregarImpressoras();
  } catch (e) {
    alert('Erro ao pingar: ' + e.message);
  }
};

// ─── Imprimir ticket de teste físico ─────────────────────────────────────────
window.testarImpressaoFisica = async function (id, nome) {
  if (!confirm(`Enviar ticket de teste para "${nome}"?\n\nA impressora deve estar ligada.`)) return;
  try {
    const r    = await apiFetch(`/api/impressoras/${id}/testar-impressao`, { method: 'POST' });
    const data = await r.json();
    alert(data.ok ? `✅ ${data.message}` : `❌ Falha:\n${data.message}`);
    carregarImpressoras();
  } catch (e) {
    alert('Erro ao imprimir: ' + e.message);
  }
};

// ─── Remover impressora ───────────────────────────────────────────────────────
window.removerImpressora = async function (id) {
  if (!confirm('Remover esta impressora? O PDV não conseguirá mais imprimir nela.')) return;
  try {
    await apiFetch(`/api/impressoras/${id}`, { method: 'DELETE' });
    carregarImpressoras();
  } catch (e) {
    alert('Erro ao remover: ' + e.message);
  }
};

// ─── Alias retrocompat (era "descobrirImpressorasOS") ─────────────────────────
window.descobrirImpressorasOS = window.procurarUSB;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOPRINT PITOMBO — Devices, Pareamento, Setores
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Gerar código de pareamento ──────────────────────────────────────────────
window.gerarCodigoPareamento = async function () {
  try {
    const res = await apiFetch('/api/devices/pair-code', { method: 'POST', body: {} });
    const data = await res.json();
    if (!res.ok) { alert('Erro ao gerar código: ' + (data.error || 'desconhecido')); return; }

    const display = document.getElementById('pair-code-display');
    const value   = document.getElementById('pair-code-value');
    if (display && value) {
      value.textContent = data.codigo || '------';
      display.style.display = 'block';
      // Auto-hide after 10 min
      setTimeout(() => { display.style.display = 'none'; }, 600000);
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

// ─── Carregar devices pareados ───────────────────────────────────────────────
window.carregarDevices = async function () {
  const container = document.getElementById('devices-list');
  if (!container) return;

  try {
    const res  = await apiFetch('/api/devices');
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:1.5rem; background:#f9fafb; border-radius:8px; border:1px dashed #d1d5db; color:#888; font-size:0.9rem;">
          Nenhum device pareado ainda. Clique em <strong>"Gerar código de pareamento"</strong> e digite o código no app AutoPrint Desktop.
        </div>`;
      return;
    }

    container.innerHTML = data.map(dev => _renderDeviceCard(dev)).join('');
  } catch (e) {
    container.innerHTML = `<div style="color:red; grid-column:1/-1;">Erro ao carregar devices: ${e.message}</div>`;
  }
};

function _renderDeviceCard(dev) {
  const saudeMap = {
    online:   { color: '#16a34a', icon: '🟢', label: 'Conectado' },
    instavel: { color: '#f59e0b', icon: '🟡', label: 'Instável' },
    offline:  { color: '#6b7280', icon: '🔴', label: 'Desconectado' },
  };
  const s = saudeMap[dev.saude] || saudeMap.offline;

  const heartbeat = dev.heartbeat_em
    ? new Date(dev.heartbeat_em).toLocaleString('pt-BR')
    : 'Nunca';
  const ultimaImpressao = dev.ultima_impressao
    ? new Date(dev.ultima_impressao).toLocaleString('pt-BR')
    : '—';

  const setoresDisplay = Array.isArray(dev.setores_vinculados) && dev.setores_vinculados.length
    ? dev.setores_vinculados.join(', ')
    : '<span style="color:#aaa;">Nenhum setor vinculado</span>';

  return `
  <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:1rem; display:flex; flex-direction:column; gap:0.6rem;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong style="font-size:0.95rem;">🖥️ ${dev.nome || 'Device'}</strong>
        <div style="font-size:0.75rem; color:#999; margin-top:2px;">${dev.sistema || ''} ${dev.versao || ''}</div>
      </div>
      <span style="background:${s.color}20; color:${s.color}; padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:bold;">${s.icon} ${s.label}</span>
    </div>
    <div style="font-size:0.8rem; color:#4b5563; background:#f9fafb; padding:0.6rem; border-radius:6px;">
      <div>Último heartbeat: ${heartbeat}</div>
      <div>Última impressão: ${ultimaImpressao}</div>
      ${dev.ultimo_erro ? `<div style="color:#dc2626; margin-top:4px;">⚠ ${dev.ultimo_erro}</div>` : ''}
      <div style="margin-top:4px;">Setores: ${setoresDisplay}</div>
    </div>
    <div style="display:flex; gap:0.4rem; margin-top:auto;">
      <button onclick="revogarDevice(${dev.id})" style="background:#fee2e2; color:#b91c1c; border:none; padding:6px 10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.8rem;" title="Revogar acesso">🗑️ Revogar</button>
    </div>
  </div>`;
}

window.revogarDevice = async function (id) {
  if (!confirm('Revogar acesso deste device? Ele não poderá mais imprimir.')) return;
  try {
    await apiFetch(`/api/devices/${id}`, { method: 'DELETE' });
    carregarDevices();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

// ─── Carregar setores de impressão ───────────────────────────────────────────
window.carregarSetores = async function () {
  const container = document.getElementById('setores-list');
  if (!container) return;

  try {
    const res  = await apiFetch('/api/setores');
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '<span style="color:#888; font-size:0.85rem;">Nenhum setor cadastrado.</span>';
      return;
    }

    // Store globally for use in printer modal
    window._setoresCache = data;

    container.innerHTML = data.map(s => {
      const tipoColors = {
        cliente:   { bg: '#dbeafe', color: '#1e40af' },
        cozinha:   { bg: '#dcfce7', color: '#166534' },
        bar:       { bg: '#fef3c7', color: '#92400e' },
        expedicao: { bg: '#f3e8ff', color: '#6b21a8' },
        caixa:     { bg: '#fee2e2', color: '#991b1b' },
      };
      const c = tipoColors[s.tipo] || { bg: '#f3f4f6', color: '#374151' };
      return `
        <div style="background:${c.bg}; color:${c.color}; padding:6px 14px; border-radius:20px; font-size:0.82rem; font-weight:bold; display:inline-flex; align-items:center; gap:0.4rem;">
          ${s.nome}
          <button onclick="removerSetor(${s.id}, '${s.nome.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; color:${c.color}; font-size:0.9rem; opacity:0.6; padding:0; line-height:1;" title="Remover">&times;</button>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<span style="color:red;">Erro: ${e.message}</span>`;
  }
};

window.abrirModalNovoSetor = function () {
  const nome = prompt('Nome do novo setor de impressão:\n\n(Ex: Bebidas, Sobremesas, Açaí, Conferência de caixa)');
  if (!nome || !nome.trim()) return;

  const tipo = prompt('Tipo do setor:\n\nOpções: cozinha, bar, cliente, expedicao, caixa\n(Padrão: cozinha)', 'cozinha');

  apiFetch('/api/setores', {
    method: 'POST',
    body: { nome: nome.trim(), tipo: (tipo || 'cozinha').trim() }
  }).then(r => {
    if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Erro'); });
    carregarSetores();
  }).catch(e => alert('Erro ao criar setor: ' + e.message));
};

window.removerSetor = async function (id, nome) {
  if (!confirm(`Remover o setor "${nome}"?\n\nImpressoras vinculadas a este setor ficarão sem destino.`)) return;
  try {
    const r = await apiFetch(`/api/setores/${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Erro'); }
    carregarSetores();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

// ─── Override: carregarImpressoras agora também carrega devices e setores ────
const _originalCarregarImpressoras = window.carregarImpressoras;
window.carregarImpressoras = async function () {
  await _originalCarregarImpressoras();
  carregarDevices();
  carregarSetores();
};
