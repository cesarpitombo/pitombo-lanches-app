/**
 * admin-produtos.js
 * Lógica principal da Página de Produtos - Versão V3 (Menu Manager)
 */

const ProdutosManager = {
    produtos: [],
    categorias: [],
    filteredProdutos: [],
    currentCategory: 'all',
    searchTerm: '',
    selectedModificadores: [], // Array de objetos de modificadores associados
    selectedImageFile: null,   // guarda a imagem cortada para envio só no submit
    _cropperInstance: null,    // instância activa do Cropper.js
    currentProductId: null,
    tempVariantes: [],

    async init() {
        console.log('🍔 Inicializando ProdutosManager V3...');
        await this.load();

        // Inicializar outros managers se existirem
        if (typeof CategoriasManager !== 'undefined') await CategoriasManager.init();
        if (typeof ModificadoresManager !== 'undefined') await ModificadoresManager.init();
        if (typeof CozinhaVinculoManager !== 'undefined') await CozinhaVinculoManager.init();

        this.setupSearch();
        this.setupForm();
        this.updateCozinhasSelect();

        // Fechar popup 3pontos ao clicar fora
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('product-options-popup');
            if (popup && popup.style.display === 'flex' && !e.target.closest('.fa-ellipsis-v')) {
                popup.style.display = 'none';
            }
        });
    },

    async load() {
        console.log('🔄 Carregando produtos...');
        try {
            const response = await apiFetch('/api/v2/produtos');
            if (!response.ok) throw new Error('Falha na resposta da API');

            const data = await response.json();
            this.produtos = Array.isArray(data) ? data : [];
            this.applyFilters();
        } catch (err) {
            console.error('❌ Erro ao carregar produtos:', err);
            const grid = document.getElementById('produtos-v2-grid');
            if (grid) grid.innerHTML = '<div class="error-state">Erro ao carregar produtos.</div>';
        }
    },

    setupSearch() {
        const input = document.getElementById('search-produtos');
        if (input) {
            input.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.applyFilters();
            });
        }
    },

    setCategory(catId) {
        this.currentCategory = catId;
        // Atualizar título da área principal
        const titleEl = document.getElementById('oc-current-cat-title');
        if (titleEl) {
            if (catId === 'all') {
                titleEl.textContent = 'Todos os produtos';
            } else {
                const cat = (typeof CategoriasManager !== 'undefined')
                    ? CategoriasManager.categorias.find(c => c.id == catId)
                    : null;
                titleEl.textContent = cat ? cat.nome : 'Categoria';
            }
        }
        this.applyFilters();
    },

    filterByCategory(id) {
        // Alias para compatibilidade
        this.setCategory(id);
    },

    applyFilters() {
        this.filteredProdutos = this.produtos.filter(p => {
            const matchSearch = p.nome.toLowerCase().includes(this.searchTerm) ||
                (p.descricao && p.descricao.toLowerCase().includes(this.searchTerm));
            const matchCategory = this.currentCategory === 'all' || p.categoria_id == this.currentCategory;
            return matchSearch && matchCategory;
        });
        this.renderGrid();
    },

    renderGrid() {
        const grid = document.getElementById('produtos-v2-grid');
        if (!grid) return;

        grid.innerHTML = '';

        if (this.filteredProdutos.length === 0) {
            const emptyMsg = this.searchTerm ? 'Nenhum produto encontrado com essa busca.' : 'Nenhum produto nesta categoria.';
            const currentCatId = this.currentCategory;
            const addBtn = currentCatId !== 'all'
                ? `<button class="oc-btn-primary" style="margin-top:1rem;" onclick="ProdutosManager.openModal(null, '${currentCatId}')"><i class="fas fa-plus"></i> Adicionar produto</button>`
                : `<button class="oc-btn-primary" style="margin-top:1rem;" onclick="ProdutosManager.openModal()"><i class="fas fa-plus"></i> Adicionar produto</button>`;
            grid.innerHTML = `<div class="oc-empty-state"><i class="fas fa-search"></i><p>${emptyMsg}</p>${addBtn}</div>`;
            return;
        }

        // Quando filtrando por categoria específica, renderizar em um único bloco
        if (this.currentCategory !== 'all') {
            const cat = (typeof CategoriasManager !== 'undefined')
                ? CategoriasManager.categorias.find(c => c.id == this.currentCategory)
                : null;
            const catName = cat ? cat.nome : 'Categoria';
            this._renderCategoryBlock(grid, String(this.currentCategory), catName, this.filteredProdutos, true);
        } else {
            // Agrupar por categoria
            const groups = {};
            const groupOrder = [];
            this.filteredProdutos.forEach(p => {
                const catId = String(p.categoria_id || 0);
                const catName = p.categoria_nome || 'Sem Categoria';
                if (!groups[catId]) { groups[catId] = { name: catName, items: [] }; groupOrder.push(catId); }
                groups[catId].items.push(p);
            });
            groupOrder.forEach(catId => {
                this._renderCategoryBlock(grid, catId, groups[catId].name, groups[catId].items, false);
            });
        }

        // Initialize SortableJS
        if (typeof Sortable !== 'undefined') {
            ProdutosManager.initSortableLists();
        }
    },

    initSortableLists() {
        const grid = document.getElementById('produtos-v2-grid');

        // Sort Categories
        if (this.currentCategory === 'all') {
            Sortable.create(grid, {
                handle: '.cat-drag-handle',
                animation: 150,
                onEnd: async (evt) => {
                    const cards = Array.from(grid.querySelectorAll('.oc-category-card'));
                    const itens = cards.map((el, idx) => ({ id: Number(el.dataset.id), ordem: idx }));
                    try {
                        const res = await apiFetch('/api/categorias/reordenar', {
                            method: 'PUT',
                            body: { itens }
                        });
                        if (res.ok) console.log('✅ Ordem das categorias atualizada!');
                    } catch (e) { console.error('Erro ao reordenar:', e); }
                }
            });
        }

        // Sort Products within categories
        const bodies = document.querySelectorAll('.oc-cat-body');
        bodies.forEach(body => {
            Sortable.create(body, {
                handle: '.prod-drag-handle',
                animation: 150,
                onEnd: async (evt) => {
                    const rows = Array.from(body.querySelectorAll('.oc-product-row'));
                    const itens = rows.map((el, idx) => ({ id: Number(el.dataset.id), ordem: idx }));
                    try {
                        const res = await apiFetch('/api/v2/produtos/reordenar', {
                            method: 'PUT',
                            body: { itens }
                        });
                        if (res.ok) console.log('✅ Ordem dos produtos atualizada!');
                    } catch (e) { console.error('Erro ao reordenar produtos:', e); }
                }
            });
        });
    },

    _renderCategoryBlock(grid, catId, catName, prods, skipHeader) {
        const card = document.createElement('div');
        card.className = 'oc-category-card';
        card.dataset.id = catId; // Para SortableJS

        if (!skipHeader) {
            const header = document.createElement('div');
            header.className = 'oc-cat-header';
            header.innerHTML = `
                <div class="oc-cat-title-container" style="display:flex; align-items:center;">
                    <i class="fas fa-grip-vertical cat-drag-handle" style="color:#d1d5db; margin-right:1rem; cursor:grab; font-size:1.2rem; padding:0.5rem;" title="Arraste para reordenar"></i>
                    <div>
                        <span class="oc-cat-title">${catName}</span>
                        <span class="oc-cat-count">${prods.length}</span>
                    </div>
                </div>
                <div class="oc-cat-actions">
                    <i class="fas fa-chevron-down oc-chevron"></i>
                </div>
            `;

            const body = document.createElement('div');
            body.className = 'oc-cat-body open';
            this._renderProductRows(body, catId, catName, prods);

            header.onclick = () => {
                body.classList.toggle('open');
                const chevron = header.querySelector('.oc-chevron');
                chevron.classList.toggle('fa-chevron-up');
                chevron.classList.toggle('fa-chevron-down');
            };

            card.appendChild(header);
            card.appendChild(body);
        } else {
            // Sem header separado (mostrando categoria única)
            const body = document.createElement('div');
            body.className = 'oc-cat-body open';
            body.style.borderTop = 'none';
            this._renderProductRows(body, catId, catName, prods);
            card.appendChild(body);
        }

        grid.appendChild(card);
    },

    _renderProductRows(body, catId, catName, prods) {
        prods.forEach(p => {
            const row = document.createElement('div');
            row.className = 'oc-product-row';
            row.dataset.id = p.id; // Para SortableJS

            const imgUrl = p.imagem_url || '';
            const imgHtml = imgUrl
                ? `<img src="${imgUrl}" alt="${p.nome}" class="oc-product-thumb" onerror="this.outerHTML='<div class=oc-product-thumb style=display:flex;align-items:center;justify-content:center;font-size:1.6rem>🍔</div>'">`
                : `<div class="oc-product-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.6rem;">🍔</div>`;

            const disponivel = p.disponivel !== false;
            const eyeIconClass = disponivel ? 'fas fa-eye' : 'fas fa-eye-slash';
            const eyeIconColor = disponivel ? '#2563eb' : '#9ca3af';

            row.innerHTML = `
                <i class="fas fa-grip-vertical prod-drag-handle" style="color:#d1d5db; margin:0 1rem; cursor:grab; font-size:1.2rem;"></i>
                ${imgHtml}
                <div class="oc-product-info" style="margin-left:1rem; flex:1;">
                    <div class="oc-product-name">${p.nome}</div>
                    <div class="oc-product-desc">${p.descricao || ''}</div>
                </div>
                <div class="oc-product-price" style="margin-right:2rem; font-weight:600;">${window.formatCurrency(p.preco)}</div>
                
                <div class="list-inline-actions" style="display:flex; align-items:center; gap:1.5rem; position:relative;">
                    <i class="${eyeIconClass}" style="color:${eyeIconColor}; cursor:pointer; font-size:1.1rem;" title="${disponivel ? 'Disponível' : 'Pausado'}" onclick="event.stopPropagation(); ProdutosManager.toggleListVisibility(${p.id}, ${!disponivel})"></i>
                    
                    <div style="position:relative;" onclick="event.stopPropagation();">
                        <i class="fas fa-ellipsis-v list-prod-options-btn" style="color:#6b7280; cursor:pointer; font-size:1.1rem; padding:0.5rem;" title="Opções"></i>
                        <div class="list-prod-options-popup" style="display:none; position:absolute; right:100%; top:0; background:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15); border-radius:8px; border:1px solid #e5e7eb; width:160px; z-index:9999; flex-direction:column; padding:0.5rem 0; margin-right:10px;">
                            <div class="oc-option-item" onclick="ProdutosManager.duplicateListProduct(${p.id})" style="padding:0.7rem 1.2rem; cursor:pointer; display:flex; gap:0.8rem; align-items:center; font-size:0.95rem; color:#374151;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                                <i class="far fa-copy" style="color:#6b7280;"></i> Duplicar
                            </div>
                            <div style="height:1px; background:#e5e7eb; margin:0.3rem 0;"></div>
                            <div class="oc-option-item" onclick="ProdutosManager.deleteListProduct(${p.id})" style="padding:0.7rem 1.2rem; cursor:pointer; display:flex; gap:0.8rem; align-items:center; font-size:0.95rem; color:#ef4444;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='transparent'">
                                <i class="far fa-trash-alt"></i> Excluir
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Edit modal when clicking the row
            const infoArea = row.querySelector('.oc-product-info');
            if (infoArea) infoArea.style.cursor = 'pointer';
            if (infoArea) infoArea.onclick = () => ProdutosManager.edit(p.id);
            const imgArea = row.querySelector('.oc-product-thumb');
            if (imgArea) imgArea.style.cursor = 'pointer';
            if (imgArea) imgArea.onclick = () => ProdutosManager.edit(p.id);

            // Popover toggle logic
            const btn = row.querySelector('.list-prod-options-btn');
            const popup = row.querySelector('.list-prod-options-popup');
            btn.onclick = (e) => {
                e.stopPropagation();
                // Close others first
                document.querySelectorAll('.list-prod-options-popup').forEach(el => {
                    if (el !== popup) el.style.display = 'none';
                });
                popup.style.display = popup.style.display === 'flex' ? 'none' : 'flex';
            };

            body.appendChild(row);
        });

        // Botão de adicionar produto à categoria
        const addRow = document.createElement('div');
        addRow.className = 'oc-add-product-row';
        addRow.innerHTML = `<button class="oc-add-product-btn-text" onclick="ProdutosManager.openModal(null, ${catId})">+ Produto de ${catName}</button>`;
        body.appendChild(addRow);
    },

    // --- LOGICA DO MODAL V3 ---

    openModal(p = null, defaultCatId = null) {
        const modal = document.getElementById('modal-produto-v2');
        const form = document.getElementById('form-produto-v2');
        const title = document.getElementById('modal-title');

        if (!modal || !form) return;

        form.reset();

        // Reset preview
        const previewReset = document.getElementById('product-image-preview-v3');
        const placeholderReset = document.getElementById('image-placeholder-v3');
        if (previewReset) previewReset.style.display = 'none';
        if (placeholderReset) placeholderReset.style.display = 'flex';
        
        const urlHidden = document.getElementById('product-image-url-hidden');
        if (urlHidden) urlHidden.value = '';

        // Bugfix: Limpar a imagem local selecionada anteriormente e o input
        this.selectedImageFile = null;
        this.currentProductId = p ? p.id : null;
        this.tempVariantes = [];
        const fileInput = document.getElementById('product-image-file');
        if (fileInput) fileInput.value = '';

        if (p) {
            title.innerText = p.id ? 'Editar produto' : 'Novo produto';
            form.id.value = p.id || '';
            form.nome.value = p.nome || '';
            form.descricao.value = p.descricao || '';
            form.preco.value = Number(p.preco || 0).toFixed(2);
            if (form.categoria_id && p.categoria_id) form.categoria_id.value = p.categoria_id;
            if (form.cozinha_id && p.cozinha_id) form.cozinha_id.value = p.cozinha_id;

            // BUGFIX: usar imagem_url (não image_url)
            const imgUrl = p.imagem_url || '';
            if (imgUrl) {
                const preview = document.getElementById('product-image-preview-v3');
                const placeholder = document.getElementById('image-placeholder-v3');
                const urlHidden = document.getElementById('product-image-url-hidden');
                
                if (preview) {
                    preview.src = imgUrl;
                    preview.style.display = 'block';
                }
                if (placeholder) placeholder.style.display = 'none';
                if (urlHidden) urlHidden.value = imgUrl;
            }

            // BUGFIX: disponivel (não active/checked) + controlar_estoque
            const isDisponivel = p.disponivel !== false;
            const inputDisponivel = document.getElementById('input-disponivel-hidden');
            if (inputDisponivel) inputDisponivel.value = isDisponivel ? 'true' : 'false';
            this.updateStatusBadge(isDisponivel);

            if (form.is_destaque) form.is_destaque.checked = !!p.is_destaque;
            const controlarEstoque = !!p.controlar_estoque;
            if (form.controlar_estoque) form.controlar_estoque.checked = controlarEstoque;
            if (form.estoque_atual) form.estoque_atual.value = p.estoque_atual || 0;
            if (form.estoque_minimo) form.estoque_minimo.value = p.estoque_minimo || 0;

            // Campos extras
            if (form.desconto) form.desconto.value = p.desconto || 0;
            if (form.custo) form.custo.value = p.custo || 0;
            if (form.preco_embalagem) form.preco_embalagem.value = p.preco_embalagem || 0;
            if (form.sku) form.sku.value = p.sku || '';

            const rowDesconto = document.getElementById('product-desconto-row');
            const chipDesconto = document.getElementById('chip-desconto');
            if (rowDesconto) rowDesconto.style.display = (p.desconto > 0) ? 'block' : 'none';
            if (chipDesconto) chipDesconto.style.display = (p.desconto > 0) ? 'none' : 'inline-flex';
            
            const rowCusto = document.getElementById('product-custo-row');
            const chipCusto = document.getElementById('chip-custo');
            if (rowCusto) rowCusto.style.display = (p.custo > 0) ? 'block' : 'none';
            if (chipCusto) chipCusto.style.display = (p.custo > 0) ? 'none' : 'inline-flex';
            
            const rowEmbalagem = document.getElementById('product-embalagem-row');
            const chipEmbalagem = document.getElementById('chip-embalagem');
            if (rowEmbalagem) rowEmbalagem.style.display = (p.preco_embalagem > 0) ? 'block' : 'none';
            if (chipEmbalagem) chipEmbalagem.style.display = (p.preco_embalagem > 0) ? 'none' : 'inline-flex';

            const rowSku = document.getElementById('product-sku-row');
            const chipSku = document.getElementById('chip-sku');
            if (rowSku) rowSku.style.display = (p.sku) ? 'block' : 'none';
            if (chipSku) chipSku.style.display = (p.sku) ? 'none' : 'inline-flex';

            // BUGFIX: toggle stock details usando classList
            const stockDetails = document.getElementById('stock-details-v3');
            if (stockDetails) stockDetails.classList.toggle('visible', controlarEstoque);

            this.selectedModificadores = Array.isArray(p.modificadores) ? JSON.parse(JSON.stringify(p.modificadores)) : [];
            this.renderModificadores();

            this.tempVariantes = Array.isArray(p.variantes) ? JSON.parse(JSON.stringify(p.variantes)) : [];
            const tabs = document.querySelector('.oc-tabs').querySelectorAll('.oc-tab');
            if (this.tempVariantes.length > 0) {
                this.setPriceType('variantes', tabs[1]);
            } else {
                this.setPriceType('simples', tabs[0]);
            }
        } else {
            title.innerText = 'Novo produto';
            form.id.value = '';
            const inputDisponivelNew = document.getElementById('input-disponivel-hidden');
            if (inputDisponivelNew) inputDisponivelNew.value = 'true';

            // Setar categoria default se enviada do botão do acordeão
            if (form.categoria_id && defaultCatId && defaultCatId != 0) {
                form.categoria_id.value = defaultCatId;
            }

            const stockDetails = document.getElementById('stock-details-v3');
            if (stockDetails) stockDetails.classList.remove('visible');
            if (form.desconto) form.desconto.value = 0;
            if (form.custo) form.custo.value = 0;
            if (form.preco_embalagem) form.preco_embalagem.value = 0;
            if (form.sku) form.sku.value = '';

            const rowDescNew = document.getElementById('product-desconto-row');
            const chipDescNew = document.getElementById('chip-desconto');
            if (rowDescNew) rowDescNew.style.display = 'none';
            if (chipDescNew) chipDescNew.style.display = 'inline-flex';

            const rowCustoNew = document.getElementById('product-custo-row');
            const chipCustoNew = document.getElementById('chip-custo');
            if (rowCustoNew) rowCustoNew.style.display = 'none';
            if (chipCustoNew) chipCustoNew.style.display = 'inline-flex';

            const rowEmbNew = document.getElementById('product-embalagem-row');
            const chipEmbNew = document.getElementById('chip-embalagem');
            if (rowEmbNew) rowEmbNew.style.display = 'none';
            if (chipEmbNew) chipEmbNew.style.display = 'inline-flex';

            const rowSkuNew = document.getElementById('product-sku-row');
            const chipSkuNew = document.getElementById('chip-sku');
            if (rowSkuNew) rowSkuNew.style.display = 'none';
            if (chipSkuNew) chipSkuNew.style.display = 'inline-flex';

            this.selectedModificadores = [];
            this.tempVariantes = [];

            const tabs = document.querySelector('.oc-tabs').querySelectorAll('.oc-tab');
            this.setPriceType('simples', tabs[0]);

            this.updateStatusBadge(true);
            this.renderModificadores();
        }

        modal.style.display = 'flex';
    },

    closeModal() {
        const modal = document.getElementById('modal-produto-v2');
        if (modal) modal.style.display = 'none';
        // Garantir que o cropper não fica activo em background
        if (this._cropperInstance) {
            this._cropperInstance.destroy();
            this._cropperInstance = null;
        }
    },

    handleImageUpload(event) {
        event.preventDefault();
        const file = event.target.files[0];
        // Limpar input para permitir seleccionar o mesmo ficheiro novamente
        event.target.value = '';
        if (!file) return;
        this._openCropModal(file);
    },

    // ── Cropper.js helpers ──────────────────────────────────────────────

    _openCropModal(file) {
        const modal = document.getElementById('modal-crop-imagem');
        const img   = document.getElementById('crop-source-img');
        if (!modal || !img) return;

        // Destruir instância anterior se existir
        if (this._cropperInstance) {
            this._cropperInstance.destroy();
            this._cropperInstance = null;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            modal.style.display = 'flex';

            // Inicializar Cropper após a imagem carregar
            img.onload = () => {
                this._cropperInstance = new Cropper(img, {
                    aspectRatio: NaN,       // proporção livre
                    viewMode: 0,            // imagem pode ser movida além do container
                    autoCropArea: 0.85,     // começa com 85% da área seleccionada
                    dragMode: 'move',       // por defeito arrasta a imagem
                    background: false,
                    responsive: true,
                    restore: false,
                    guides: true,
                    highlight: false,
                    cropBoxMovable: true,   // crop box pode ser reposicionada
                    cropBoxResizable: true, // crop box pode ser redimensionada
                    wheelZoomRatio: 0.1,    // zoom suave com scroll do mouse
                    zoom(e) {
                        // Sincronizar slider com o zoom actual
                        const range = document.getElementById('crop-zoom-range');
                        if (range) {
                            const ratio = e.detail.ratio;
                            const init  = e.detail.oldRatio;
                            // valor normalizado 0-1 baseado no zoom relativo
                            const current = parseFloat(range.value) || 0;
                            const delta   = ratio - init;
                            range.value = Math.min(1, Math.max(0, current + delta));
                        }
                    },
                });
            };
        };
        reader.readAsDataURL(file);
    },

    _cropZoom(delta) {
        if (this._cropperInstance) this._cropperInstance.zoom(delta);
    },

    _cropZoomAbs(value) {
        // value 0-1 → zoom de 0.1× até 6×
        if (!this._cropperInstance) return;
        const targetRatio = 0.1 + value * 5.9;
        const data = this._cropperInstance.getCanvasData();
        const imgData = this._cropperInstance.getImageData();
        const currentRatio = data.width / imgData.naturalWidth;
        if (currentRatio > 0) {
            this._cropperInstance.zoom(targetRatio - currentRatio);
        }
    },

    _cropRotate(deg) {
        if (this._cropperInstance) this._cropperInstance.rotate(deg);
    },

    _cropConfirm() {
        if (!this._cropperInstance) return;

        // Extrair canvas cortado com dimensão máxima de 1600px
        const canvas = this._cropperInstance.getCroppedCanvas({
            maxWidth:    1600,
            maxHeight:   1600,
            fillColor:   '#fff',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        canvas.toBlob((blob) => {
            if (!blob) { alert('Erro ao processar imagem.'); return; }

            // Converter blob → File para envio no submit
            const file = new File([blob], 'produto-crop.jpg', { type: 'image/jpeg' });
            this.selectedImageFile = file;

            // Actualizar preview no modal do produto
            const preview     = document.getElementById('product-image-preview-v3');
            const placeholder = document.getElementById('image-placeholder-v3');
            if (preview) {
                preview.src = URL.createObjectURL(blob);
                preview.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';

            this._closeCropModal();
        }, 'image/jpeg', 0.92);
    },

    _cropCancel() {
        this._closeCropModal();
    },

    _closeCropModal() {
        const modal = document.getElementById('modal-crop-imagem');
        if (modal) modal.style.display = 'none';
        if (this._cropperInstance) {
            this._cropperInstance.destroy();
            this._cropperInstance = null;
        }
        // Reset slider
        const range = document.getElementById('crop-zoom-range');
        if (range) range.value = '0';
    },

    toggleStatus() {
        const hiddenInput = document.getElementById('input-disponivel-hidden');
        const current = hiddenInput.value === 'true';
        hiddenInput.value = (!current).toString();
        this.updateStatusBadge(!current);
    },

    // --- Integração com Inteligência Artificial (Fase 1) ---
    async gerarDescricaoIA(btn) {
        const form = document.getElementById('form-produto-v2');
        if (!form) return;

        const nome = form.querySelector('input[name="nome"]')?.value.trim();
        // Não temos dropdown no novo editor pro categoria (ela vem externa), então pegamos só os essenciais
        const descricaoElement = form.querySelector('textarea[name="descricao"]');
        const ingredientes_atuais = descricaoElement ? descricaoElement.value.trim() : '';

        if (!nome) {
            alert('⚠️ Digite o Nome do produto primeiro para a IA saber o que é!');
            return;
        }

        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pensando...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';

        try {
            const res = await apiFetch('/api/ia/gerar-descricao', {
                method: 'POST',
                body: { nome, ingredientes_atuais }
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao conectar à IA');

            if (descricaoElement) {
                descricaoElement.value = data.descricao;
                descricaoElement.style.transition = 'background 0.3s';
                descricaoElement.style.background = '#d1fae5'; // Verde claro de sucesso
                setTimeout(() => descricaoElement.style.background = '#f9fafb', 1500);
            }
        } catch (err) {
            console.error('Falha na IA:', err);
            alert('Falha ao gerar descrição: ' + err.message);
        } finally {
            btn.innerHTML = originalContent;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    },

    async prepararMelhoriaImagemIA(btn) {
        const imgEl = document.getElementById('product-image-preview-v3');
        const hasSrc = imgEl && imgEl.src && !imgEl.src.endsWith('#') && imgEl.style.display !== 'none';

        if (!hasSrc && !this.selectedImageFile) {
            alert('Adicione uma imagem ao produto antes de melhorá-la com IA.');
            return;
        }

        const originalContent = btn.innerHTML;
        btn.innerHTML = '⏳ Processando...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';

        try {
            // 1. Obter PNG 1024x1024 via canvas (browser-side)
            const pngBlob = await new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                const image = new Image();
                image.crossOrigin = 'anonymous';

                image.onload = () => {
                    // Square crop (center)
                    const s = Math.min(image.naturalWidth, image.naturalHeight);
                    const ox = (image.naturalWidth - s) / 2;
                    const oy = (image.naturalHeight - s) / 2;
                    ctx.drawImage(image, ox, oy, s, s, 0, 0, 1024, 1024);
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error('Falha ao converter imagem para PNG.'));
                    }, 'image/png');
                };
                image.onerror = () => reject(new Error('Não foi possível carregar a imagem para processamento.'));

                if (this.selectedImageFile) {
                    image.src = URL.createObjectURL(this.selectedImageFile);
                } else {
                    image.src = imgEl.src;
                }
            });

            // 2. Enviar para o backend
            const formData = new FormData();
            formData.append('image', pngBlob, 'produto.png');

            const resp = await apiFetch('/api/ia/melhorar-imagem', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: resp.statusText }));
                throw new Error(err.error || 'Erro no servidor.');
            }
            const data = await resp.json();

            // 3. Exibir modal de comparação antes/depois
            this._showImageComparisonModal(imgEl.src || URL.createObjectURL(this.selectedImageFile), data.imageBase64, data.isMock);

        } catch (err) {
            console.error('Erro ao melhorar imagem:', err);
            alert('Erro ao melhorar imagem: ' + err.message);
        } finally {
            btn.innerHTML = originalContent;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    },

    _showImageComparisonModal(beforeSrc, afterBase64, isMock) {
        // Remove modal anterior se existir
        const existing = document.getElementById('modal-melhoria-ia');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-melhoria-ia';
        modal.style.cssText = `
            position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);
            display:flex;align-items:center;justify-content:center;padding:1rem;
        `;
        modal.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:780px;width:100%;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
                <h3 style="margin:0 0 0.3rem;font-size:1.15rem;">🎨 Melhoria de Imagem com IA</h3>
                ${isMock ? '<p style="margin:0 0 1rem;font-size:0.8rem;color:#888;">⚠️ Modo simulação — configure OPENAI_API_KEY para resultado real.</p>' : '<p style="margin:0 0 1rem;font-size:0.8rem;color:#4caf50;">✅ Imagem processada pela IA.</p>'}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.2rem;">
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem;font-weight:700;color:#888;margin-bottom:0.4rem;text-transform:uppercase;">Antes</div>
                        <img src="${beforeSrc}" style="width:100%;border-radius:10px;object-fit:cover;aspect-ratio:1;border:2px solid #eee;">
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem;font-weight:700;color:#2196f3;margin-bottom:0.4rem;text-transform:uppercase;">Depois (IA)</div>
                        <img src="${afterBase64}" id="img-melhoria-depois" style="width:100%;border-radius:10px;object-fit:cover;aspect-ratio:1;border:2px solid #2196f3;">
                    </div>
                </div>
                <div style="display:flex;gap:0.8rem;justify-content:flex-end;">
                    <button id="btn-melhoria-cancelar" style="padding:0.6rem 1.4rem;border:1.5px solid #ccc;background:#fff;border-radius:8px;cursor:pointer;font-size:0.9rem;">Cancelar</button>
                    <button id="btn-melhoria-usar" style="padding:0.6rem 1.4rem;background:#2196f3;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:700;">✅ Usar imagem melhorada</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-melhoria-cancelar').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('btn-melhoria-usar').onclick = () => {
            // Converter base64 → File e setar como imagem selecionada
            fetch(afterBase64)
                .then(r => r.blob())
                .then(blob => {
                    const file = new File([blob], 'produto-ia.png', { type: 'image/png' });
                    this.selectedImageFile = file;

                    const preview = document.getElementById('product-image-preview-v3');
                    const placeholder = document.getElementById('image-placeholder-v3');
                    if (preview) {
                        preview.src = afterBase64;
                        preview.style.display = 'block';
                    }
                    if (placeholder) placeholder.style.display = 'none';

                    modal.remove();
                })
                .catch(() => {
                    alert('Falha ao aplicar imagem melhorada.');
                    modal.remove();
                });
        };
    },
    // ----------------------------------------------------

    filterModifierPopup(query) {
        const container = document.getElementById('available-modifiers-list');
        if (!container) return;
        const q = (query || '').toLowerCase().trim();
        container.querySelectorAll('.pm-popup-group-item').forEach(item => {
            const name = (item.querySelector('.pm-popup-group-name')?.textContent || '').toLowerCase();
            if (item) item.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
    },

    updateStatusBadge(isActive) {
        const badge = document.getElementById('badge-disponivel');
        if (!badge) return;

        if (isActive) {
            badge.style.background = '#def7ec';
            badge.style.color = '#03543f';
            badge.style.borderColor = '#31c48d';
            badge.innerHTML = 'Disponível <i class="fas fa-caret-down"></i>';
        } else {
            badge.style.background = '#fde8e8';
            badge.style.color = '#9b1c1c';
            badge.style.borderColor = '#f8b4b4';
            badge.innerHTML = 'Pausado <i class="fas fa-caret-down"></i>';
        }
    },

    setPriceType(type, btn) {
        document.getElementById('input-tipo-preco').value = type;
        const container = btn.parentElement;
        container.querySelectorAll('.oc-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (type === 'variantes') {
            const simplesCont = document.getElementById('product-simples-container');
            const variantsCont = document.getElementById('product-variants-container');
            if (simplesCont) simplesCont.style.display = 'none';
            if (variantsCont) variantsCont.style.display = 'flex';
            this.renderVariantes();
        } else {
            const simplesCont = document.getElementById('product-simples-container');
            const variantsCont = document.getElementById('product-variants-container');
            if (simplesCont) simplesCont.style.display = 'block';
            if (variantsCont) variantsCont.style.display = 'none';
        }
    },

    // --- VARIANTES E OPÇÕES ---

    renderVariantes() {
        const list = document.getElementById('product-variants-list');
        const badge = document.getElementById('badge-variants-count');
        if (!list) return;

        if (badge) {
            badge.style.display = this.tempVariantes.length > 0 ? 'inline-flex' : 'none';
            badge.innerText = this.tempVariantes.length;
        }

        if (this.tempVariantes.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:1.5rem; background:#f9fafb; border-radius:12px; color:#9ca3af; font-size:0.9rem;">Nenhuma variante adicionada</div>`;
            return;
        }

        list.innerHTML = this.tempVariantes.map((v, i) => {
            const isActive = v.ativo !== false;
            return `
            <div style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                <div style="padding:1rem; background:#f9fafb; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <div>
                        <div style="font-weight:700; color:#1f2937;">${v.nome || 'Sem Nome'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-weight:600; color:#374151;">${window.formatCurrency(v.preco)}</span>
                        <i class="fas fa-chevron-down" style="color:#9ca3af; font-size: 0.8rem;"></i>
                    </div>
                </div>
                <div style="display:none; padding:1rem; background:#fff; border-top:1px solid #e5e7eb;">
                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        <div class="oc-input-group">
                            <label>Nome da Variante (Copo/Tamanho/...)</label>
                            <input type="text" value="${v.nome || ''}" onchange="ProdutosManager.updateVariante(${i}, 'nome', this.value)" style="border:1px solid #ccc; padding:0.6rem; border-radius:6px; width:100%;">
                        </div>
                        <div style="display:flex; gap:1rem;">
                            <div class="oc-input-group" style="flex:1;">
                                <label>Preço (R$)</label>
                                <input type="number" step="0.01" value="${Number(v.preco || 0).toFixed(2)}" onchange="ProdutosManager.updateVariante(${i}, 'preco', this.value)" style="border:1px solid #ccc; padding:0.6rem; border-radius:6px; width:100%;">
                            </div>
                            <div class="oc-input-group" style="flex:1; display:flex; flex-direction:column; justify-content:flex-end;">
                                <button type="button" onclick="ProdutosManager.updateVariante(${i}, 'ativo', ${!isActive})" style="padding:0.6rem; border:1px solid ${isActive ? '#34d399' : '#f87171'}; background:${isActive ? '#ecfdf5' : '#fef2f2'}; color:${isActive ? '#065f46' : '#991b1b'}; border-radius:6px; cursor:pointer; font-weight:600; width:100%;">
                                    ${isActive ? '🟢 Disponível' : '🔴 Pausado'}
                                </button>
                            </div>
                        </div>
                        <div style="display:flex; gap:1rem;">
                            <div class="oc-input-group" style="flex:1;">
                                <label>Custo (R$)</label>
                                <input type="number" step="0.01" value="${Number(v.custo || 0).toFixed(2)}" onchange="ProdutosManager.updateVariante(${i}, 'custo', this.value)" style="border:1px solid #ccc; padding:0.6rem; border-radius:6px; width:100%;">
                            </div>
                            <div class="oc-input-group" style="flex:1;">
                                <label>Desconto (R$)</label>
                                <input type="number" step="0.01" value="${Number(v.desconto || 0).toFixed(2)}" onchange="ProdutosManager.updateVariante(${i}, 'desconto', this.value)" style="border:1px solid #ccc; padding:0.6rem; border-radius:6px; width:100%;">
                            </div>
                        </div>
                        <div style="display:flex; gap:1rem;">
                            <div class="oc-input-group" style="flex:1;">
                                <label>SKU</label>
                                <input type="text" value="${v.sku || ''}" onchange="ProdutosManager.updateVariante(${i}, 'sku', this.value)" style="border:1px solid #ccc; padding:0.6rem; border-radius:6px; width:100%;">
                            </div>
                            <div style="flex:1; display:flex; align-items:flex-end; justify-content:flex-end;">
                                <button type="button" onclick="ProdutosManager.removeVariante(${i})" style="color:#ef4444; background:transparent; border:none; padding:0.6rem; cursor:pointer; font-weight:600;" title="Excluir">
                                    <i class="fas fa-trash"></i> Excluir Variante
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    addVariante() {
        this.tempVariantes.push({ nome: 'Opção', preco: 0, custo: 0, desconto: 0, sku: '', ativo: true });
        this.renderVariantes();
    },

    removeVariante(index) {
        if (!confirm('Deseja excluir esta variante?')) return;
        this.tempVariantes.splice(index, 1);
        this.renderVariantes();
    },

    updateVariante(index, field, value) {
        if (field === 'preco' || field === 'custo' || field === 'desconto') value = Number(value);
        this.tempVariantes[index][field] = value;
        if (field === 'nome' || field === 'preco' || field === 'ativo') {
            this.renderVariantes(); // recarrega para atualizar a header
        }
    },

    toggleOptionsPopup(e) {
        if (e) e.stopPropagation();
        const popup = document.getElementById('product-options-popup');
        if (!popup) return;

        const isDisponivel = document.getElementById('input-disponivel-hidden').value === 'true';
        document.getElementById('icon-visibility-current').className = isDisponivel ? 'far fa-eye-slash' : 'far fa-eye';
        document.getElementById('text-visibility-current').innerText = isDisponivel ? 'Invisível' : 'Visível';

        popup.style.display = popup.style.display === 'none' ? 'flex' : 'none';
    },

    toggleVisibilityCurrent() {
        this.toggleStatus();
        this.toggleOptionsPopup();
    },

    duplicateCurrent() {
        this.toggleOptionsPopup();
        if (!confirm('Deseja configurar este produto como uma cópia e salvar como um novo produto?')) return;
        const form = document.getElementById('form-produto-v2');
        if (form) form.id.value = '';
        document.getElementById('modal-title').innerText = 'Nova Cópia';

        // Simular alerta leve para o usuario clicar em Salvar
        const btnSave = form.querySelector('.pm-btn-save');
        if (btnSave) {
            const originalColor = btnSave.style.background;
            btnSave.style.background = '#059669';
            btnSave.innerText = 'Salvar Cópia';
            setTimeout(() => {
                btnSave.style.background = originalColor;
            }, 3000);
        }
    },

    async deleteCurrent() {
        this.toggleOptionsPopup();
        if (!this.currentProductId) {
            alert('Este produto ainda não foi salvo no banco, você pode apenas fechar o modal.');
            return;
        }
        await this.delete(this.currentProductId);
        this.closeModal();
    },

    // --- AÇÕES NA LISTAGEM ---

    async toggleListVisibility(id, setDisponivel) {
        try {
            const res = await apiFetch(`/api/v2/produtos/${id}`, {
                method: 'PUT',
                body: { disponivel: setDisponivel }
            });
            if (!res.ok) throw new Error('Erro ao alterar status');
            await this.load(); // Refresh grid
        } catch (err) {
            console.error(err);
            alert('Falha ao alterar a visibilidade do produto.');
        }
    },

    duplicateListProduct(id) {
        // Encontrar produto
        const p = this.produtos.find(prod => prod.id === id);
        if (!p) return;

        if (!confirm(`Deseja criar uma cópia de "${p.nome}"?`)) return;

        // Abrir modal com dados copiados e id vazio
        this.openModal(p);
        const form = document.getElementById('form-produto-v2');
        if (form) form.id.value = '';
        document.getElementById('modal-title').innerText = `Cópia de ${p.nome}`;
        alert('Produto pronto para ser salvo como cópia. Edite o que precisar e clique em "Salvar".');
    },

    async deleteListProduct(id) {
        if (!confirm('Tem certeza que deseja excluir permanentemente este produto?')) return;
        await this.delete(id);
    },

    // --- GERENCIAMENTO DE MODIFICADORES V3 ---

    openAddModifierPopup() {
        const popup = document.getElementById('popup-add-modifier');
        if (!popup) return;

        this.renderAvailableModifiers();
        popup.style.display = 'flex';
    },

    renderAvailableModifiers() {
        const container = document.getElementById('available-modifiers-list');
        if (!container) return;

        const allGroups = (typeof ModificadoresManager !== 'undefined') ? (ModificadoresManager.categorias || []) : [];
        const selectedIds = this.selectedModificadores.map(m => m.modificador_id || m.id);
        const available = allGroups.filter(g => !selectedIds.includes(g.id));

        if (available.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:2rem; font-size:0.9rem;">Todos os grupos já estão vinculados.</p>';
            return;
        }

        container.innerHTML = available.map(g => {
            const isReq = g.obrigatorio ? '🔴 Obrigatório' : '🟢 Opcional';
            const selType = g.selecao_unica ? 'Única' : `Múltipla (${g.min_escolhas || 0}-${g.max_escolhas || 1})`;
            const itemCount = g.itens ? g.itens.length : 0;
            return `
            <div class="pm-popup-group-item" onclick="ProdutosManager.addModifierFromPopup(${g.id})">
                <div class="pm-popup-group-info">
                    <div class="pm-popup-group-name">${g.nome}</div>
                    <div class="pm-popup-group-meta">${isReq} · ${selType} · ${itemCount} opção${itemCount !== 1 ? 'ões' : ''}</div>
                </div>
                <i class="fas fa-plus" style="color:var(--primary);"></i>
            </div>`;
        }).join('');
    },

    addModifierFromPopup(id) {
        const allGroups = (typeof ModificadoresManager !== 'undefined') ? (ModificadoresManager.categorias || []) : [];
        const group = allGroups.find(g => g.id === id);

        if (group) {
            this.selectedModificadores.push({
                produto_id: document.getElementById('form-produto-v2').id.value || null,
                modificador_id: group.id,
                nome: group.nome, // Helper for UI
                min_escolhas_override: group.min_escolhas,
                max_escolhas_override: group.max_escolhas,
                obrigatorio_override: group.obrigatorio,
                selecao_unica_override: group.selecao_unica,
                ordem_override: (this.selectedModificadores.length + 1),
                ativo_override: true
            });
            this.renderModificadores();
            const popupAdd = document.getElementById('popup-add-modifier');
            if (popupAdd) popupAdd.style.display = 'none';
        }
    },

    removeModifier(index) {
        this.selectedModificadores.splice(index, 1);
        this.renderModificadores();
    },

    renderModificadores() {
        const container = document.getElementById('product-modificadores-list-v3');
        const badge = document.getElementById('modificadores-count-badge');
        if (!container) return;

        if (badge) badge.innerText = this.selectedModificadores.length;

        if (this.selectedModificadores.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:1.5rem; background:#f9fafb; border-radius:12px; color:#9ca3af; font-size:0.9rem;">
                    Nenhum modificador vinculado
                </div>
            `;
            return;
        }

        container.innerHTML = this.selectedModificadores.map((mod, index) => {
            // Resolver nome e valores globais da categoria como fallback
            let name = mod.nome || mod.modificador_nome || mod.name;
            let globalCat = null;
            if (typeof ModificadoresManager !== 'undefined') {
                globalCat = ModificadoresManager.categorias.find(c => c.id === (mod.modificador_id || mod.id));
                if (!name && globalCat) name = globalCat.nome;
            }
            name = name || `Grupo ${mod.modificador_id || mod.id}`;

            // Usar override quando definido; cair para o valor global da categoria como fallback
            const isReq   = (mod.obrigatorio_override  != null) ? mod.obrigatorio_override   : (globalCat ? globalCat.obrigatorio   : false);
            const isSingle = (mod.selecao_unica_override != null) ? mod.selecao_unica_override : (globalCat ? globalCat.selecao_unica : false);
            const min      = (mod.min_escolhas_override  != null) ? mod.min_escolhas_override  : (globalCat ? (globalCat.min_escolhas || 0) : 0);
            const max      = (mod.max_escolhas_override  != null) ? mod.max_escolhas_override  : (globalCat ? (globalCat.max_escolhas || 1) : 1);

            return `
                <div class="oc-mod-item" draggable="true" data-mod-index="${index}">
                    <span class="oc-mod-drag" title="Reordenar"><i class="fas fa-grip-vertical"></i></span>
                    <div class="oc-mod-name">
                        <div style="font-weight:700; color:#1f2937;">${name}</div>
                        <div style="font-size:0.8rem; color:#6b7280; font-weight:400; margin-top:0.2rem;">
                            ${isReq ? 'Obrigatório' : 'Opcional'} · ${isSingle ? 'Seleção Única' : 'Múltipla'} ${!isSingle ? `(${min}-${max})` : ''}
                        </div>
                    </div>
                    <div class="oc-mod-actions">
                        <i class="fas fa-trash" style="cursor:pointer;" onclick="ProdutosManager.removeModifier(${index})" title="Remover"></i>
                    </div>
                </div>
            `;
        }).join('');

        // Ativar drag-and-drop depois de renderizar
        this._setupModDrag(container);
    },

    // ── Drag-and-drop nativo para reordenar modificadores ──────────────────────
    _setupModDrag(container) {
        let dragSrcIndex = null;

        container.querySelectorAll('.oc-mod-item').forEach(el => {
            // Iniciar drag — registra o índice de origem
            el.addEventListener('dragstart', (e) => {
                dragSrcIndex = parseInt(el.dataset.modIndex, 10);
                el.classList.add('oc-mod-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', dragSrcIndex);
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('oc-mod-dragging');
                container.querySelectorAll('.oc-mod-item').forEach(r => r.classList.remove('oc-mod-drag-over'));
            });

            // Alvo de drop — highlight visual
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                container.querySelectorAll('.oc-mod-item').forEach(r => r.classList.remove('oc-mod-drag-over'));
                el.classList.add('oc-mod-drag-over');
            });

            el.addEventListener('dragleave', () => {
                el.classList.remove('oc-mod-drag-over');
            });

            // Soltar — reordenar array e atualizar UI
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                const dropIndex = parseInt(el.dataset.modIndex, 10);
                if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

                // Mover item dentro do array
                const moved = this.selectedModificadores.splice(dragSrcIndex, 1)[0];
                this.selectedModificadores.splice(dropIndex, 0, moved);

                // Atualizar ordem_override para refletir nova posição
                this.selectedModificadores.forEach((m, i) => { m.ordem_override = i + 1; });

                dragSrcIndex = null;
                this.renderModificadores(); // Re-render com nova ordem
            });
        });
    },


    // --- PERSISTENCIA ---

    setupForm() {
        const form = document.getElementById('form-produto-v2');
        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();

            // Bloquear formulário para evitar múltiplos cliques
            const btnSave = form.querySelector('.pm-btn-save');
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.innerText = 'Salvando produto...';
            }

            // Realizar o upload da imagem AGORA (apenas se o usuário selecionou uma nova)
            if (this.selectedImageFile) {
                const formData = new FormData();
                formData.append('image', this.selectedImageFile);
                try {
                    const response = await apiFetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    if (response.ok) {
                        const data = await response.json();
                        // Atualizar com a URL real devolvida pelo servidor
                        document.getElementById('product-image-url-hidden').value = data.url;
                        this.selectedImageFile = null;
                        console.log('✅ Imagem enviada no submit:', data.url);
                    } else {
                        alert('Erro ao fazer upload da imagem. O produto não pôde ser salvo.');
                        if (btnSave) { btnSave.disabled = false; btnSave.innerText = 'Salvar produto'; }
                        return; // cancelar o salvamento do produto
                    }
                } catch (err) {
                    console.error('❌ Erro de conexão no upload:', err);
                    alert('Falha na conexão ao enviar a imagem. Tente novamente.');
                    if (btnSave) { btnSave.disabled = false; btnSave.innerText = 'Salvar produto'; }
                    return; // cancelar o salvamento do produto
                }
            }

            const formData = new FormData(form);
            const raw = Object.fromEntries(formData.entries());

            const data = {
                id: raw.id ? Number(raw.id) : null,
                nome: raw.nome,
                descricao: raw.descricao,
                preco: Number(raw.preco),
                categoria_id: raw.categoria_id ? Number(raw.categoria_id) : null,
                cozinha_id: raw.cozinha_id ? Number(raw.cozinha_id) : null,
                imagem_url: document.getElementById('product-image-url-hidden').value || '',
                disponivel: document.getElementById('input-disponivel-hidden').value === 'true',
                controlar_estoque: form.controlar_estoque ? form.controlar_estoque.checked : false,
                estoque_atual: Number(raw.estoque_atual) || 0,
                estoque_minimo: Number(raw.estoque_minimo) || 0,
                is_destaque: form.is_destaque ? form.is_destaque.checked : false,
                allow_observation: form.allow_observation ? form.allow_observation.checked : true,
                modificadores: this.selectedModificadores,
                custo: Number(raw.custo) || 0,
                desconto: Number(raw.desconto) || 0,
                preco_embalagem: Number(raw.preco_embalagem) || 0,
                sku: raw.sku || null,
                variantes: document.getElementById('input-tipo-preco').value === 'variantes' ? this.tempVariantes : []
            };

            // Garantir preço do produto base em variacoes
            if (data.variantes.length > 0) {
                const variacoesComPreco = data.variantes.filter(v => v.preco >= 0);
                if (variacoesComPreco.length > 0) {
                    data.preco = Math.min(...variacoesComPreco.map(v => v.preco));
                }
            }

            const success = await this.save(data);
            if (success) {
                this.closeModal();
                // Notificar sucesso (opcional)
            }

            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerText = 'Salvar produto';
            }
        };
    },

    async save(data) {
        const isNew = !data.id;
        const url = isNew ? '/api/v2/produtos' : `/api/v2/produtos/${data.id}`;
        const method = isNew ? 'POST' : 'PUT';
        try {
            const response = await apiFetch(url, {
                method,
                body: data
            });
            if (response.ok) {
                await this.load();
                return true;
            }
            const err = await response.json();
            alert('Erro: ' + (err.error || 'Falha ao salvar'));
        } catch (err) {
            console.error('Erro ao salvar:', err);
        }
        return false;
    },

    async delete(id) {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return;
        try {
            const response = await apiFetch(`/api/v2/produtos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                await this.load();
            }
        } catch (err) {
            console.error('Erro ao excluir:', err);
        }
    },

    edit(id) {
        const p = this.produtos.find(prod => prod.id === id);
        if (p) this.openModal(p);
    },

    updateCozinhasSelect() {
        const select = document.getElementById('select-cozinha-v3');
        if (!select) return;

        // Se o CozinhaVinculoManager ja tiver carregado, popular
        if (typeof CozinhaVinculoManager !== 'undefined' && CozinhaVinculoManager.cozinhas) {
            select.innerHTML = '<option value="">Cozinha principal</option>';
            CozinhaVinculoManager.cozinhas.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nome;
                select.appendChild(opt);
            });
        }
    }
};

window.ProdutosManager = ProdutosManager;
