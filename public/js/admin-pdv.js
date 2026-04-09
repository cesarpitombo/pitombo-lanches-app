/**
 * admin-pdv.js
 * PDV Visual completo — estilo OlaClick
 * Categorias ← Produtos (cards) → Pedido lateral
 *
 * Rotas usadas (sem criar novas):
 *   GET  /api/categorias        → lista de categorias
 *   GET  /api/v2/produtos       → produtos com imagem_url, categoria_id
 *   POST /api/pedidos           → submeter pedido
 *   GET  /api/clientes/:tel/ultimo → auto-preenchimento
 */

(function () {
  'use strict';

  // ─── Estado ───────────────────────────────────────────────────────────────
  const _state = {
    categorias: [],
    produtos: [],       // todos os produtos disponíveis
    filtrados: [],      // produtos filtrados pela categoria ativa
    itens: [],          // [{ id, nome, preco, imagem_url, quantidade }]
    catAtiva: null,     // id da categoria ativa (null = todas)
    tipo: 'delivery',   // delivery | balcao | mesa
    taxaEntrega: 0,
    desconto: 0,
    loading: false,
  };

  // ─── Formatar moeda ───────────────────────────────────────────────────────
  const fmt = (v) => (typeof window.formatCurrency === 'function')
    ? window.formatCurrency(v)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ─── API ──────────────────────────────────────────────────────────────────
  const api = (url, opts) =>
    (typeof apiFetch === 'function' ? apiFetch : fetch)(url, opts);

  // ─── PdvManager ───────────────────────────────────────────────────────────
  window.PdvManager = {

    // Abrir PDV
    async open() {
      const overlay = document.getElementById('modalPdv');
      if (!overlay) { console.error('[PDV] #modalPdv não encontrado'); return; }
      overlay.style.display = 'flex';

      // Reset estado
      _state.itens       = [];
      _state.catAtiva    = null;
      _state.tipo        = 'delivery';
      _state.taxaEntrega = 0;
      _state.desconto    = 0;

      this._renderShell();
      this._applyTipo('delivery');

      // Carregar dados se ainda não carregados
      if (_state.categorias.length === 0 || _state.produtos.length === 0) {
        await this._loadDados();
      } else {
        this._renderCategorias();
        this._filtrarErender(null);
      }
      this._renderCarrinho();
    },

    // Fechar PDV
    close() {
      const overlay = document.getElementById('modalPdv');
      if (overlay) overlay.style.display = 'none';
    },

    // Carregar categorias + produtos
    async _loadDados() {
      this._setLoadingProdutos(true);
      try {
        const [resCat, resProd] = await Promise.all([
          api('/api/categorias'),
          api('/api/v2/produtos'),
        ]);

        _state.categorias = resCat.ok ? await resCat.json() : [];
        const todos = resProd.ok ? await resProd.json() : [];

        // Mapear campos (response em inglês: name, price, image_url, category_id, active)
        _state.produtos = todos
          .filter(p => p.active !== false && p.disponivel !== false)
          .map(p => ({
            id:          p.id,
            nome:        p.name || p.nome,
            preco:       parseFloat(p.price ?? p.preco ?? 0),
            imagem_url:  p.image_url || p.imagem_url || null,
            categoria_id: p.category_id || p.categoria_id || null,
            categoria_nome: p.category_name || p.categoria_nome || '',
          }));

        this._renderCategorias();
        this._filtrarErender(null);
      } catch (err) {
        console.error('[PDV] Erro ao carregar dados:', err.message);
      } finally {
        this._setLoadingProdutos(false);
      }
    },

    // Renderizar estrutura HTML do PDV dentro do overlay
    _renderShell() {
      const overlay = document.getElementById('modalPdv');
      overlay.innerHTML = `
        <div class="pdv-shell" id="pdvShell">

          <!-- ── TOPO ── -->
          <div class="pdv-topbar">
            <div class="pdv-topbar-left">
              <span class="pdv-topbar-icon">🛒</span>
              <span class="pdv-topbar-title">Novo Pedido — PDV</span>
            </div>
            <div class="pdv-tipo-tabs">
              <button class="pdv-tipo-tab active" data-tipo="delivery">🛵 Delivery</button>
              <button class="pdv-tipo-tab" data-tipo="balcao">🏪 Balcão</button>
              <button class="pdv-tipo-tab" data-tipo="mesa">🍽️ Mesa</button>
            </div>
            <button class="pdv-close" id="pdvBtnFechar" title="Fechar">✕</button>
          </div>

          <!-- ── BODY ── -->
          <div class="pdv-body">

            <!-- COLUNA: Categorias -->
            <aside class="pdv-cats" id="pdvCats">
              <div class="pdv-cats-loading">Carregando...</div>
            </aside>

            <!-- COLUNA: Produtos -->
            <section class="pdv-produtos" id="pdvProdutos">
              <div class="pdv-produtos-search">
                <input type="text" id="pdvBusca" placeholder="🔍 Buscar produto..." autocomplete="off">
              </div>
              <div class="pdv-grade" id="pdvGrade">
                <div class="pdv-loading-spinner">⏳ Carregando produtos...</div>
              </div>
            </section>

            <!-- COLUNA: Pedido -->
            <aside class="pdv-pedido" id="pdvPedido">

              <!-- Dados do cliente -->
              <div class="pdv-pedido-cliente">
                <div class="pdv-campo-grupo">
                  <input type="text" id="pdvNome" placeholder="Nome do cliente *" autocomplete="off">
                </div>
                <div class="pdv-campo-grupo">
                  <input type="tel" id="pdvFone" placeholder="Telefone / WhatsApp" autocomplete="off">
                </div>
                <div id="pdvSugestaoBox" class="pdv-sugestao" style="display:none;"></div>
                <div class="pdv-campo-grupo" id="pdvEndBox">
                  <textarea id="pdvEnd" placeholder="Endereço completo *" rows="2"></textarea>
                </div>
                <div class="pdv-campo-grupo" id="pdvMesaBox" style="display:none;">
                  <input type="number" id="pdvMesaNum" placeholder="Número da mesa *" min="1">
                </div>
              </div>

              <!-- Lista de itens -->
              <div class="pdv-itens-header">
                <span>Itens do Pedido</span>
                <span id="pdvQtdItens">0 itens</span>
              </div>
              <div class="pdv-itens-lista" id="pdvItensLista">
                <div class="pdv-itens-vazio">Clique nos produtos para adicionar →</div>
              </div>

              <!-- Totais -->
              <div class="pdv-totais">
                <div class="pdv-totais-row">
                  <span>Subtotal</span>
                  <span id="pdvSubtotal">${fmt(0)}</span>
                </div>
                <div class="pdv-totais-row pdv-taxa-row" id="pdvTaxaRow" style="display:none;">
                  <span>Taxa de entrega</span>
                  <div class="pdv-taxa-input">
                    <span class="currency-symbol">€</span>
                    <input type="number" id="pdvTaxa" value="0" min="0" step="0.01" style="width:70px;">
                  </div>
                </div>
                <div class="pdv-totais-row">
                  <span>Desconto</span>
                  <div class="pdv-taxa-input">
                    <span class="currency-symbol">€</span>
                    <input type="number" id="pdvDesconto" value="0" min="0" step="0.01" style="width:70px;">
                  </div>
                </div>
                <div class="pdv-totais-row pdv-total-final">
                  <span>Total</span>
                  <span id="pdvTotalLabel">${fmt(0)}</span>
                </div>
              </div>

              <!-- Pagamento -->
              <div class="pdv-campo-grupo">
                <select id="pdvPagto">
                  <option value="dinheiro">💵 Dinheiro</option>
                  <option value="cartao">💳 Cartão</option>
                  <option value="mbway/pix">📱 PIX / MBWay</option>
                </select>
              </div>

              <div class="pdv-campo-grupo" id="pdvTrocoBox" style="display:none;">
                <input type="number" id="pdvTroco" placeholder="Troco para (valor)" min="0" step="0.01">
              </div>

              <!-- Observações -->
              <div class="pdv-campo-grupo">
                <textarea id="pdvObs" placeholder="Observações do pedido (opcional)" rows="2"></textarea>
              </div>

              <!-- Botão confirmar -->
              <button class="pdv-btn-confirmar" id="pdvBtnConfirmar">
                ✅ Confirmar Pedido
              </button>
            </aside>

          </div>
        </div>
      `;

      // Eventos da shell
      document.getElementById('pdvBtnFechar').addEventListener('click', () => this.close());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

      // Tipo de pedido
      document.querySelectorAll('.pdv-tipo-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.pdv-tipo-tab').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this._applyTipo(e.target.dataset.tipo);
        });
      });

      // Busca
      let searchTimer;
      document.getElementById('pdvBusca').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => this._buscar(e.target.value.trim()), 200);
      });

      // Taxa e desconto
      document.getElementById('pdvTaxa').addEventListener('input', (e) => {
        _state.taxaEntrega = parseFloat(e.target.value) || 0;
        this._renderTotais();
      });
      document.getElementById('pdvDesconto').addEventListener('input', (e) => {
        _state.desconto = parseFloat(e.target.value) || 0;
        this._renderTotais();
      });

      // Pagamento → troco
      document.getElementById('pdvPagto').addEventListener('change', (e) => {
        document.getElementById('pdvTrocoBox').style.display =
          e.target.value === 'dinheiro' ? 'block' : 'none';
      });

      // Auto-preenchimento por telefone
      document.getElementById('pdvFone').addEventListener('blur', (e) => this._autofill(e.target.value));

      // Confirmar pedido
      document.getElementById('pdvBtnConfirmar').addEventListener('click', () => this._confirmar());
    },

    // ─── Tipo de pedido ───────────────────────────────────────────────────
    _applyTipo(tipo) {
      _state.tipo = tipo;
      const endBox  = document.getElementById('pdvEndBox');
      const mesaBox = document.getElementById('pdvMesaBox');
      const taxaRow = document.getElementById('pdvTaxaRow');
      const endInp  = document.getElementById('pdvEnd');
      const mesaInp = document.getElementById('pdvMesaNum');

      if (tipo === 'balcao') {
        endBox.style.display  = 'none';
        mesaBox.style.display = 'none';
        taxaRow.style.display = 'none';
        endInp.removeAttribute('required');
        mesaInp.removeAttribute('required');
        endInp.value = 'Retirada no Balcão';
      } else if (tipo === 'mesa') {
        endBox.style.display  = 'none';
        mesaBox.style.display = 'block';
        taxaRow.style.display = 'none';
        endInp.removeAttribute('required');
        mesaInp.setAttribute('required', '');
        endInp.value = 'Mesa';
      } else { // delivery
        endBox.style.display  = 'block';
        mesaBox.style.display = 'none';
        taxaRow.style.display = 'flex';
        endInp.setAttribute('required', '');
        mesaInp.removeAttribute('required');
        endInp.value = '';
      }
    },

    // ─── Renderizar categorias ────────────────────────────────────────────
    _renderCategorias() {
      const el = document.getElementById('pdvCats');
      if (!el) return;

      const cats = _state.categorias;
      el.innerHTML = `
        <button class="pdv-cat-item ${_state.catAtiva === null ? 'active' : ''}" data-cat="null">
          <span class="pdv-cat-icon">🍽️</span>
          <span class="pdv-cat-nome">Todos</span>
          <span class="pdv-cat-qtd">${_state.produtos.length}</span>
        </button>
        ${cats.map(c => {
          const qtd = _state.produtos.filter(p => p.categoria_id == c.id).length;
          if (qtd === 0) return '';
          return `
            <button class="pdv-cat-item ${_state.catAtiva == c.id ? 'active' : ''}" data-cat="${c.id}">
              <span class="pdv-cat-icon">${c.imagem_url ? `<img src="${c.imagem_url}" alt="">` : '🗂️'}</span>
              <span class="pdv-cat-nome">${c.nome}</span>
              <span class="pdv-cat-qtd">${qtd}</span>
            </button>
          `;
        }).join('')}
      `;

      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.pdv-cat-item');
        if (!btn) return;
        const catId = btn.dataset.cat === 'null' ? null : parseInt(btn.dataset.cat);
        document.querySelectorAll('.pdv-cat-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _state.catAtiva = catId;
        const busca = document.getElementById('pdvBusca')?.value.trim() || '';
        this._filtrarErender(catId, busca);
      });
    },

    // ─── Filtrar e renderizar grade de produtos ───────────────────────────
    _filtrarErender(catId, busca = '') {
      let lista = _state.produtos;
      if (catId !== null) lista = lista.filter(p => p.categoria_id == catId);
      if (busca) {
        const q = busca.toLowerCase();
        lista = lista.filter(p => p.nome.toLowerCase().includes(q));
      }
      _state.filtrados = lista;
      this._renderGrade(lista);
    },

    _buscar(q) {
      this._filtrarErender(_state.catAtiva, q);
    },

    // ─── Renderizar grade de produtos ─────────────────────────────────────
    _renderGrade(lista) {
      const grade = document.getElementById('pdvGrade');
      if (!grade) return;

      if (lista.length === 0) {
        grade.innerHTML = '<div class="pdv-vazio">Nenhum produto encontrado.</div>';
        return;
      }

      grade.innerHTML = lista.map(p => {
        const imgHtml = p.imagem_url
          ? `<img src="${p.imagem_url}" alt="${p.nome}" loading="lazy">`
          : `<div class="pdv-card-sem-img">🍔</div>`;

        const descontoPct = p.desconto > 0 ? p.desconto : 0;
        const precoFinal  = descontoPct > 0
          ? p.preco * (1 - descontoPct / 100)
          : p.preco;

        return `
          <div class="pdv-card" data-id="${p.id}" tabindex="0" role="button" title="Adicionar ${p.nome}">
            <div class="pdv-card-img">${imgHtml}</div>
            ${descontoPct > 0 ? `<div class="pdv-card-badge">-${descontoPct}%</div>` : ''}
            <div class="pdv-card-info">
              <div class="pdv-card-nome">${p.nome}</div>
              <div class="pdv-card-preco">
                ${descontoPct > 0 ? `<s class="pdv-preco-riscado">${fmt(p.preco)}</s>` : ''}
                <strong>${fmt(precoFinal)}</strong>
              </div>
            </div>
            <div class="pdv-card-add">+</div>
          </div>
        `;
      }).join('');

      // Evento de clique via delegação (um único listener na grade)
      grade.onclick = (e) => {
        const card = e.target.closest('.pdv-card');
        if (!card) return;
        const id = parseInt(card.dataset.id);
        const prod = _state.produtos.find(p => p.id === id);
        if (prod) this._addItem(prod);
      };
    },

    // ─── Adicionar item ao carrinho ───────────────────────────────────────
    _addItem(prod) {
      const descontoPct = prod.desconto > 0 ? prod.desconto : 0;
      const precoFinal  = descontoPct > 0 ? prod.preco * (1 - descontoPct / 100) : prod.preco;

      const existente = _state.itens.find(i => i.id === prod.id);
      if (existente) {
        existente.quantidade++;
      } else {
        _state.itens.push({
          id:         prod.id,
          nome:       prod.nome,
          preco:      precoFinal,
          imagem_url: prod.imagem_url,
          quantidade: 1,
        });
      }
      this._renderCarrinho();
      this._flashCard(prod.id);
    },

    // ─── Flash visual no card ao adicionar ───────────────────────────────
    _flashCard(prodId) {
      const card = document.querySelector(`#pdvGrade .pdv-card[data-id="${prodId}"]`);
      if (!card) return;
      card.classList.add('pdv-card--added');
      setTimeout(() => card.classList.remove('pdv-card--added'), 500);
    },

    // ─── Alterar quantidade ───────────────────────────────────────────────
    _alterarQtd(id, delta) {
      const item = _state.itens.find(i => i.id === id);
      if (!item) return;
      item.quantidade += delta;
      if (item.quantidade <= 0) {
        _state.itens = _state.itens.filter(i => i.id !== id);
      }
      this._renderCarrinho();
    },

    // ─── Remover item ─────────────────────────────────────────────────────
    _removerItem(id) {
      _state.itens = _state.itens.filter(i => i.id !== id);
      this._renderCarrinho();
    },

    // ─── Renderizar carrinho ──────────────────────────────────────────────
    _renderCarrinho() {
      const lista = document.getElementById('pdvItensLista');
      const qtdEl = document.getElementById('pdvQtdItens');
      if (!lista) return;

      const totalItens = _state.itens.reduce((a, i) => a + i.quantidade, 0);
      if (qtdEl) qtdEl.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;

      if (_state.itens.length === 0) {
        lista.innerHTML = '<div class="pdv-itens-vazio">Clique nos produtos para adicionar →</div>';
      } else {
        lista.innerHTML = _state.itens.map(item => `
          <div class="pdv-item-row" data-id="${item.id}">
            <div class="pdv-item-info">
              ${item.imagem_url
                ? `<img class="pdv-item-thumb" src="${item.imagem_url}" alt="">`
                : `<div class="pdv-item-thumb-vazio">🍔</div>`}
              <div>
                <div class="pdv-item-nome">${item.nome}</div>
                <div class="pdv-item-preco">${fmt(item.preco)} / un.</div>
              </div>
            </div>
            <div class="pdv-item-qtd">
              <button class="pdv-qtd-btn" data-action="dec" data-id="${item.id}">−</button>
              <span>${item.quantidade}</span>
              <button class="pdv-qtd-btn" data-action="inc" data-id="${item.id}">+</button>
            </div>
            <div class="pdv-item-subtotal">${fmt(item.quantidade * item.preco)}</div>
            <button class="pdv-item-del" data-id="${item.id}" title="Remover">🗑</button>
          </div>
        `).join('');

        // Eventos de quantidade/remoção
        lista.querySelectorAll('.pdv-qtd-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id    = parseInt(btn.dataset.id);
            const delta = btn.dataset.action === 'inc' ? 1 : -1;
            this._alterarQtd(id, delta);
          });
        });
        lista.querySelectorAll('.pdv-item-del').forEach(btn => {
          btn.addEventListener('click', () => this._removerItem(parseInt(btn.dataset.id)));
        });
      }

      this._renderTotais();
    },

    // ─── Totais ───────────────────────────────────────────────────────────
    _renderTotais() {
      const subtotal = _state.itens.reduce((a, i) => a + i.quantidade * i.preco, 0);
      const total    = Math.max(0, subtotal + _state.taxaEntrega - _state.desconto);

      const elSub   = document.getElementById('pdvSubtotal');
      const elTotal = document.getElementById('pdvTotalLabel');
      if (elSub)   elSub.textContent   = fmt(subtotal);
      if (elTotal) elTotal.textContent = fmt(total);
    },

    // ─── Auto-preenchimento ───────────────────────────────────────────────
    async _autofill(tel) {
      const digits = tel.replace(/\D/g, '');
      const box    = document.getElementById('pdvSugestaoBox');
      if (!box) return;

      if (digits.length < 8) { box.style.display = 'none'; return; }

      try {
        const res = await api('/api/clientes/' + digits + '/ultimo');
        if (!res.ok) { box.style.display = 'none'; return; }
        const data = await res.json();

        box.style.display = 'block';
        box.innerHTML = `
          <div class="pdv-sugestao-nome">👋 ${data.cliente}</div>
          <div class="pdv-sugestao-end">${data.endereco || 'Retirada'}</div>
          <div style="display:flex; gap:0.4rem; margin-top:0.5rem;">
            <button class="pdv-sugestao-btn" id="pdvBtnFill">✨ Preencher dados</button>
            <button class="pdv-sugestao-btn pdv-sugestao-btn--green" id="pdvBtnRepeat">🔁 Repetir pedido</button>
          </div>
        `;

        document.getElementById('pdvBtnFill').onclick = () => {
          document.getElementById('pdvNome').value = data.cliente;
          if (data.endereco) document.getElementById('pdvEnd').value = data.endereco;
          if (data.forma_pagamento) document.getElementById('pdvPagto').value = data.forma_pagamento;
          box.style.display = 'none';
        };

        document.getElementById('pdvBtnRepeat').onclick = () => {
          document.getElementById('pdvNome').value = data.cliente;
          if (data.endereco) document.getElementById('pdvEnd').value = data.endereco;
          if (data.forma_pagamento) document.getElementById('pdvPagto').value = data.forma_pagamento;
          _state.itens = (data.itens || []).map(i => ({
            id:         i.produto_id,
            nome:       i.nome_produto,
            preco:      parseFloat(i.preco_unitario),
            imagem_url: null,
            quantidade: i.quantidade,
          }));
          this._renderCarrinho();
          box.style.display = 'none';
        };
      } catch (err) {
        console.error('[PDV] autofill error:', err.message);
        box.style.display = 'none';
      }
    },

    // ─── Confirmar pedido ─────────────────────────────────────────────────
    async _confirmar() {
      const nome  = document.getElementById('pdvNome')?.value.trim();
      const fone  = document.getElementById('pdvFone')?.value.trim() || '';
      const pagto = document.getElementById('pdvPagto')?.value || 'dinheiro';
      const obs   = document.getElementById('pdvObs')?.value.trim() || 'Pedido PDV Admin';
      const troco = parseFloat(document.getElementById('pdvTroco')?.value || 0) || null;

      if (!nome) {
        this._toast('❌ Nome do cliente é obrigatório.', true);
        document.getElementById('pdvNome')?.focus();
        return;
      }
      if (_state.itens.length === 0) {
        this._toast('❌ Adicione pelo menos um produto.', true);
        return;
      }

      let endereco = document.getElementById('pdvEnd')?.value.trim() || 'Balcão';
      if (_state.tipo === 'delivery' && !endereco) {
        this._toast('❌ Endereço é obrigatório para delivery.', true);
        document.getElementById('pdvEnd')?.focus();
        return;
      }
      if (_state.tipo === 'mesa') {
        const mesa = document.getElementById('pdvMesaNum')?.value.trim();
        if (!mesa) {
          this._toast('❌ Número da mesa é obrigatório.', true);
          document.getElementById('pdvMesaNum')?.focus();
          return;
        }
        endereco = 'Mesa ' + mesa;
      }

      const subtotal = _state.itens.reduce((a, i) => a + i.quantidade * i.preco, 0);
      const total    = Math.max(0, subtotal + _state.taxaEntrega - _state.desconto);

      const payload = {
        tipo:            _state.tipo,
        cliente:         nome,
        telefone:        fone,
        endereco:        endereco,
        forma_pagamento: pagto,
        observacoes:     obs,
        total:           total,
        taxa_entrega:    _state.taxaEntrega || 0,
        troco_para:      troco,
        itens: _state.itens.map(i => ({
          id:        i.id,
          nome:      i.nome,
          quantidade: i.quantidade,
          preco:     i.preco,
        })),
      };

      const btn = document.getElementById('pdvBtnConfirmar');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

      try {
        const res = await api('/api/pedidos', { method: 'POST', body: payload });
        const data = await res.json();

        if (res.ok) {
          this._toast('✅ Pedido #' + data.id + ' criado com sucesso!');
          this.close();
          if (typeof carregarPedidos === 'function') carregarPedidos();
        } else {
          this._toast('❌ ' + (data.error || 'Erro ao criar pedido.'), true);
        }
      } catch (err) {
        console.error('[PDV] confirmar error:', err.message);
        this._toast('❌ Falha de rede. Verifique sua conexão.', true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pedido'; }
      }
    },

    // ─── Loading spinner ──────────────────────────────────────────────────
    _setLoadingProdutos(on) {
      const grade = document.getElementById('pdvGrade');
      if (grade && on) grade.innerHTML = '<div class="pdv-loading-spinner">⏳ Carregando produtos...</div>';
    },

    // ─── Toast ────────────────────────────────────────────────────────────
    _toast(msg, isError = false) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = `
        position:fixed; bottom:2rem; right:2rem; z-index:99999;
        background:${isError ? '#dc2626' : '#16a34a'};
        color:#fff; padding:0.9rem 1.5rem; border-radius:12px;
        font-weight:700; box-shadow:0 4px 20px rgba(0,0,0,0.2);
        font-size:0.95rem; animation:slideInRight 0.3s ease;
      `;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    },
  };

  // ─── Bind do botão "CRIAR PEDIDO" no topbar ───────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnAppNovoPedido');
    if (btn) {
      // Remover quaisquer handlers antigos clonando o nó
      const novo = btn.cloneNode(true);
      btn.parentNode.replaceChild(novo, btn);
      novo.addEventListener('click', () => PdvManager.open());
    }
  });

})();
