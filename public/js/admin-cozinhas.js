/**
 * PITOMBO - Gestão de Cozinhas
 * Controle de múltiplas áreas de produção.
 */

let cozinhasAtivas = [];
let cozinhaIdSelecionada = null;
let autoUpdateInterval = null;

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    // Escutar mudança de aba no admin principal
    // (A carga real agora é feita via gatilho no admin.js para evitar overhead involuntário)
});

window.carregarCozinhas = async function() {
    console.log('👨‍🍳 Buscando cozinhas...');
    try {
        const res = await apiFetch('/api/cozinhas');
        if (!res.ok) throw new Error('Falha ao carregar cozinhas');
        
        cozinhasAtivas = await res.json();
        
        // Se nenhuma selecionada, pega a principal
        if (!cozinhaIdSelecionada && cozinhasAtivas.length > 0) {
            const principal = cozinhasAtivas.find(c => c.is_principal);
            cozinhaIdSelecionada = principal ? principal.id : cozinhasAtivas[0].id;
        }
        
        renderizarAbasCozinha();
        renderizarListaConfiguracao();
        aplicarLogicaAutoUpdate();
        
        // Carregar pedidos da cozinha (Placeholder por enquanto, pois depende do roteamento real de pedidos)
        window.filtrarPedidosCozinha();
        
    } catch (err) {
        console.error('Erro:', err);
    }
};

function renderizarAbasCozinha() {
    const container = document.getElementById('cozinhas-tabs-container');
    if (!container) return;
    
    container.innerHTML = cozinhasAtivas.map(c => `
        <div class="cozinha-tab ${cozinhaIdSelecionada == c.id ? 'active' : ''}" onclick="window.selecionarCozinha(${c.id})">
            ${c.nome} ${c.is_principal ? '<span style="font-size:0.7rem; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">Padrão</span>' : ''}
        </div>
    `).join('') + `
        <div class="cozinha-tab" onclick="window.abrirPromptCozinha()" style="border-style:dashed; color:#007bff; border-color:#007bff;">
            + Nova cozinha
        </div>
    `;
}

window.selecionarCozinha = function(id) {
    cozinhaIdSelecionada = id;
    renderizarAbasCozinha();
    window.filtrarPedidosCozinha();
    aplicarLogicaAutoUpdate();
};

