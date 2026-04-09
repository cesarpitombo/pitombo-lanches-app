/**
 * PITOMBO - Gestão de Clientes
 * Lógica para listagem, filtros, busca e CRUD de clientes.
 */

let filtroStatusAtual = 'Todos';
let todosClientes = [];

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    // Caso a aba já esteja aberta por algum motivo
    if (document.getElementById('cfg-clientes').classList.contains('active')) {
        carregarClientes();
    }
});

// Função principal de carregamento
window.carregarClientes = async function() {
    console.log('👥 Carregando base de clientes...');
    const container = document.getElementById('clientes-lista-container');
    if (!container) return;

    try {
        const res = await apiFetch('/api/clientes');
        if (!res.ok) throw new Error('Falha ao buscar clientes no servidor.');
        
        todosClientes = await res.json();
        atualizarTotalizadores();
        filtrarClientes();
    } catch (err) {
        console.error('Erro ao carregar clientes:', err);
        container.innerHTML = `<div style="grid-column:1/-1; color:#dc2626; text-align:center; padding:2rem;">Erro: ${err.message}</div>`;
    }
};

// Renderização dos cards
function renderizarClientes(data) {
    const container = document.getElementById('clientes-lista-container');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:4rem; color:#888; background:#fff; border-radius:12px; border:2px dashed #eee;">
            Nenhum cliente encontrado para os critérios selecionados.
        </div>`;
        return;
    }

    container.innerHTML = data.map(c => {
        const statusColor = getStatusColor(c.status_cliente);
        const formatTelefone = c.telefone.replace(/\D/g, '');
        
        return `
            <div class="cliente-card" style="background:#fff; border:1px solid #eee; border-radius:16px; padding:1.2rem; transition: transform 0.2s, box-shadow 0.2s; position:relative; display:flex; flex-direction:column; gap:0.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="display:flex; align-items:center; gap:0.8rem;">
                        <div style="width:45px; height:45px; background:#f0f0f0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; color:#888; font-size:1.2rem;">
                            ${c.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:#111; font-weight:800;">${c.nome}</h3>
                            <div style="display:flex; align-items:center; gap:0.4rem; color:#666; font-size:0.9rem; margin-top:2px;">
                                <span>📱 ${c.telefone}</span>
                            </div>
                        </div>
                    </div>
                    <div class="dropdown" style="position:relative;">
                        <button onclick="toggleDropdown(this)" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:1.2rem; padding:4px;">⋮</button>
                        <div class="dropdown-content" style="display:none; position:absolute; right:0; top:100%; background:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.1); border-radius:8px; z-index:10; min-width:150px; border:1px solid #eee;">
                            <button onclick="abrirModalCliente(${c.id}, '${c.nome}', '${c.telefone}', '${c.observacoes || ''}')" style="display:block; width:100%; padding:10px 15px; text-align:left; border:none; background:none; cursor:pointer; font-weight:600; font-size:0.85rem; color:#444;">✏️ Editar</button>
                            <button onclick="excluirCliente(${c.id})" style="display:block; width:100%; padding:10px 15px; text-align:left; border:none; background:none; cursor:pointer; font-weight:600; font-size:0.85rem; color:#dc2626;">🗑️ Excluir</button>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:0.6rem 1rem; border-radius:10px;">
                    <span style="font-size:0.8rem; font-weight:800; color:#888; text-transform:uppercase;">Status:</span>
                    <span style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:800; color:${statusColor.text};">
                        <span style="width:8px; height:8px; border-radius:50%; background:${statusColor.bg};"></span>
                        ${c.status_cliente}
                    </span>
                </div>

                <div style="font-size:0.8rem; color:#666;">
                    <span style="display:block;"><strong>Total Pedidos:</strong> ${c.total_pedidos || 0}</span>
                    <span style="display:block;"><strong>Gasto Total:</strong> ${window.formatCurrency(c.total_gasto || 0)}</span>
                </div>

                <div style="display:flex; gap:0.6rem; margin-top:auto;">
                    <button onclick="window.open('https://wa.me/55${formatTelefone}', '_blank')" 
                        style="flex:1; background:#25d366; color:#fff; border:none; padding:0.8rem; border-radius:10px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
                        <span style="font-size:1.1rem;">💬</span> WhatsApp
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Filtro de Busca e Chips
window.filtrarClientes = function() {
    const texto = document.getElementById('buscaCliente').value.toLowerCase();
    
    const filtrados = todosClientes.filter(c => {
        const matchesBusca = c.nome.toLowerCase().includes(texto) || c.telefone.includes(texto);
        const matchesStatus = filtroStatusAtual === 'Todos' || c.status_cliente === filtroStatusAtual;
        return matchesBusca && matchesStatus;
    });

    renderizarClientes(filtrados);
};

window.setFiltroStatus = function(status, el) {
    filtroStatusAtual = status;
    
    // Atualizar UI dos chips
    document.querySelectorAll('.clientes-filters .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    
    filtrarClientes();
};

// Modal Handlers
window.abrirModalCliente = function(id = '', nome = '', telefone = '', obs = '') {
    document.getElementById('clienteId').value = id;
    document.getElementById('clienteNome').value = nome;
    document.getElementById('clienteTelefone').value = telefone;
    document.getElementById('clienteObs').value = obs;
    
    document.getElementById('modalClienteTitulo').innerText = id ? 'Editar Cliente' : 'Novo Cliente';
    document.getElementById('btnSalvarCliente').innerText = id ? 'Atualizar' : 'Salvar';
    
    document.getElementById('modalCliente').style.display = 'flex';
};

window.fecharModalCliente = function() {
    document.getElementById('modalCliente').style.display = 'none';
    document.getElementById('formCliente').reset();
    document.getElementById('clienteId').value = '';
};

// CRUD - Salvar
window.salvarCliente = async function(event) {
    event.preventDefault();
    const id = document.getElementById('clienteId').value;
    const payload = {
        nome: document.getElementById('clienteNome').value,
        telefone: document.getElementById('clienteTelefone').value,
        observacoes: document.getElementById('clienteObs').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clientes/${id}` : '/api/clientes';

    try {
        const res = await apiFetch(url, {
            method,
            body: payload
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao processar cliente.');
        }

        fecharModalCliente();
        carregarClientes();
    } catch (err) {
        alert(err.message);
    }
};

// CRUD - Excluir
window.excluirCliente = async function(id) {
    if (!confirm('Deseja realmente excluir este cliente da base?')) return;

    try {
        const res = await apiFetch(`/api/clientes/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao excluir cliente.');
        carregarClientes();
    } catch (err) {
        alert(err.message);
    }
};

// Helper: Cores de Status
function getStatusColor(status) {
    switch (status) {
        case 'Comprador Elite': return { bg: '#8b5cf6', text: '#7c3aed' };
        case 'Melhor Comprador': return { bg: '#10b981', text: '#059669' };
        case 'Comprador Frequente': return { bg: '#3b82f6', text: '#2563eb' };
        case 'Em risco': return { bg: '#f59e0b', text: '#d97706' };
        case 'Inativo': return { bg: '#ef4444', text: '#dc2626' };
        default: return { bg: '#9ca3af', text: '#4b5563' };
    }
}

// Helper: Dropdown Toggle
window.toggleDropdown = function(btn) {
    const content = btn.nextElementSibling;
    const all = document.querySelectorAll('.dropdown-content');
    all.forEach(d => {
        if (d !== content) d.style.display = 'none';
    });
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
};

// Helper: Atualizar Contagem
function atualizarTotalizadores() {
    const countEl = document.getElementById('statusCount');
    if (!countEl) return;
    countEl.innerText = `Total na base: ${todosClientes.length} clientes`;
}

// Fechar dropdowns ao clicar fora
window.addEventListener('click', (e) => {
    if (!e.target.matches('button')) {
        document.querySelectorAll('.dropdown-content').forEach(d => d.style.display = 'none');
    }
});
