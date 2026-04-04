/**
 * admin-categorias.js
 * Gerenciamento de Categorias do Cardápio — OlaClick Style
 */

const CategoriasManager = {
    categorias: [],

    async init() {
        await this.load();
    },

    async load() {
        try {
            const response = await fetch('/api/categorias');
            this.categorias = await response.json();
            this.renderSidebar();
            this.updateSelects();
        } catch (err) {
            console.error('Erro ao carregar categorias:', err);
        }
    },

    async save(categoria) {
        const isNew = !categoria.id;
        const url = isNew ? '/api/categorias' : `/api/categorias/${categoria.id}`;
        const method = isNew ? 'POST' : 'PUT';
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(categoria)
            });
            if (response.ok) {
                await this.load();
                return await response.json();
            }
        } catch (err) {
            console.error('Erro ao salvar categoria:', err);
        }
        return null;
    },

    async delete(id) {
        if (!confirm('Excluir esta categoria? Os produtos ficarão sem categoria.')) return;
        try {
            const response = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Se a que foi excluída era a ativa, voltar para "all"
                if (ProdutosManager.currentCategory == id) {
                    ProdutosManager.setCategory('all');
                }
                await this.load();
                return true;
            }
        } catch (err) {
            console.error('Erro ao excluir categoria:', err);
        }
        return false;
    },

    renderSidebar() {
        const container = document.getElementById('oc-categories-sidebar-list');
        if (!container) return;

        container.innerHTML = '';

        // Item "Todos"
        const allItem = document.createElement('div');
        allItem.className = 'oc-cat-sidebar-item' + (ProdutosManager.currentCategory === 'all' ? ' active' : '');
        allItem.dataset.id = 'all';
        allItem.innerHTML = `
            <span class="oc-cat-sidebar-name oc-cat-sidebar-name-display">Todos os produtos</span>
            <span class="oc-cat-sidebar-count">${ProdutosManager.produtos.length}</span>
        `;
        allItem.addEventListener('click', () => this.selectCategory('all'));
        container.appendChild(allItem);

        // Categorias
        this.categorias.forEach(cat => {
            const count = ProdutosManager.produtos.filter(p => p.categoria_id === cat.id).length;
            const isActive = ProdutosManager.currentCategory == cat.id;

            const item = document.createElement('div');
            item.className = 'oc-cat-sidebar-item' + (isActive ? ' active' : '');
            item.dataset.id = cat.id;
            item.innerHTML = `
                <span class="oc-cat-sidebar-name-display oc-cat-sidebar-name">${cat.nome}</span>
                <input type="text" class="oc-cat-inline-edit" value="${cat.nome}" maxlength="64">
                <span class="oc-cat-sidebar-count">${count}</span>
                <div class="oc-cat-sidebar-actions">
                    <button class="oc-cat-action-btn" title="Editar imagem e detalhes" onclick="event.stopPropagation(); CategoriasManager.openEditCategoryModal(${cat.id})">
                        <i class="fas fa-image"></i>
                    </button>
                    <button class="oc-cat-action-btn" title="Editar nome rápido" onclick="event.stopPropagation(); CategoriasManager.startEdit(${cat.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="oc-cat-action-btn danger" title="Excluir" onclick="event.stopPropagation(); CategoriasManager.delete(${cat.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Clique para selecionar categoria
            item.addEventListener('click', (e) => {
                if (item.classList.contains('editing')) return;
                this.selectCategory(cat.id);
            });

            // Enter salva, Escape cancela
            const input = item.querySelector('.oc-cat-inline-edit');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.finishEdit(cat.id, input.value); }
                if (e.key === 'Escape') { this.cancelEdit(cat.id); }
            });
            input.addEventListener('blur', () => {
                if (item.classList.contains('editing')) this.finishEdit(cat.id, input.value);
            });
            input.addEventListener('click', e => e.stopPropagation());

            container.appendChild(item);
        });
    },

    startEdit(catId) {
        const item = document.querySelector(`.oc-cat-sidebar-item[data-id="${catId}"]`);
        if (!item) return;
        item.classList.add('editing');
        const input = item.querySelector('.oc-cat-inline-edit');
        if (input) { input.focus(); input.select(); }
    },

    cancelEdit(catId) {
        const item = document.querySelector(`.oc-cat-sidebar-item[data-id="${catId}"]`);
        if (item) item.classList.remove('editing');
    },

    async finishEdit(catId, newName) {
        newName = (newName || '').trim();
        const item = document.querySelector(`.oc-cat-sidebar-item[data-id="${catId}"]`);
        if (item) item.classList.remove('editing');
        if (!newName) return;
        await this.save({ id: catId, nome: newName });
    },

    openNewCategoryModal() {
        this.openEditCategoryModal(null);
    },

    openEditCategoryModal(catId) {
        const cat = catId ? this.categorias.find(c => c.id === catId) : null;
        let modal = document.getElementById('oc-newcat-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'oc-newcat-modal';
            modal.className = 'oc-newcat-modal';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="oc-newcat-box">
                <h3><i class="fas fa-${cat ? 'pen' : 'folder-plus'}" style="color:var(--primary); margin-right:0.5rem;"></i>${cat ? 'Editar' : 'Nova'} Categoria</h3>
                
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem; color:#666; margin-bottom:0.4rem; display:block;">Nome da Categoria</label>
                    <input type="text" id="oc-newcat-input" class="oc-newcat-input" placeholder="Ex: Pizzas, Bebidas..." maxlength="64" value="${cat ? cat.nome : ''}" autofocus>
                </div>

                <div style="margin-bottom:1.5rem;">
                    <label style="font-size:0.85rem; color:#666; margin-bottom:0.4rem; display:block;">Imagem da Categoria (Opcional)</label>
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div id="oc-cat-img-preview-container" style="width:80px; height:80px; border-radius:8px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #ddd;">
                            ${cat && cat.imagem_url ? `<img src="${cat.imagem_url}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-image" style="font-size:1.5rem; color:#ccc;"></i>'}
                        </div>
                        <div style="flex:1;">
                            <input type="file" id="oc-cat-img-file" style="display:none;" onchange="CategoriasManager.handleImageUpload(event)">
                            <button class="oc-newcat-cancel" style="font-size:0.8rem; padding:0.4rem 0.8rem; margin:0; width:auto;" onclick="document.getElementById('oc-cat-img-file').click()">Selecionar Foto</button>
                            <input type="hidden" id="oc-cat-img-url-hidden" value="${cat ? (cat.imagem_url || '') : ''}">
                        </div>
                    </div>
                </div>

                <div class="oc-newcat-btns">
                    <button class="oc-newcat-cancel" onclick="CategoriasManager.closeNewCategoryModal()">Cancelar</button>
                    <button class="oc-newcat-save" onclick="CategoriasManager.saveCategoryFromModal(${catId || 'null'})">${cat ? 'Salvar' : 'Criar'}</button>
                </div>
            </div>
        `;
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeNewCategoryModal();
        });

        modal.style.display = 'flex';
        const input = document.getElementById('oc-newcat-input');
        if (input) { input.focus(); }
        
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter') this.saveCategoryFromModal(catId);
                if (e.key === 'Escape') this.closeNewCategoryModal();
            };
        }
    },

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const container = document.getElementById('oc-cat-img-preview-container');
        const hiddenInput = document.getElementById('oc-cat-img-url-hidden');
        
        // Preview local instantâneo
        const reader = new FileReader();
        reader.onload = (e) => {
            container.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; opacity:0.5;">`;
        };
        reader.readAsDataURL(file);

        // Upload para o servidor (reutilizando a lógica de produtos)
        const formData = new FormData();
        formData.append('image', file);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                hiddenInput.value = data.url;
                container.innerHTML = `<img src="${data.url}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                alert('Erro no upload da imagem.');
            }
        } catch (err) {
            console.error(err);
            alert('Falha na conexão.');
        }
    },

    closeNewCategoryModal() {
        const modal = document.getElementById('oc-newcat-modal');
        if (modal) modal.style.display = 'none';
    },

    async saveCategoryFromModal(catId) {
        const input = document.getElementById('oc-newcat-input');
        const imgUrl = document.getElementById('oc-cat-img-url-hidden').value;
        const name = (input ? input.value : '').trim();
        
        if (!name) { if (input) input.focus(); return; }
        
        const btn = document.querySelector('#oc-newcat-modal .oc-newcat-save');
        if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
        
        const result = await this.save({ 
            id: catId, 
            nome: name,
            imagem_url: imgUrl
        });
        
        this.closeNewCategoryModal();
        if (result && result.id && !catId) {
            this.selectCategory(result.id);
        }
        if (btn) { btn.disabled = false; btn.textContent = catId ? 'Salvar' : 'Criar'; }
    },

    async saveNewCategory() {
        // Redireciona para o novo fluxo de modal
        this.openEditCategoryModal(null);
    },

    selectCategory(id) {
        document.querySelectorAll('.oc-cat-sidebar-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.oc-cat-sidebar-item[data-id="${id}"]`);
        if (activeEl) activeEl.classList.add('active');
        ProdutosManager.setCategory(id);
    },

    filterSidebar(query) {
        const q = (query || '').toLowerCase().trim();
        document.querySelectorAll('#oc-categories-sidebar-list .oc-cat-sidebar-item').forEach(item => {
            const name = (item.querySelector('.oc-cat-sidebar-name-display')?.textContent || '').toLowerCase();
            item.style.display = (!q || name.includes(q) || item.dataset.id === 'all') ? '' : 'none';
        });
    },

    updateSelects() {
        // Atualiza o select dentro do form de produto
        const selects = document.querySelectorAll('.select-categoria, #select-categoria-v3');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Sem Categoria</option>';
            this.categorias.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nome;
                select.appendChild(opt);
            });
            select.value = currentValue;
        });
    }
};

window.CategoriasManager = CategoriasManager;
