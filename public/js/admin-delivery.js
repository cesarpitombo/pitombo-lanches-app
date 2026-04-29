// ═══════════════════════════════════════════════════════════════
// PITOMBO — Admin Delivery (modo + faixas + bairros + KM + áreas)
// ═══════════════════════════════════════════════════════════════
//
// Persistência real em /api/delivery/*. Nada vive só no front.
//

(function () {
  'use strict';

  const MODES = [
    { id: 'sem_preco', icon: '🆓', title: 'Sem preço',         desc: 'Ofereça frete grátis aos seus clientes.' },
    { id: 'fixo',      icon: '💰', title: 'Preço fixo',         desc: 'O mesmo preço de envio se aplica a todos os pedidos.' },
    { id: 'bairro',    icon: '🏘️', title: 'Localidade de destino',  desc: 'O preço varia conforme a localidade / bairro de destino.' },
    { id: 'km',        icon: '📐', title: 'Distância percorrida', desc: 'O cliente paga conforme os km percorridos.' },
    { id: 'areas',     icon: '🗺️', title: 'Áreas personalizadas', desc: 'Defina áreas no mapa para calcular o preço.' },
    { id: 'faixas',    icon: '📍', title: 'Faixas personalizadas', desc: 'Calcula preço com base na distância da empresa.' },
  ];

  // Estado in-memory; recarregado da API a cada init.
  const state = {
    config: null,
    selectedMode: 'sem_preco',
    initialized: false
  };

  let dlvMap = null;
  let dlvDrawnItems = null;
  let dlvDrawControl = null;

  // ── API helper ───────────────────────────────────────────────────────────
  async function api(path, opts = {}) {
    if (typeof apiFetch === 'function') return apiFetch(path, opts);
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
    }
    return fetch(path, { ...opts, headers, body });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtPrice(v) {
    const n = parseFloat(v) || 0;
    return n.toFixed(2).replace('.', ',');
  }

  function setMsg(text, color = '#1e7d3a') {
    const el = document.getElementById('dlvConfigMsg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color;
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
  }

  // ── Render dos cards de modo (coluna esquerda) ──────────────────────────
  function renderModeCards() {
    const wrap = document.getElementById('dlvModeCards');
    if (!wrap) return;
    wrap.innerHTML = MODES.map(m => `
      <button type="button" data-mode="${m.id}"
        class="dlv-mode-card"
        style="text-align:left; padding:0.85rem 1rem; border:2px solid ${state.selectedMode === m.id ? '#1976d2' : '#e0e0e0'}; background:${state.selectedMode === m.id ? '#eff6ff' : '#fff'}; border-radius:10px; cursor:pointer; display:flex; gap:0.7rem; align-items:flex-start;">
        <span style="font-size:1.4rem;">${m.icon}</span>
        <span style="flex:1;">
          <span style="display:block; font-weight:700; color:#222; font-size:0.95rem;">${m.title}</span>
          <span style="display:block; font-size:0.78rem; color:#666; margin-top:0.15rem;">${m.desc}</span>
        </span>
      </button>
    `).join('');
    wrap.querySelectorAll('.dlv-mode-card').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedMode = btn.dataset.mode;
        renderModeCards();
        renderEditor();
      });
    });

    // Atualiza label inline na aba "Geral"
    const lbl = document.getElementById('cfgDeliveryModeLabel');
    if (lbl) {
      const m = MODES.find(x => x.id === state.selectedMode);
      lbl.textContent = m ? m.title : '—';
    }
  }

  // ── Render do editor (coluna direita) ────────────────────────────────────
  function renderEditor() {
    const body = document.getElementById('dlvEditorBody');
    if (!body) return;
    body.innerHTML = '';
    const tplMap = {
      sem_preco: 'tplDlvSemPreco',
      fixo:      'tplDlvFixo',
      km:        'tplDlvKm',
      faixas:    'tplDlvFaixas',
      bairro:    'tplDlvBairros',
      areas:     'tplDlvAreas'
    };
    const tpl = document.getElementById(tplMap[state.selectedMode]);
    if (!tpl) {
      body.innerHTML = '<p style="color:#c00;">Modo desconhecido.</p>';
      return;
    }
    body.appendChild(tpl.content.cloneNode(true));

    if (state.selectedMode === 'fixo') {
      const inp = document.getElementById('dlvPrecoFixo');
      if (inp) inp.value = state.config?.preco_fixo ?? '';
    }
    if (state.selectedMode === 'km') {
      const a = document.getElementById('dlvKmBase');
      const b = document.getElementById('dlvKmPorKm');
      const c = document.getElementById('dlvKmMax');
      if (a) a.value = state.config?.km_preco_base ?? '';
      if (b) b.value = state.config?.km_preco_por_km ?? '';
      if (c) c.value = state.config?.km_distancia_maxima ?? '';
    }
    if (state.selectedMode === 'faixas') {
      const btn = document.getElementById('dlvFaixaAddBtn');
      if (btn) btn.addEventListener('click', addFaixa);
      loadFaixas();
    }
    if (state.selectedMode === 'bairro') {
      const btn = document.getElementById('dlvBairroAddBtn');
      if (btn) btn.addEventListener('click', addBairro);
      loadBairros();
    }
    if (state.selectedMode === 'areas') {
      setTimeout(initDeliveryMap, 100);
    }
  }

  // ── FAIXAS ──────────────────────────────────────────────────────────────
  async function loadFaixas() {
    const list = document.getElementById('dlvFaixasList');
    if (!list) return;
    list.innerHTML = '<p style="color:#999; text-align:center;">Carregando…</p>';
    try {
      const r = await api('/api/delivery/faixas');
      if (!r.ok) throw new Error('falha');
      const faixas = await r.json();
      if (!faixas.length) {
        list.innerHTML = '<p style="color:#999; text-align:center; padding:1rem;">Nenhuma faixa criada. Adicione a primeira.</p>';
        return;
      }
      list.innerHTML = faixas.map(f => `
        <div data-id="${f.id}" style="display:flex; align-items:center; flex-wrap:wrap; gap:0.8rem; padding:0.6rem 0.8rem; background:#fafafa; border:1px solid #eee; border-radius:8px;">
          <button type="button" class="dlv-faixa-toggle" title="Ligar/Desligar"
            style="background:${f.ativo ? '#dff0e0' : '#fde0e0'}; border:1px solid #ccc; border-radius:5px; cursor:pointer; padding:0.4rem 0.6rem; font-size:1.1rem; flex-shrink:0;">${f.ativo ? '✅' : '⛔'}</button>
          
          <div style="display:flex; align-items:center; gap:0.4rem; flex:1; min-width:140px;">
            <span style="font-size:0.85rem; color:#555; font-weight:600;">Até</span>
            <input type="number" min="1" step="1" value="${f.cobertura_metros}" data-fld="cobertura_metros"
              style="width:90px; padding:0.4rem; border:1px solid #ccc; border-radius:5px; font-size:0.95rem; text-align:center;" placeholder="Metros">
            <span style="font-size:0.85rem; color:#555; font-weight:600;">metros</span>
          </div>

          <div style="display:flex; align-items:center; gap:0.4rem; flex:1; min-width:120px;">
            <span style="font-size:0.9rem; color:#555; font-weight:600;">€</span>
            <input type="number" min="0" step="0.01" value="${parseFloat(f.preco).toFixed(2)}" data-fld="preco"
              style="width:80px; padding:0.4rem; border:1px solid #ccc; border-radius:5px; font-size:0.95rem; text-align:center;" placeholder="Preço">
          </div>

          <button type="button" class="dlv-faixa-delete" title="Excluir"
            style="background:#fde0e0; border:1px solid #c00; color:#c00; border-radius:5px; cursor:pointer; padding:0.4rem 0.8rem; font-weight:700; flex-shrink:0; display:flex; align-items:center; gap:0.3rem;">
            <span>🗑</span> <span style="font-size:0.85rem;">Excluir</span>
          </button>
        </div>
      `).join('');

      list.querySelectorAll('input[data-fld]').forEach(inp => {
        inp.addEventListener('change', onFaixaFieldChange);
      });
      list.querySelectorAll('.dlv-faixa-toggle').forEach(b => {
        b.addEventListener('click', onFaixaToggle);
      });
      list.querySelectorAll('.dlv-faixa-delete').forEach(b => {
        b.addEventListener('click', onFaixaDelete);
      });
    } catch (e) {
      list.innerHTML = `<p style="color:#c00; text-align:center;">Erro ao carregar faixas: ${escapeHtml(e.message)}</p>`;
    }
  }

  async function addFaixa() {
    // Última faixa + 1000m de cobertura como default
    let cobertura = 1000, preco = 0;
    try {
      const r = await api('/api/delivery/faixas');
      if (r.ok) {
        const faixas = await r.json();
        if (faixas.length) {
          const last = faixas[faixas.length - 1];
          cobertura = parseInt(last.cobertura_metros, 10) + 1000;
          preco = parseFloat(last.preco) + 1;
        }
      }
    } catch (_) {}
    try {
      const r = await api('/api/delivery/faixas', { method: 'POST', body: { cobertura_metros: cobertura, preco, ativo: true } });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha ao adicionar'), '#c00');
      }
      await loadFaixas();
      setMsg('✅ Faixa adicionada');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onFaixaFieldChange(e) {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const cobertura = parseInt(row.querySelector('[data-fld="cobertura_metros"]').value, 10);
    const preco = parseFloat(row.querySelector('[data-fld="preco"]').value) || 0;
    if (!Number.isFinite(cobertura) || cobertura <= 0) return setMsg('❌ Cobertura inválida', '#c00');
    try {
      const r = await api(`/api/delivery/faixas/${id}`, {
        method: 'PUT',
        body: { cobertura_metros: cobertura, preco, ativo: true }
      });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha'), '#c00');
      }
      setMsg('✅ Faixa atualizada');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onFaixaToggle(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      const r = await api(`/api/delivery/faixas/${id}/toggle`, { method: 'PATCH' });
      if (!r.ok) return setMsg('❌ Falha ao alternar', '#c00');
      await loadFaixas();
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onFaixaDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Excluir esta faixa? Essa ação remove a linha do banco.')) return;
    try {
      const r = await api(`/api/delivery/faixas/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha'), '#c00');
      }
      await loadFaixas();
      setMsg('🗑 Faixa removida');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  // ── BAIRROS ─────────────────────────────────────────────────────────────
  async function loadBairros() {
    const list = document.getElementById('dlvBairrosList');
    if (!list) return;
    list.innerHTML = '<p style="color:#999;">Carregando…</p>';
    try {
      const r = await api('/api/delivery/bairros');
      if (!r.ok) throw new Error('falha');
      const items = await r.json();
      if (!items.length) {
        list.innerHTML = '<p style="color:#999;">Nenhum bairro cadastrado.</p>';
        return;
      }
      list.innerHTML = items.map(b => `
        <div data-id="${b.id}" style="display:grid; grid-template-columns:30px 1fr 160px 50px 50px; gap:0.5rem; align-items:center; padding:0.5rem 0.6rem; background:#fafafa; border:1px solid #eee; border-radius:8px;">
          <span style="font-size:1.1rem;">${b.ativo ? '✅' : '⛔'}</span>
          <input type="text" value="${escapeHtml(b.nome_bairro)}" data-fld="nome_bairro"
            style="padding:0.5rem; border:1px solid #ccc; border-radius:5px;">
          <input type="number" min="0" step="0.01" value="${parseFloat(b.preco).toFixed(2)}" data-fld="preco"
            style="padding:0.5rem; border:1px solid #ccc; border-radius:5px;">
          <button type="button" class="dlv-bairro-toggle"
            style="background:${b.ativo ? '#dff0e0' : '#fde0e0'}; border:1px solid #ccc; border-radius:5px; cursor:pointer; padding:0.4rem;">${b.ativo ? '⏸' : '▶'}</button>
          <button type="button" class="dlv-bairro-delete"
            style="background:#fde0e0; border:1px solid #c00; color:#c00; border-radius:5px; cursor:pointer; padding:0.4rem; font-weight:700;">🗑</button>
        </div>
      `).join('');
      list.querySelectorAll('input[data-fld]').forEach(inp => inp.addEventListener('change', onBairroFieldChange));
      list.querySelectorAll('.dlv-bairro-toggle').forEach(b => b.addEventListener('click', onBairroToggle));
      list.querySelectorAll('.dlv-bairro-delete').forEach(b => b.addEventListener('click', onBairroDelete));
    } catch (e) {
      list.innerHTML = `<p style="color:#c00;">Erro: ${escapeHtml(e.message)}</p>`;
    }
  }

  async function addBairro() {
    const nomeEl = document.getElementById('dlvBairroNome');
    const precoEl = document.getElementById('dlvBairroPreco');
    const nome = (nomeEl?.value || '').trim();
    const preco = parseFloat(precoEl?.value) || 0;
    if (!nome) return setMsg('❌ Informe o nome do bairro', '#c00');
    try {
      const r = await api('/api/delivery/bairros', { method: 'POST', body: { nome_bairro: nome, preco, ativo: true } });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha'), '#c00');
      }
      if (nomeEl) nomeEl.value = '';
      if (precoEl) precoEl.value = '';
      await loadBairros();
      setMsg('✅ Bairro adicionado');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onBairroFieldChange(e) {
    const row = e.target.closest('[data-id]');
    const id = row.dataset.id;
    const nome = row.querySelector('[data-fld="nome_bairro"]').value.trim();
    const preco = parseFloat(row.querySelector('[data-fld="preco"]').value) || 0;
    if (!nome) return setMsg('❌ Nome obrigatório', '#c00');
    try {
      const r = await api(`/api/delivery/bairros/${id}`, {
        method: 'PUT', body: { nome_bairro: nome, preco, ativo: true }
      });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha'), '#c00');
      }
      setMsg('✅ Bairro atualizado');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onBairroToggle(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      const r = await api(`/api/delivery/bairros/${id}/toggle`, { method: 'PATCH' });
      if (!r.ok) return setMsg('❌ Falha', '#c00');
      await loadBairros();
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function onBairroDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Excluir este bairro?')) return;
    try {
      const r = await api(`/api/delivery/bairros/${id}`, { method: 'DELETE' });
      if (!r.ok) return setMsg('❌ Falha', '#c00');
      await loadBairros();
      setMsg('🗑 Bairro removido');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  // ── ÁREAS (MAPA) ────────────────────────────────────────────────────────
  function initDeliveryMap() {
    const mapEl = document.getElementById('dlvAreasMap');
    if (!mapEl) return;
    if (dlvMap) {
      dlvMap.remove();
      dlvMap = null;
    }

    const lat = state.config?.store_lat || 37.0891;
    const lng = state.config?.store_lng || -8.2503;

    dlvMap = L.map('dlvAreasMap').setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(dlvMap);

    // Marcador da loja
    L.marker([lat, lng]).addTo(dlvMap).bindPopup("<b>Sua Loja</b>").openPopup();

    dlvDrawnItems = new L.FeatureGroup();
    dlvMap.addLayer(dlvDrawnItems);

    dlvDrawControl = new L.Control.Draw({
      draw: {
        polygon: true,
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
      },
      edit: false // Edição pelo draw desabilitada por enquanto (excluir e recriar é mais simples)
    });
    dlvMap.addControl(dlvDrawControl);

    dlvMap.on(L.Draw.Event.CREATED, async function (e) {
      const layer = e.layer;
      const latlngs = layer.getLatLngs()[0];
      const poly = latlngs.map(pt => ({ lat: pt.lat, lng: pt.lng }));

      const nome = prompt("Nome desta área de entrega:");
      if (!nome) return; // Cancelou
      const precoStr = prompt("Preço de entrega (ex: 5.50):");
      if (precoStr === null) return; // Cancelou

      const preco = parseFloat(precoStr.replace(',', '.')) || 0;

      try {
        const r = await api('/api/delivery/areas', {
          method: 'POST', body: { nome, preco, poligono: poly, ativo: true }
        });
        if (!r.ok) {
          const err = await r.json();
          return setMsg('❌ ' + (err.error || 'Falha'), '#c00');
        }
        setMsg('✅ Área adicionada no mapa');
        loadAreas(); // Recarrega do banco e desenha
      } catch (err) {
        setMsg('❌ ' + err.message, '#c00');
      }
    });

    loadAreas();
  }

  async function loadAreas() {
    const list = document.getElementById('dlvAreasList');
    if (!list) return;
    list.innerHTML = '<p style="color:#999;">Carregando…</p>';
    if (dlvDrawnItems) dlvDrawnItems.clearLayers();

    try {
      const r = await api('/api/delivery/areas');
      if (!r.ok) throw new Error('falha');
      const items = await r.json();
      if (!items.length) {
        list.innerHTML = '<p style="color:#999;">Nenhuma área cadastrada no momento. Desenhe no mapa.</p>';
        return;
      }

      list.innerHTML = items.map(a => {
        let npontos = 0;
        try {
          const poly = typeof a.poligono === 'string' ? JSON.parse(a.poligono) : a.poligono;
          npontos = poly.length;
          // Desenhar no mapa
          if (dlvDrawnItems) {
            const latlngs = poly.map(pt => [pt.lat, pt.lng]);
            const layer = L.polygon(latlngs, { color: '#e8420a' }).addTo(dlvDrawnItems);
            layer.bindPopup(`<b>${escapeHtml(a.nome || `Área #${a.id}`)}</b><br>€ ${fmtPrice(a.preco)}`);
          }
        } catch (err) { console.error("Polígono inválido para área", a.id, err); }

        return `
          <div data-id="${a.id}" style="display:grid; grid-template-columns:30px 1fr 100px 50px; gap:0.5rem; align-items:center; padding:0.5rem 0.6rem; background:#fafafa; border:1px solid #eee; border-radius:8px;">
            <span>${a.ativo ? '✅' : '⛔'}</span>
            <span><strong>${escapeHtml(a.nome || `Área #${a.id}`)}</strong> · ${npontos} pontos</span>
            <span>€ ${fmtPrice(a.preco)}</span>
            <button type="button" class="dlv-area-delete"
              style="background:#fde0e0; border:1px solid #c00; color:#c00; border-radius:5px; cursor:pointer; padding:0.4rem; font-weight:700;">🗑</button>
          </div>
        `;
      }).join('');
      list.querySelectorAll('.dlv-area-delete').forEach(b => b.addEventListener('click', onAreaDelete));
      
      if (dlvMap && dlvDrawnItems && dlvDrawnItems.getLayers().length > 0) {
        // Opcional: focar mapa nas áreas desenhadas (descomente se quiser)
        // dlvMap.fitBounds(dlvDrawnItems.getBounds());
      }
    } catch (e) {
      list.innerHTML = `<p style="color:#c00;">Erro: ${escapeHtml(e.message)}</p>`;
    }
  }

  async function onAreaDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Excluir esta área do mapa?')) return;
    try {
      const r = await api(`/api/delivery/areas/${id}`, { method: 'DELETE' });
      if (!r.ok) return setMsg('❌ Falha ao excluir', '#c00');
      setMsg('🗑 Área removida');
      loadAreas(); // Recarrega e remove do mapa automaticamente
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }


  // ── CONFIG (modo + parâmetros do modo + lat/lng + accept_outside) ───────
  async function loadConfig() {
    try {
      const r = await api('/api/delivery/config');
      if (!r.ok) throw new Error('cfg http ' + r.status);
      const cfg = await r.json();
      state.config = cfg;
      state.selectedMode = cfg.mode || 'sem_preco';

      const lat = document.getElementById('dlvStoreLat');
      const lng = document.getElementById('dlvStoreLng');
      if (lat) lat.value = cfg.store_lat ?? '';
      if (lng) lng.value = cfg.store_lng ?? '';

      // Tenta puxar o texto do endereço da aba principal ou backend
      const addrInp = document.getElementById('dlvStoreAddress');
      if (addrInp && !addrInp.value) {
        try {
          const resSet = await api('/api/settings');
          if (resSet.ok) {
            const set = await resSet.json();
            if (set.store_address) addrInp.value = set.store_address;
          }
        } catch(e){}
      }

      const out = document.getElementById('dlvAcceptOutside');
      if (out) out.checked = !!cfg.accept_outside_coverage;
    } catch (e) {
      console.error('[delivery] loadConfig:', e);
      setMsg('❌ ' + e.message, '#c00');
    }
  }

  async function saveConfig() {
    const payload = {
      mode: state.selectedMode,
      accept_outside_coverage: !!document.getElementById('dlvAcceptOutside')?.checked,
      store_lat: parseFloat(document.getElementById('dlvStoreLat')?.value) || null,
      store_lng: parseFloat(document.getElementById('dlvStoreLng')?.value) || null,
      store_address: document.getElementById('dlvStoreAddress')?.value || null,
    };

    if (state.selectedMode === 'fixo') {
      payload.preco_fixo = parseFloat(document.getElementById('dlvPrecoFixo')?.value) || 0;
    }
    if (state.selectedMode === 'km') {
      payload.km_preco_base = parseFloat(document.getElementById('dlvKmBase')?.value) || 0;
      payload.km_preco_por_km = parseFloat(document.getElementById('dlvKmPorKm')?.value) || 0;
      payload.km_distancia_maxima = parseFloat(document.getElementById('dlvKmMax')?.value) || 0;
    }

    try {
      const r = await api('/api/delivery/config', { method: 'PUT', body: payload });
      if (!r.ok) {
        const err = await r.json();
        return setMsg('❌ ' + (err.error || 'Falha ao salvar'), '#c00');
      }
      const cfg = await r.json();
      state.config = cfg;
      setMsg('✅ Configuração salva no banco');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  async function geocodeStore() {
    try {
      const addrInp = document.getElementById('dlvStoreAddress');
      const addr = addrInp ? addrInp.value.trim() : '';
      if (!addr) return setMsg('❌ Preencha o endereço da loja primeiro', '#c00');
      // Usa Nominatim direto do client (respeita CORS)
      setMsg('Buscando…', '#666');
      const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
      const res = await fetch(u);
      const data = await res.json();
      if (!data.length) return setMsg('❌ Endereço não localizado', '#c00');
      document.getElementById('dlvStoreLat').value = parseFloat(data[0].lat).toFixed(6);
      document.getElementById('dlvStoreLng').value = parseFloat(data[0].lon).toFixed(6);
      setMsg('✅ Coords preenchidas — clique Salvar para gravar');
    } catch (e) { setMsg('❌ ' + e.message, '#c00'); }
  }

  // ── Init ────────────────────────────────────────────────────────────────
  async function initDeliveryPanel() {
    if (!state.initialized) {
      const saveBtn = document.getElementById('dlvSaveConfigBtn');
      if (saveBtn) saveBtn.addEventListener('click', saveConfig);
      const geoBtn = document.getElementById('dlvGeocodeStoreBtn');
      if (geoBtn) geoBtn.addEventListener('click', geocodeStore);
      state.initialized = true;
    }
    await loadConfig();
    renderModeCards();
    renderEditor();
  }

  window.initDeliveryPanel = initDeliveryPanel;
})();
