/**
 * admin-modificadores.js
 * Gestão de Modificadores — OlaClick Style para Pitombo Lanches
 * Editor inline expandível com criação de categoria, radio buttons e chips por item
 */

const ModificadoresManager = {
    categorias: [],
    currentModifId: null,          // ID do grupo selecionado no painel esquerdo
    currentModificadorParaAssociar: null, // Para o modal de Associar/Desassociar

    async init() {
        console.log('🧊 Inicializando ModificadoresManager OlaClick...');
        await this.load();
        this.setupForms();
    },

    async load() {
        try {
            const response = await fetch('/api/modificadores/categorias');
            if (!response.ok) throw new Error('Falha ao carregar categorias');
            this.categorias = await response.json();
            this.renderSidebar();
            // Re-render editor se havia um selecionado
            if (this.currentModifId) {
                const cat = this.categorias.find(c => c.id === this.currentModifId);
                if (cat) this.openEditor(cat);
                else { this.currentModifId = null; this.showEditorEmpty(); }
            } else {
                this.showEditorEmpty();
            }
        } catch (err) {
            console.error('Erro ao carregar modificadores:', err);
        }
    },

    // ====== SIDEBAR ======

    renderSidebar() {
        const container = document.getElementById('oc-modif-categories-list');
        if (!container) return;

        const query = (document.getElementById('oc-modif-search')?.value || '').toLowerCase();

        container.innerHTML = '';

        const filtered = this.categorias.filter(cat => !query || cat.nome.toLowerCase().includes(query));

        const countEl = document.getElementById('oc-modif-count');
        if (countEl) countEl.textContent = this.categorias.length;

        if (filtered.length === 0) {
            container.innerHTML = `<div style="padding:1.5rem; text-align:center; color:#9ca3af; font-size:0.85rem;">
                ${query ? 'Nenhuma categoria encontrada.' : 'Nenhum grupo ainda.'}
            </div>`;
            return;
        }

        filtered.forEach(cat => {
            const isActive = cat.id === this.currentModifId;
            const itemCount = cat.itens ? cat.itens.length : 0;
            const badge = cat.obrigatorio
                ? `<span class="oc-modif-cat-badge badge-required">Obrig.</span>`
                : `<span class="oc-modif-cat-badge badge-optional">Opc.</span>`;

            const div = document.createElement('div');
            div.className = 'oc-modif-cat-item' + (isActive ? ' active' : '');
            div.dataset.id = cat.id;
            div.innerHTML = `
                <i class="fas fa-grip-vertical cat-drag-handle" style="color:#d1d5db; margin-right:0.5rem; cursor:grab;"></i>
                <span class="oc-modif-cat-name">${cat.nome}</span>
                ${badge}
                <div class="oc-modif-cat-actions">
                    <button class="btn-mini-action danger" onclick="event.stopPropagation(); ModificadoresManager.deleteCategory(${cat.id})" title="Excluir grupo">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            div.addEventListener('click', () => this.openEditor(cat));
            container.appendChild(div);
        });

        // Init Sortable for Categories
        if (typeof Sortable !== 'undefined') {
            Sortable.create(container, {
                handle: '.cat-drag-handle',
                animation: 150,
                onEnd: async (evt) => {
                    const cards = Array.from(container.querySelectorAll('.oc-modif-cat-item'));
                    const itens = cards.map((el, idx) => ({ id: Number(el.dataset.id), ordem: idx }));
                    try {
                        await fetch('/api/modificadores/categorias/reordenar', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ itens })
                        });
                    } catch(e) { console.error('Erro reordenar categorias:', e); }
                }
            });
        }
    },

    showEditorEmpty() {
        const editor = document.getElementById('oc-modif-editor');
        if (!editor) return;
        editor.innerHTML = `
            <div class="oc-modif-editor-empty">
                <i class="fas fa-sliders-h"></i>
                <p style="font-weight:600; font-size:0.95rem; color:#6b7280; margin:0.5rem 0;">Selecione um grupo para editar</p>
                <p style="font-size:0.8rem; color:#9ca3af; margin:0;">ou crie um novo grupo usando o botão acima</p>
            </div>
        `;
    },

    openEditor(cat) {
        this.currentModifId = cat.id;

        // Atualizar sidebar highlight
        document.querySelectorAll('.oc-modif-cat-item').forEach(el => el.classList.remove('active'));
        const sidebarItem = document.querySelector(`.oc-modif-cat-item[data-id="${cat.id}"]`);
        if (sidebarItem) sidebarItem.classList.add('active');

        const editor = document.getElementById('oc-modif-editor');
        if (!editor) return;

        const itemsHtml = this._buildItemsHtml(cat);
        const assocCount = 0; // Buscamos dinamicamente ou mostramos 0 por default

        editor.innerHTML = `
            <!-- Seção: Nome da categoria -->
            <div class="oc-modif-editor-section">
                <p class="oc-modif-section-title">Categoria</p>
                <div class="oc-modif-name-row">
                    <input type="text" class="oc-modif-name-input" id="modif-name-input-${cat.id}"
                        value="${this._esc(cat.nome)}" maxlength="150"
                        placeholder="Nome do grupo de opções..."
                        oninput="ModificadoresManager.updateNameCounter(${cat.id}, this.value)"
                        onblur="ModificadoresManager.saveCategoryField(${cat.id}, 'nome', this.value)">
                    <div class="oc-modif-name-counter" id="modif-name-counter-${cat.id}">${cat.nome.length}/150</div>
                </div>
            </div>

            <!-- Seção: Associar/Desassociar -->
            <div class="oc-modif-editor-section">
                <p class="oc-modif-section-title">Edite a categoria do modificador</p>
                <button class="oc-assoc-btn" onclick="ModificadoresManager.openAssociacaoModal(${cat.id})">
                    <i class="fas fa-link"></i>
                    Associar / Desassociar
                    <span class="oc-assoc-count" id="assoc-count-${cat.id}">0</span>
                    <i class="fas fa-caret-down" style="margin-left:0.25rem;"></i>
                </button>
            </div>

            <!-- Seção: Condição (Obrigatório/Opcional) -->
            <div class="oc-modif-editor-section">
                <p class="oc-modif-section-title">Selecionar condição</p>
                <div class="oc-radio-group">
                    <div class="oc-radio-option">
                        <input type="radio" name="obrigatorio-${cat.id}" id="cond-obrig-${cat.id}" value="1" ${cat.obrigatorio ? 'checked' : ''}
                            onchange="ModificadoresManager.saveCategoryField(${cat.id}, 'obrigatorio', true)">
                        <label class="oc-radio-label" for="cond-obrig-${cat.id}">Obrigatório</label>
                    </div>
                    <div class="oc-radio-option">
                        <input type="radio" name="obrigatorio-${cat.id}" id="cond-opc-${cat.id}" value="0" ${!cat.obrigatorio ? 'checked' : ''}
                            onchange="ModificadoresManager.saveCategoryField(${cat.id}, 'obrigatorio', false)">
                        <label class="oc-radio-label" for="cond-opc-${cat.id}">Opcional</label>
                    </div>
                </div>
            </div>

            <!-- Seção: Tipo de seleção -->
            <div class="oc-modif-editor-section">
                <p class="oc-modif-section-title">Nessa categoria, você pode selecionar</p>
                <div class="oc-radio-group">
                    <div class="oc-radio-option">
                        <input type="radio" name="selecao-${cat.id}" id="sel-unica-${cat.id}" value="1" ${cat.selecao_unica ? 'checked' : ''}
                            onchange="ModificadoresManager.saveCategoryField(${cat.id}, 'selecao_unica', true)">
                        <label class="oc-radio-label" for="sel-unica-${cat.id}">Apenas um modificador</label>
                    </div>
                    <div class="oc-radio-option">
                        <input type="radio" name="selecao-${cat.id}" id="sel-multi-${cat.id}" value="0" ${!cat.selecao_unica ? 'checked' : ''}
                            onchange="ModificadoresManager.saveCategoryField(${cat.id}, 'selecao_unica', false)">
                        <label class="oc-radio-label" for="sel-multi-${cat.id}">Vários</label>
                    </div>
                </div>
            </div>

            <!-- Seção: Itens do modificador -->
            <div class="oc-modif-editor-section">
                <p class="oc-modif-section-title">Adicionar modificadores para essa categoria <strong>${(cat.itens || []).length}</strong></p>
                <div id="modif-items-container-${cat.id}">
                    ${itemsHtml}
                </div>
                <button class="oc-add-item-btn" onclick="ModificadoresManager.addNewItem(${cat.id})">
                    <i class="fas fa-plus"></i> Adicionar modificador
                </button>
            </div>
        `;

        // Buscar contagem de associações
        fetch(`/api/modificadores/categorias_associadas/${cat.id}`)
            .then(r => r.json())
            .then(arr => {
                const el = document.getElementById(`assoc-count-${cat.id}`);
                if (el) el.textContent = arr.length;
            }).catch(() => {});
            
        // Init Sortable for items
        if (typeof Sortable !== 'undefined') {
            const containerItems = document.getElementById(`modif-items-container-${cat.id}`);
            if (containerItems) {
                Sortable.create(containerItems, {
                    handle: '.oc-modif-item-drag',
                    animation: 150,
                    onEnd: async (evt) => {
                        const rows = Array.from(containerItems.querySelectorAll('.oc-modif-item-row'));
                        const itens = rows.map((el, idx) => ({ id: Number(el.dataset.itemId), ordem: idx }));
                        try {
                            await fetch('/api/modificadores/itens/reordenar', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ itens })
                            });
                        } catch(e) { console.error('Erro reordenar itens:', e); }
                    }
                });
            }
        }
    },

    _buildItemsHtml(cat) {
        const itens = (cat.itens || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        if (itens.length === 0) return '';
        return itens.map(item => this._buildItemRowHtml(cat.id, item)).join('');
    },

    _buildItemRowHtml(catId, item) {
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
        return `
            <div class="oc-modif-item-row" data-item-id="${item.id}">
                <div class="oc-modif-item-header">
                    <span class="oc-modif-item-drag" style="cursor:grab; padding:0.5rem; color:#d1d5db;"><i class="fas fa-grip-vertical"></i></span>
                    <input type="text" class="oc-modif-item-name-input"
                        value="${this._esc(item.nome)}"
                        placeholder="Nome do modificador..."
                        onblur="ModificadoresManager.saveItemField(${catId}, ${item.id}, 'nome', this.value)">
                    <div class="oc-modif-item-actions">
                        <button class="btn-mini-action danger" onclick="ModificadoresManager.deleteItem(${item.id})" title="Excluir opção">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="oc-modif-item-footer">
                    <div class="oc-price-input-wrapper">
                        <span class="oc-price-prefix currency-symbol">${window.AppCurrency ? window.AppCurrency.symbol : 'R$'}</span>
                        <input type="number" step="0.01" min="0" value="${Number(item.preco || 0).toFixed(2)}"
                            onblur="ModificadoresManager.saveItemField(${catId}, ${item.id}, 'preco', this.value)">
                    </div>
                    
                    <!-- Chip + Custo -->
                    <span class="oc-item-chip" id="chip-custo-${item.id}" onclick="ModificadoresManager.showItemExtra(${item.id}, 'custo', this)" style="${item.custo > 0 ? 'display:none' : ''}">+ Custo</span>
                    <div class="oc-item-extra-input${item.custo > 0 ? ' visible' : ''}" id="extra-custo-${item.id}">
                        <span style="font-size:0.75rem; color:#6b7280; font-weight:600;">Custo:</span>
                        <div class="oc-price-input-wrapper">
                            <span class="oc-price-prefix currency-symbol">${window.AppCurrency ? window.AppCurrency.symbol : 'R$'}</span>
                            <input type="number" step="0.01" min="0" value="${Number(item.custo || 0).toFixed(2)}"
                                onblur="ModificadoresManager.saveItemField(${catId}, ${item.id}, 'custo', this.value)">
                        </div>
                    </div>

                    <!-- Chip + Desconto -->
                    <span class="oc-item-chip" id="chip-desc-${item.id}" onclick="ModificadoresManager.showItemExtra(${item.id}, 'desc', this)" style="${item.desconto > 0 ? 'display:none' : ''}">+ Desconto</span>
                    <div class="oc-item-extra-input${item.desconto > 0 ? ' visible' : ''}" id="extra-desc-${item.id}">
                        <span style="font-size:0.75rem; color:#6b7280; font-weight:600;">Desconto:</span>
                        <div class="oc-price-input-wrapper">
                            <span class="oc-price-prefix currency-symbol">${window.AppCurrency ? window.AppCurrency.symbol : 'R$'}</span>
                            <input type="number" step="0.01" min="0" value="${Number(item.desconto || 0).toFixed(2)}"
                                onblur="ModificadoresManager.saveItemField(${catId}, ${item.id}, 'desconto', this.value)">
                        </div>
                    </div>

                    <!-- Chip + SKU -->
                    <span class="oc-item-chip" id="chip-sku-${item.id}" onclick="ModificadoresManager.showItemExtra(${item.id}, 'sku', this)" style="${item.sku ? 'display:none' : ''}">+ SKU</span>
                    <div class="oc-item-extra-input${item.sku ? ' visible' : ''}" id="extra-sku-${item.id}">
                        <span style="font-size:0.75rem; color:#6b7280; font-weight:600;">SKU:</span>
                        <input type="text" style="width:80px; padding:0.25rem 0.5rem; border:1px solid #e5e7eb; border-radius:6px; font-size:0.8rem;"
                            value="${item.sku || ''}"
                            onblur="ModificadoresManager.saveItemField(${catId}, ${item.id}, 'sku', this.value)">
                    </div>
                </div>
            </div>
        `;
    },

    _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    updateNameCounter(catId, value) {
        const el = document.getElementById(`modif-name-counter-${catId}`);
        if (el) el.textContent = `${value.length}/150`;
    },

    showItemExtra(itemId, type, chip) {
        chip.style.display = 'none';
        const extra = document.getElementById(`extra-${type}-${itemId}`);
        if (extra) {
            extra.classList.add('visible');
            const input = extra.querySelector('input');
            if (input) input.focus();
        }
    },

    // ====== APIs ======

    async saveCategoryField(catId, field, value) {
        const cat = this.categorias.find(c => c.id === catId);
        if (!cat) return;
        const updated = { ...cat, [field]: value };
        await this.saveCategory(updated);
    },

    async saveCategory(data) {
        try {
            const method = data.id ? 'PUT' : 'POST';
            const url = data.id ? `/api/modificadores/categorias/${data.id}` : '/api/modificadores/categorias';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const saved = await res.json();
                await this.load();
                return saved;
            }
        } catch (err) { console.error('Erro ao salvar categoria:', err); }
        return null;
    },

    async deleteCategory(id) {
        if (!confirm('Excluir este grupo? Isso removerá todos os itens vinculados.')) return;
        try {
            const res = await fetch(`/api/modificadores/categorias/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (this.currentModifId === id) this.currentModifId = null;
                await this.load();
            }
        } catch (err) { console.error('Erro ao excluir categoria:', err); }
    },

    async saveItemField(catId, itemId, field, value) {
        const cat = this.categorias.find(c => c.id === catId);
        if (!cat) return;
        const item = (cat.itens || []).find(i => i.id === itemId);
        if (!item) return;
        const updatedItem = { ...item, [field]: field === 'preco' || field === 'custo' || field === 'desconto' ? Number(value) : value };
        await this.saveItem(updatedItem);
    },

    async saveItem(data) {
        try {
            const method = data.id ? 'PUT' : 'POST';
            const url = data.id ? `/api/modificadores/itens/${data.id}` : '/api/modificadores/itens';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                await this.load();
                return true;
            }
        } catch (err) { console.error('Erro ao salvar item:', err); }
        return false;
    },

    async deleteItem(id) {
        if (!confirm('Excluir esta opção?')) return;
        try {
            const res = await fetch(`/api/modificadores/itens/${id}`, { method: 'DELETE' });
            if (res.ok) await this.load();
        } catch (err) { console.error('Erro ao excluir item:', err); }
    },

    async addNewItem(catId) {
        const newItem = {
            categoria_id: catId,
            nome: 'Sem nome',
            preco: 0,
            custo: 0,
            sku: '',
            quantidade_maxima: 1,
            ordem: 999,
            ativo: true
        };
        await this.saveItem(newItem);
    },

    // ====== MODAL CRIAR CATEGORIA ======

    openNewGroupModal() {
        let modal = document.getElementById('oc-newgroup-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'oc-newgroup-modal';
            modal.className = 'oc-newcat-modal';
            modal.innerHTML = `
                <div class="oc-newcat-box">
                    <h3><i class="fas fa-sliders-h" style="color:var(--primary); margin-right:0.5rem;"></i>Novo Grupo de Opções</h3>
                    <input type="text" id="oc-newgroup-input" class="oc-newcat-input" placeholder="Ex: Escolha sua bebida, Adicionais..." maxlength="150">
                    <div class="oc-newcat-btns">
                        <button class="oc-newcat-cancel" onclick="ModificadoresManager.closeNewGroupModal()">Cancelar</button>
                        <button class="oc-newcat-save" onclick="ModificadoresManager.saveNewGroup()">Criar Grupo</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeNewGroupModal();
            });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        const input = document.getElementById('oc-newgroup-input');
        if (input) {
            input.value = '';
            input.focus();
            input.onkeydown = (e) => {
                if (e.key === 'Enter') this.saveNewGroup();
                if (e.key === 'Escape') this.closeNewGroupModal();
            };
        }
    },

    closeNewGroupModal() {
        const modal = document.getElementById('oc-newgroup-modal');
        if (modal) modal.style.display = 'none';
    },

    async saveNewGroup() {
        const input = document.getElementById('oc-newgroup-input');
        const name = (input ? input.value : '').trim();
        if (!name) { if (input) input.focus(); return; }
        const btn = document.querySelector('#oc-newgroup-modal .oc-newcat-save');
        if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

        const newCat = {
            nome: name,
            min_escolhas: 0,
            max_escolhas: 1,
            obrigatorio: false,
            selecao_unica: false,
            ordem: 0,
            ativo: true
        };
        const saved = await this.saveCategory(newCat);
        this.closeNewGroupModal();
        if (saved && saved.id) {
            setTimeout(() => {
                const cat = this.categorias.find(c => c.id === saved.id);
                if (cat) this.openEditor(cat);
            }, 200);
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Criar Grupo'; }
    },

    // ====== MODAL ASSOCIAR/DESASSOCIAR ======

    openAssociacaoModal(modificadorCategoriaId) {
        this.currentModificadorParaAssociar = modificadorCategoriaId;
        const modal = document.getElementById('modalAssociarModificadorCategoria');
        const listaContainer = document.getElementById('listaCategoriasAssociacao');

        listaContainer.innerHTML = '<div style="text-align:center; padding:1rem;">Carregando...</div>';
        modal.style.display = 'flex';

        Promise.all([
            fetch('/api/categorias').then(r => r.json()),
            fetch(`/api/modificadores/categorias_associadas/${modificadorCategoriaId}`).then(r => r.json())
        ]).then(([categorias, associadas]) => {
            if (categorias.length === 0) {
                listaContainer.innerHTML = '<div style="padding:1rem; color:#6b7280;">Nenhuma categoria de produto cadastrada.</div>';
                return;
            }

            let html = '';
            categorias.forEach(cat => {
                const isChecked = associadas.includes(cat.id);
                html += `
                    <label style="display:flex; align-items:center; gap:0.75rem; padding:0.8rem; border-bottom:1px solid #f3f4f6; cursor:pointer; user-select:none; transition:background 0.15s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
                        <input type="checkbox" class="cat-assoc-checkbox" value="${cat.id}" ${isChecked ? 'checked' : ''} style="width:1.2rem; height:1.2rem; margin:0; accent-color:var(--primary); cursor:pointer;">
                        <span style="font-weight:600; color:#374151; font-size:0.9rem;">${cat.nome}</span>
                    </label>
                `;
            });
            listaContainer.innerHTML = html;

            // Atualizar contador
            const countEl = document.getElementById(`assoc-count-${modificadorCategoriaId}`);
            if (countEl) countEl.textContent = associadas.length;
        }).catch(e => {
            console.error(e);
            listaContainer.innerHTML = '<div style="color:#dc2626; text-align:center; padding:1rem;">Erro ao carregar categorias.</div>';
        });

        document.getElementById('btnSalvarAssociacao').onclick = async () => {
            const checkboxes = document.querySelectorAll('.cat-assoc-checkbox');
            const btn = document.getElementById('btnSalvarAssociacao');
            btn.innerText = 'Salvando...';
            btn.disabled = true;

            const selectedCatIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => Number(cb.value));

            try {
                const response = await fetch('/api/modificadores/associar_em_massa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        modificador_categoria_id: this.currentModificadorParaAssociar,
                        categorias_ids: selectedCatIds
                    })
                });
                if (response.ok) {
                    modal.style.display = 'none';
                    const countEl = document.getElementById(`assoc-count-${this.currentModificadorParaAssociar}`);
                    if (countEl) countEl.textContent = selectedCatIds.length;
                    alert('Categorias associadas com sucesso!');
                } else {
                    alert('Falha ao associar. Tente novamente.');
                }
            } catch (e) {
                console.error(e);
                alert('Erro de conexão ao salvar associações.');
            }

            btn.innerText = 'Salvar';
            btn.disabled = false;
        };
    },

    // ====== LEGACY: Forms dos Modais Antigos (ainda usados como fallback) ======

    setupForms() {
        const formGrupo = document.getElementById('formModGrupo');
        if (formGrupo) {
            formGrupo.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(formGrupo);
                const data = {
                    id: formData.get('id') ? Number(formData.get('id')) : null,
                    nome: formData.get('nome'),
                    min_escolhas: Number(formData.get('min_escolhas')) || 0,
                    max_escolhas: Number(formData.get('max_escolhas')) || 1,
                    obrigatorio: formGrupo.obrigatorio?.checked || false,
                    selecao_unica: formGrupo.selecao_unica?.checked || false,
                    ordem: 0,
                    ativo: true
                };
                const success = await this.saveCategory(data);
                if (success) this.closeModals();
            };
        }

        const formItem = document.getElementById('formModItem');
        if (formItem) {
            formItem.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(formItem);
                const data = {
                    id: formData.get('id') ? Number(formData.get('id')) : null,
                    categoria_id: Number(formData.get('categoria_id')),
                    nome: formData.get('nome'),
                    preco: Number(formData.get('preco')) || 0,
                    custo: Number(formData.get('custo')) || 0,
                    sku: formData.get('sku') || '',
                    quantidade_maxima: Number(formData.get('quantidade_maxima')) || 1,
                    ordem: Number(formData.get('ordem')) || 0,
                    ativo: true
                };
                const success = await this.saveItem(data);
                if (success) this.closeModals();
            };
        }
    },

    closeModals() {
        ['modalModificadorGrupo', 'modalModificadorItem'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    },

    openCategoryModal(cat = null) {
        // Usando o novo modal inline
        this.openNewGroupModal();
    },

    openItemModal(catId, item = null) {
        // Adicionar item ao grupo atual
        if (!item) {
            this.addNewItem(catId);
        }
    },

    // Para popup de produtos (ainda usado no modal de edição de produto)
    render() {
        this.renderSidebar();
    }
};

window.ModificadoresManager = ModificadoresManager;