window.filtrarPedidosCozinha = async function() {
    const grid = document.getElementById('pedidos-cozinha-grid');
    if (!grid) return;

    try {
        const res = await apiFetch('/api/pedidos');
        if (!res.ok) throw new Error('Falha ao buscar pedidos');
        const pedidos = await res.json();

        const emPreparo = pedidos.filter(p => p.status === 'em_preparo');

        if (emPreparo.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:5rem 2rem; background:#f9f9f9; border-radius:12px; border:2px dashed #ddd;">
                   <div style="font-size:3rem; margin-bottom:1rem;">🍳</div>
                   <h3 style="color:#888; margin:0;">Nenhum pedido em preparação nesta cozinha.</h3>
                   <p style="color:#aaa; font-size:0.9rem; margin-top:0.5rem;">Pedidos com status "Em preparação" aparecerão aqui.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = emPreparo.map(p => {
            const timeStr = new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const diffMin = Math.floor((new Date() - new Date(p.criado_em)) / 60000);
            const isAtrasado = diffMin >= 20;
            let itensHtml = (p.itens || []).map(i => `<li>${i.quantidade}x ${i.nome_produto}</li>`).join('');
            return `
                <div style="background:#fff; border-radius:10px; padding:1rem 1.2rem; border-left:4px solid #ff9800; box-shadow:0 2px 8px rgba(0,0,0,0.07);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                        <strong style="font-size:1.1rem;">#${p.id} — ${p.cliente}</strong>
                        <span style="font-size:0.8rem; color:${isAtrasado ? '#dc3545' : '#888'}; font-weight:${isAtrasado ? '700' : '400'}">
                            ${timeStr} (${diffMin} min${isAtrasado ? ' ⚠️' : ''})
                        </span>
                    </div>
                    <ul style="margin:0; padding-left:1.2rem; color:#444; font-size:0.9rem;">${itensHtml}</ul>
                    ${p.observacoes ? `<div style="margin-top:0.5rem; color:#e8420a; font-size:0.85rem;">⚠️ ${p.observacoes}</div>` : ''}
                    <div style="margin-top:1rem; border-top:1px solid #eee; pt:0.8rem; display:flex; justify-content:flex-end;">
                        <button onclick="window.alterarStatus(${p.id}, 'pronto')" style="background:#4caf50; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.8rem;">
                           ✅ Marcar como Pronto
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Erro ao carregar pedidos da cozinha:', err);
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#dc3545;">Erro ao carregar pedidos.</div>`;
    }
};

// MODAL CONFIGS
window.abrirModalConfigCozinhas = function() {
    document.getElementById('modalConfigCozinhas').style.display = 'flex';
    renderizarListaConfiguracao();
};

window.fecharModalConfigCozinhas = function() {
    document.getElementById('modalConfigCozinhas').style.display = 'none';
};

function renderizarListaConfiguracao() {
    const container = document.getElementById('lista-gerenciamento-cozinhas');
    if (!container) return;
    
    // Pegar config da cozinha selecionada para o switch global
    const atual = cozinhasAtivas.find(c => c.id == cozinhaIdSelecionada);
    if (atual) {
        document.getElementById('switchAutoUpdateCozinha').checked = atual.config_auto_update;
        document.getElementById('labelAutoUpdateCozinha').innerText = atual.config_auto_update ? 'Ativado' : 'Desativado';
        document.getElementById('labelAutoUpdateCozinha').style.background = atual.config_auto_update ? '#e8f5e9' : '#ffebee';
        document.getElementById('labelAutoUpdateCozinha').style.color = atual.config_auto_update ? '#2e7d32' : '#c62828';
    }

    container.innerHTML = cozinhasAtivas.map(c => `
        <div class="cozinha-config-item">
            <div>
                <span style="font-size:0.75rem; color:#888; font-weight:800; text-transform:uppercase;">Cozinha</span>
                <div style="font-weight:900; color:#111; font-size:1rem;">${c.nome}</div>
                <div style="font-size:0.8rem; color:#666;">
                    ${c.is_principal ? 'Recebe por padrão: Todos os produtos' : 'Personalizada'}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <button onclick="window.renomearCozinha(${c.id}, '${c.nome}')" style="background:#f1f1f1; border:none; padding:8px; border-radius:6px; cursor:pointer;" title="Renomear">✏️</button>
                ${!c.is_principal ? `<button onclick="window.excluirCozinha(${c.id})" style="background:#fff1f0; color:#cf1322; border:none; padding:8px; border-radius:6px; cursor:pointer;" title="Excluir">🗑️</button>` : ''}
            </div>
        </div>
    `).join('');
}

window.toggleAutoUpdateCozinha = async function() {
    const check = document.getElementById('switchAutoUpdateCozinha').checked;
    try {
        await apiFetch(`/api/cozinhas/${cozinhaIdSelecionada}`, {
            method: 'PUT',
            body: { config_auto_update: check }
        });
        window.carregarCozinhas();
    } catch (err) { alert('Erro ao salvar configuração'); }
};

window.abrirPromptCozinha = async function() {
    const nome = prompt('Nome da nova cozinha:');
    if (!nome) return;
    
    try {
        await apiFetch('/api/cozinhas', {
            method: 'POST',
            body: { nome }
        });
        window.carregarCozinhas();
    } catch (err) { alert('Erro ao criar cozinha'); }
};

window.renomearCozinha = async function(id, nomeAtual) {
    const novoNome = prompt('Novo nome para a cozinha:', nomeAtual);
    if (!novoNome || novoNome === nomeAtual) return;
    
    try {
        await apiFetch(`/api/cozinhas/${id}`, {
            method: 'PUT',
            body: { nome: novoNome }
        });
        window.carregarCozinhas();
    } catch (err) { alert('Erro ao renomear cozinha'); }
};

window.excluirCozinha = async function(id) {
    if (!confirm('Deseja realmente excluir esta cozinha?')) return;
    
    try {
        const res = await apiFetch(`/api/cozinhas/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao excluir');
        }
        cozinhaIdSelecionada = null; // Reset selection
        window.carregarCozinhas();
    } catch (err) { alert(err.message); }
};

function aplicarLogicaAutoUpdate() {
    if (autoUpdateInterval) clearInterval(autoUpdateInterval);
    
    const atual = cozinhasAtivas.find(c => c.id == cozinhaIdSelecionada);
    if (atual && atual.config_auto_update) {
        autoUpdateInterval = setInterval(() => {
            console.log('🔄 Auto-update ativo para cozinha', cozinhaIdSelecionada);
            window.carregarCozinhas();
        }, 30000); // 30 segundos
    }
}
