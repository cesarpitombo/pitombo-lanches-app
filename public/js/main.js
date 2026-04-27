// Pitombo Lanches — Frontend JS Principal

document.addEventListener('DOMContentLoaded', () => {
  console.log('🍔 Pitombo Lanches — frontend iniciado');

  // ── Elementos da UI ─────────────────────────────────────────────
  const lista            = document.getElementById('produtosLista');
  const badge            = document.getElementById('carrinhoBadge');
  const btnCarrinho      = document.getElementById('btnCarrinho');
  const modal            = document.getElementById('modalCarrinho');
  const btnFechar        = document.getElementById('btnFecharModal');
  const carrinhoItens    = document.getElementById('carrinhoItens');
  const carrinhoTotal    = document.getElementById('carrinhoTotal');

  // ── Estado do carrinho ───────────────────────────────────────────
  // Cada item: { id, nome, preco, quantidade }
  const itens = JSON.parse(localStorage.getItem('pitombo_carrinho')) || [];
  
  function salvarCarrinho() {
    localStorage.setItem('pitombo_carrinho', JSON.stringify(itens));
    localStorage.setItem('pitombo_total', calcularTotal().toString());
  }

  // ── Funções do carrinho ──────────────────────────────────────────

  function adicionarAoCarrinho(produto) {
    const existente = itens.find(i => i.id === produto.id);
    if (existente) {
      existente.quantidade += 1;
    } else {
      itens.push({ ...produto, quantidade: 1 });
    }
    salvarCarrinho();
    atualizarBadge();
    renderizarCarrinho();
  }

  function removerDoCarrinho(id) {
    const idx = itens.findIndex(i => i.id === id);
    if (idx === -1) return;
    if (itens[idx].quantidade > 1) {
      itens[idx].quantidade -= 1;
    } else {
      itens.splice(idx, 1);
    }
    salvarCarrinho();
    atualizarBadge();
    renderizarCarrinho();
  }

  function calcularTotal() {
    return itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
  }

  function atualizarBadge() {
    const totalItens = itens.reduce((soma, i) => soma + i.quantidade, 0);
    if (badge) {
      badge.textContent = totalItens;
      badge.style.display = totalItens > 0 ? 'flex' : 'none';
    }
  }

  function renderizarCarrinho() {
    if (itens.length === 0) {
      carrinhoItens.innerHTML = '<p style="color:#aaa;text-align:center;padding:1rem">Seu carrinho está vazio.</p>';
      carrinhoTotal.textContent = window.formatCurrency(0);
      return;
    }

    carrinhoItens.innerHTML = itens.map(item => {
      const modsHtml = (item.modificadores && item.modificadores.length > 0)
        ? `<div style="font-size:0.75rem; color:#6b7280; margin-top:0.25rem;">
             ${item.modificadores.map(m => `+ ${m.nome}`).join('<br>')}
           </div>`
        : '';
        
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
        <div style="flex:1">
          <strong style="display:block;color:#111827;font-size:0.95rem;">${item.nome}</strong>
          <span style="color:#6b7280;font-size:0.85rem;">
            ${window.formatCurrency(item.preco)} × ${item.quantidade}
          </span>
          ${modsHtml}
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem">
          <span style="font-weight:700;color:#111827">${window.formatCurrency(item.preco * item.quantidade)}</span>
          <button
            onclick="window._remover('${item.id}')"
            style="background:#f3f4f6;border:none;border-radius:50%;width:32px;height:32px;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#4b5563;transition:all 0.2s"
            title="Remover">−</button>
        </div>
      </div>
    `}).join('');

    const total = calcularTotal();
    carrinhoTotal.textContent = `${window.formatCurrency(total)}`;
  }

  // Expõe remover para uso no onclick inline dentro do innerHTML
  window._remover = removerDoCarrinho;

  // ── Modal carrinho ────────────────────────────────────────────────
  if (btnCarrinho) {
    btnCarrinho.addEventListener('click', () => {
      renderizarCarrinho();
      modal.hidden = false;
    });
  }
  if (btnFechar) {
    btnFechar.addEventListener('click', () => { modal.hidden = true; });
  }

  // ── Carregar e renderizar produtos ────────────────────────────────
  // ... (categorias) ...
  let todasCategorias = [];
  let todosProdutos = [];

  async function carregarDados() {
    const gridCategorias = document.getElementById('categoriasGrid');
    const gridProdutos   = document.getElementById('produtosLista');
    const btnVoltar      = document.getElementById('btnVoltarCategorias');
    const titulo         = document.getElementById('cardapioTitulo');

    if (!gridCategorias || !gridProdutos) return;
    gridCategorias.innerHTML = '<div class="loading">Carregando categorias...</div>';

    try {
      // Carregar ambos em paralelo
      const [resCats, resProds] = await Promise.all([
        fetch('/api/categorias'),
        fetch('/api/produtos')
      ]);
      
      todasCategorias = await resCats.json();
      todosProdutos   = await resProds.json();

      renderizarCategorias();

      if (btnVoltar) {
        btnVoltar.onclick = () => {
          gridProdutos.style.display = 'none';
          gridCategorias.style.display = 'grid';
          btnVoltar.style.display = 'none';
          titulo.textContent = 'Cardápio';
        };
      }

    } catch (err) {
      gridCategorias.innerHTML = '<div class="loading">Erro ao carregar o cardápio.</div>';
    }
  }

  function renderizarCategorias() {
    const gridCategorias = document.getElementById('categoriasGrid');
    if (!gridCategorias) return;

    const categoriasComProdutos = todasCategorias.filter(cat => 
        todosProdutos.some(p => p.categoria_id === cat.id)
    );

    const produtosSemCategoria = todosProdutos.filter(p => !p.categoria_id);
    
    let html = categoriasComProdutos.map(cat => {
      const inicial = cat.nome.charAt(0).toUpperCase();
      const displayImg = cat.imagem_url
        ? `<img src="${cat.imagem_url}" alt="${cat.nome}">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--cor-primaria),var(--cor-secundaria,#ffb800));color:#fff;font-size:2rem;font-weight:900;">${inicial}</div>`;
      const count = todosProdutos.filter(p => p.categoria_id === cat.id).length;

      return `
        <div class="categoria-card" onclick="window._verCategoria(${cat.id}, '${cat.nome.replace(/'/g, "\\'")}')">
          <div class="categoria-card__img">${displayImg}</div>
          <div class="categoria-card__body">
            <h3 class="categoria-card__nome">${cat.nome}</h3>
            <p class="categoria-card__count">${count} ${count === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
      `;
    }).join('');

    if (produtosSemCategoria.length > 0) {
      const count = produtosSemCategoria.length;
      html += `
        <div class="categoria-card" onclick="window._verCategoria(null, 'Diversos')">
          <div class="categoria-card__img">
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--cor-primaria),var(--cor-secundaria,#ffb800));color:#fff;font-size:2rem;font-weight:900;">D</div>
          </div>
          <div class="categoria-card__body">
            <h3 class="categoria-card__nome">Diversos</h3>
            <p class="categoria-card__count">${count} ${count === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
      `;
    }

    gridCategorias.innerHTML = html || '<div class="loading">Nenhuma categoria encontrada.</div>';
  }

  window._verCategoria = (id, nome) => {
    const gridCategorias = document.getElementById('categoriasGrid');
    const gridProdutos   = document.getElementById('produtosLista');
    const btnVoltar      = document.getElementById('btnVoltarCategorias');
    const titulo         = document.getElementById('cardapioTitulo');

    gridCategorias.style.display = 'none';
    gridProdutos.style.display   = 'grid';
    if (btnVoltar) btnVoltar.style.display = 'block';
    titulo.textContent = nome;

    renderizarProdutosPorCategoria(id);
  };

  function renderizarProdutosPorCategoria(categoriaId) {
    const gridProdutos = document.getElementById('produtosLista');
    if (!gridProdutos) return;

    const filtrados = categoriaId 
        ? todosProdutos.filter(p => p.categoria_id === categoriaId)
        : todosProdutos.filter(p => !p.categoria_id);

    if (filtrados.length === 0) {
      gridProdutos.innerHTML = '<div class="loading">Nenhum produto nesta categoria.</div>';
      return;
    }

    gridProdutos.innerHTML = filtrados.map(p => {
      const esgotado = p.controlar_estoque && p.estoque_atual <= 0;
      const btnHtml = esgotado 
        ? `<button class="btn-adicionar" disabled style="background:#ccc;cursor:not-allowed;color:#666;font-weight:bold;">Esgotado</button>`
        : `<button class="btn-adicionar" data-id="${p.id}">+ Adicionar</button>`;

      return `
      <div class="produto-card" style="${esgotado ? 'opacity:0.6;' : ''}">
        ${p.imagem_url
          ? `<img class="produto-card__img" src="${p.imagem_url}" alt="${p.nome}" onerror="this.parentElement.innerHTML='<div class=\\"produto-card__img--placeholder\\">🍔</div>'">`
          : `<div class="produto-card__img--placeholder">🍔</div>`}
        <div class="produto-card__body">
          <p class="produto-card__nome">${p.nome}</p>
          <div class="produto-card__footer">
            <span class="produto-card__preco">${window.formatCurrency(p.preco)}</span>
            ${btnHtml}
          </div>
        </div>
      </div>
    `}).join('');
  }

  // ── Modificadores e Modal Produto ────────────────────────────────
  let produtoConfigurando = null;
  let modificadoresCarregados = [];
  const modalProd = document.getElementById('modalProduto');
  const btnFecharProd = document.getElementById('btnFecharModalProduto');
  const txtQtdProd = document.getElementById('txtQtdProd');
  
  if (btnFecharProd) btnFecharProd.onclick = () => { modalProd.hidden = true; };

  function atualizarPrecoModalProd() {
    if (!produtoConfigurando) return;
    const base = Number(produtoConfigurando.preco) || 0;
    let extras = 0;

    // Radio buttons (seleção única)
    document.querySelectorAll('.mod-radio:checked').forEach(el => {
      const precoStr = (el.dataset.preco || '').replace(',', '.');
      extras += parseFloat(precoStr) || 0;
    });

    // Checkboxes com quantidade (vários)
    document.querySelectorAll('.mod-checkbox:checked').forEach(el => {
      const precoStr = (el.dataset.preco || '').replace(',', '.');
      const preco = parseFloat(precoStr) || 0;
      const itemId = el.value;
      const qtdEl = document.getElementById(`mod-qtd-${itemId}`);
      const qtd = qtdEl ? (parseInt(qtdEl.textContent) || 1) : 1;
      extras += preco * qtd;
    });

    const qtd = Number(txtQtdProd.textContent) || 1;
    const total = (base + extras) * qtd;
    document.getElementById('modalProdutoPrecoTotal').textContent = window.formatCurrency(total);
  }

  lista.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-adicionar');
    if (!btn) return;
    
    const pId = Number(btn.dataset.id);
    const p = todosProdutos.find(x => x.id === pId);
    if (!p) return;

    produtoConfigurando = { ...p };
    
    document.getElementById('modalProdutoNome').textContent = p.nome;
    document.getElementById('modalProdutoDesc').textContent = p.descricao || '';
    txtQtdProd.textContent = '1';
    
    const imgEl = document.getElementById('modalProdutoImg');
    const fallback = document.getElementById('modalProdutoImgFallback');
    if (p.imagem_url) {
        imgEl.src = p.imagem_url; imgEl.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
    }

    const containerMods = document.getElementById('modificadoresContainers');
    containerMods.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Carregando modificadores...</div>';
    atualizarPrecoModalProd();
    modalProd.hidden = false;

     try {
        const res = await fetch(`/api/modificadores/produto/${p.id}`);
        modificadoresCarregados = await res.json();
        
        if (modificadoresCarregados.length === 0) {
            containerMods.innerHTML = '';
        } else {
            containerMods.innerHTML = modificadoresCarregados.map(cat => {
               if (cat.selecao_unica) {
                 // ── MODO RADIO (apenas um) ──────────────────────────
                 const itensHtml = cat.itens.map(item => `
                   <label class="mod-option-label">
                     <div style="display:flex; align-items:center;">
                       <input type="radio" name="mod_${cat.id}" class="mod-radio"
                         value="${item.id}" data-catid="${cat.id}"
                         data-nome="${item.nome.replace(/"/g,'&quot;')}"
                         data-preco="${item.preco}"
                         style="margin-right:0.75rem; transform:scale(1.2); accent-color:var(--cor-primaria,#e63946);">
                       <span style="color:#374151; font-weight:500;">${item.nome}</span>
                     </div>
                     <span style="color:#6b7280; font-size:0.9rem;">${item.preco > 0 ? '+ ' + window.formatCurrency(item.preco) : ''}</span>
                   </label>
                 `).join('');
                 const desc = `Escolha 1 opção${cat.obrigatorio ? ' <strong style="color:var(--cor-primaria,#e63946)">(Obrigatório)</strong>' : ''}`;
                 return `
                   <div class="mod-group" data-catid="${cat.id}">
                     <div class="mod-group-header">
                       <h3 class="mod-group-title">${cat.nome} ${cat.obrigatorio ? '<span style="color:red">*</span>' : ''}</h3>
                       <span class="mod-badge ${cat.obrigatorio ? 'mod-badge-required' : 'mod-badge-optional'}">${cat.obrigatorio ? 'Obrigatório' : 'Opcional'}</span>
                     </div>
                     <p class="mod-group-desc">${desc}</p>
                     <div class="mod-items-list">${itensHtml}</div>
                   </div>
                 `;
               } else {
                 // ── MODO CHECKBOX (vários) ──────────────────────────
                 const min = Number(cat.min_escolhas) || 0;
                 const max = Number(cat.max_escolhas) || 99;
                 const itensHtml = cat.itens.map(item => {
                   const maxItem = Number(item.quantidade_maxima) || 1;
                   return `
                     <div class="mod-option-checkbox-row" data-item-id="${item.id}" data-catid="${cat.id}">
                       <label class="mod-option-label" style="flex:1;">
                         <div style="display:flex; align-items:center;">
                           <input type="checkbox" class="mod-checkbox"
                             value="${item.id}" data-catid="${cat.id}"
                             data-nome="${item.nome.replace(/"/g,'&quot;')}"
                             data-preco="${item.preco}"
                             data-max-item="${maxItem}"
                             style="margin-right:0.75rem; transform:scale(1.2); accent-color:var(--cor-primaria,#e63946);">
                           <span style="color:#374151; font-weight:500;">${item.nome}</span>
                         </div>
                         <span style="color:#6b7280; font-size:0.9rem;">${item.preco > 0 ? '+ ' + window.formatCurrency(item.preco) : ''}</span>
                       </label>
                       ${maxItem > 1 ? `
                       <div class="mod-qty-control" id="mod-qty-ctrl-${item.id}" style="display:none; align-items:center; gap:0.4rem; margin-left:0.5rem;">
                         <button type="button" class="mod-qty-btn" onclick="window._modQty(${item.id}, -1, ${maxItem}, ${cat.id}, ${max})">−</button>
                         <span id="mod-qtd-${item.id}" style="min-width:20px; text-align:center; font-weight:700; font-size:0.9rem;">1</span>
                         <button type="button" class="mod-qty-btn" onclick="window._modQty(${item.id}, +1, ${maxItem}, ${cat.id}, ${max})">+</button>
                       </div>` : `<span id="mod-qtd-${item.id}" style="display:none;">1</span>`}
                     </div>
                   `;
                 }).join('');
                 let desc = '';
                 if (min > 0 && max > 1) desc = `Escolha de ${min} até ${max} opções <strong style="color:var(--cor-primaria,#e63946)">(mínimo: ${min})</strong>`;
                 else if (min > 0) desc = `Escolha pelo menos ${min} opçõe${min>1?'s':''} <strong style="color:var(--cor-primaria,#e63946)">(Obrigatório)</strong>`;
                 else if (max > 1) desc = `Escolha até ${max} opções`;
                 return `
                   <div class="mod-group" data-catid="${cat.id}" data-min="${min}" data-max="${max}">
                     <div class="mod-group-header">
                       <h3 class="mod-group-title">${cat.nome} ${cat.obrigatorio ? '<span style="color:red">*</span>' : ''}</h3>
                       <span class="mod-badge ${cat.obrigatorio ? 'mod-badge-required' : 'mod-badge-optional'}">${cat.obrigatorio ? 'Obrigatório' : 'Opcional'}</span>
                     </div>
                     <p class="mod-group-desc">${desc}</p>
                     <div id="mod-sel-count-${cat.id}" class="mod-sel-count" style="display:none"></div>
                     <div class="mod-items-list">${itensHtml}</div>
                   </div>
                 `;
               }
            }).join('');

            // ── Helpers de quantidade por item
            window._modQty = function(itemId, delta, maxItem, catId, catMax) {
              const qtdEl = document.getElementById(`mod-qtd-${itemId}`);
              if (!qtdEl) return;
              const current = parseInt(qtdEl.textContent) || 1;
              // Calcular total selecionado no grupo
              const totalGrupo = window._calcGrupoTotal(catId);
              let next = current + delta;
              if (next < 1) next = 1;
              if (next > maxItem) next = maxItem;
              if (delta > 0 && totalGrupo >= catMax) return; // bloquear se atingiu max do grupo
              qtdEl.textContent = next;
              window._updateGrupoCount(catId, catMax);
              atualizarPrecoModalProd();
            };

            window._calcGrupoTotal = function(catId) {
              let total = 0;
              document.querySelectorAll(`.mod-checkbox[data-catid="${catId}"]:checked`).forEach(cb => {
                const qtdEl = document.getElementById(`mod-qtd-${cb.value}`);
                total += qtdEl ? (parseInt(qtdEl.textContent) || 1) : 1;
              });
              return total;
            };

            window._updateGrupoCount = function(catId, max) {
              const total = window._calcGrupoTotal(catId);
              const countEl = document.getElementById(`mod-sel-count-${catId}`);
              if (countEl) {
                if (total > 0) {
                  countEl.style.display = '';
                  countEl.textContent = `${total} de ${max} selecionado${total>1?'s':''}`;
                  countEl.style.color = total >= max ? '#e63946' : '#6b7280';
                } else {
                  countEl.style.display = 'none';
                }
              }
              // Bloquear checkboxes quando limite de grupo atingido
              document.querySelectorAll(`.mod-checkbox[data-catid="${catId}"]`).forEach(cb => {
                if (!cb.checked) cb.disabled = total >= max;
              });
            };

            // ── Eventos de change nos checkboxes e radios
            containerMods.querySelectorAll('.mod-checkbox').forEach(inp => {
               inp.addEventListener('change', () => {
                 const catId = Number(inp.dataset.catid);
                 const cat = modificadoresCarregados.find(c => c.id === catId);
                 const max = cat ? (Number(cat.max_escolhas) || 99) : 99;
                 const itemId = inp.value;
                 const qtyCtrl = document.getElementById(`mod-qty-ctrl-${itemId}`);
                 // Mostrar/esconder controle de quantidade quando item tem max > 1
                 if (qtyCtrl) qtyCtrl.style.display = inp.checked ? 'flex' : 'none';
                 if (!inp.checked) {
                   const qtdEl = document.getElementById(`mod-qtd-${itemId}`);
                   if (qtdEl) qtdEl.textContent = '1';
                 }
                 window._updateGrupoCount(catId, max);
                 atualizarPrecoModalProd();
               });
            });

            containerMods.querySelectorAll('.mod-radio').forEach(inp => {
               inp.addEventListener('change', () => atualizarPrecoModalProd());
            });
        }
    } catch (err) {
        containerMods.innerHTML = '<div style="color:red; text-align:center; padding:1rem;">Erro ao carregar extras.</div>';
    }
  });

  document.getElementById('btnAddProd')?.addEventListener('click', () => {
      let q = Number(txtQtdProd.textContent);
      txtQtdProd.textContent = q + 1;
      atualizarPrecoModalProd();
  });
  document.getElementById('btnSubProd')?.addEventListener('click', () => {
      let q = Number(txtQtdProd.textContent);
      if (q > 1) {
          txtQtdProd.textContent = q - 1;
          atualizarPrecoModalProd();
      }
  });

  document.getElementById('btnConfirmarAddProduto')?.addEventListener('click', () => {
      if (!produtoConfigurando) return;
      
      let modificadoresEscolhidos = [];
      let validos = true;
      let extraTotal = 0;

      for (const cat of modificadoresCarregados) {
          if (cat.selecao_unica) {
            // ── Radio: verificar se algum está selecionado (se obrigatório)
            const sel = document.querySelector(`input.mod-radio[data-catid="${cat.id}"]:checked`);
            if (cat.obrigatorio && !sel) {
                alert(`Por favor, selecione uma opção em "${cat.nome}".`);
                validos = false; break;
            }
            if (sel) {
                const preco = Number(sel.dataset.preco) || 0;
                extraTotal += preco;
                modificadoresEscolhidos.push({ id: Number(sel.value), nome: sel.dataset.nome, preco, categoria: cat.nome });
            }
          } else {
            // ── Checkbox: verificar mínimo
            const min = Number(cat.min_escolhas) || 0;
            const max = Number(cat.max_escolhas) || 99;
            const checkeds = Array.from(document.querySelectorAll(`.mod-checkbox[data-catid="${cat.id}"]:checked`));
            const totalSelecionado = checkeds.reduce((s, cb) => {
                const qtdEl = document.getElementById(`mod-qtd-${cb.value}`);
                return s + (qtdEl ? parseInt(qtdEl.textContent) || 1 : 1);
            }, 0);

            if ((cat.obrigatorio || min > 0) && totalSelecionado < Math.max(min, cat.obrigatorio ? 1 : 0)) {
                const needed = Math.max(min, 1);
                alert(`"${cat.nome}" requer pelo menos ${needed} seleção${needed > 1 ? 'ões' : ''}.`);
                validos = false; break;
            }

            checkeds.forEach(cb => {
                const qtdEl = document.getElementById(`mod-qtd-${cb.value}`);
                const qtd = qtdEl ? (parseInt(qtdEl.textContent) || 1) : 1;
                const preco = Number(cb.dataset.preco) || 0;
                extraTotal += preco * qtd;
                // Adiciona uma entrada por unidade selecionada
                for (let i = 0; i < qtd; i++) {
                  modificadoresEscolhidos.push({ id: Number(cb.value), nome: cb.dataset.nome, preco, categoria: cat.nome });
                }
            });
          }
      }

      if (!validos) return;

      const qtd = Number(txtQtdProd.textContent) || 1;
      
      const strMods = modificadoresEscolhidos.map(m => m.id).sort().join(',');
      const cartId = modificadoresEscolhidos.length > 0 ? `${produtoConfigurando.id}_${strMods}` : produtoConfigurando.id;
      
      const itemToCart = {
          id: cartId,
          realId: produtoConfigurando.id,
          nome: produtoConfigurando.nome,
          preco: Number(produtoConfigurando.preco) + extraTotal,
          precoBase: Number(produtoConfigurando.preco),
          modificadores: modificadoresEscolhidos,
          quantidade: qtd
      };

      const existente = itens.find(i => i.id === itemToCart.id);
      if (existente) {
          existente.quantidade += itemToCart.quantidade;
      } else {
          itens.push(itemToCart);
      }

      salvarCarrinho();
      atualizarBadge();
      renderizarCarrinho();
      modalProd.hidden = true;
  });

  // ── Finalizar pedido ─────────────────────────────────────────────
  function finalizarPedido() {
    if (itens.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }
    
    salvarCarrinho();
    window.location.href = '/checkout';
  }

  const btnFinalizar = document.getElementById('btnFinalizarPedido');
  if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarPedido);

  atualizarBadge();
  carregarDados();

  // --- MODAL DE HORÁRIOS ---
  const DIAS_LABELS_PT = {
    segunda: 'Segunda-feira',
    terca: 'Terça-feira',
    quarta: 'Quarta-feira',
    quinta: 'Quinta-feira',
    sexta: 'Sexta-feira',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };

  window.openHoursModal = function(weeklyHours) {
    const modal = document.getElementById('modalHours');
    const body = document.getElementById('hoursModalBody');
    if (!modal || !body) return;

    const DIAS_ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
    
    // Identificar dia atual
    const now = new Date();
    const todayIdx = now.getDay(); 
    const todayKey = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][todayIdx];

    let html = '';
    DIAS_ORDEM.forEach(dia => {
      const intervals = weeklyHours[dia] || [];
      const isToday = dia === todayKey;
      
      html += `
        <div class="hours-row ${isToday ? 'hours-row--today' : ''}">
          <span class="hours-day">${DIAS_LABELS_PT[dia]}${isToday ? ' (Hoje)' : ''}</span>
          <div class="hours-time">
            ${intervals.length === 0 ? '<span class="closed-text">Fechado</span>' : 
              intervals.map(t => `<div>${t.open} — ${t.close}</div>`).join('')}
          </div>
        </div>
      `;
    });

    body.innerHTML = html;
    modal.hidden = false;
  };

});
