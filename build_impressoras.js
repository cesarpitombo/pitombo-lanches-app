const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
let html = fs.readFileSync(adminHtmlPath, 'utf8');

const impressorasHTML = `
    <!-- INÍCIO ABA IMPRESSORAS TÉRMICAS REFATORADA -->
    <section id="cfg-impressoras" class="tab-content">
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🖨️ Impressoras e Tickets</h2>
        <div style="display:flex; gap:0.5rem;">
           <button onclick="descobrirImpressorasOS()" style="background:#e3f2fd; color:#1565c0; border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer;">🔍 Auto-procurar (OS)</button>
           <button onclick="abrirModalNovaImpressora()" style="background:#16a34a; color:#fff; border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer;">+ Adicionar Manual</button>
           <button onclick="carregarImpressoras()" style="background:#f3f4f6; color:#374151; border:1px solid #d1d5db; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer;">🔄 Atualizar</button>
        </div>
      </div>
      
      <p style="color:#666; font-size:0.9rem; margin-bottom:1.5rem;">
        Gerencie impressoras térmicas ESC/POS conectadas na sua rede local IP (ex: 192.168.x.x) ou fixadas na USB pelo Windows Spooler.
      </p>

      <div id="grid-impressoras" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:1.5rem;">
         <div style="text-align:center; padding:3rem; color:#888; grid-column:1/-1;">Carregando frota de impressão...</div>
      </div>

      <!-- MODAL ADICIONAR/EDITAR IMPRESSORA -->
      <div id="modalImpressora" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
         <div style="background:#fff; border-radius:12px; padding:2rem; width:450px; max-width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <h3 id="modalImpressoraTitulo" style="margin-top:0; color:#111;">Nova Impressora</h3>
            <form id="formImpressora" style="display:flex; flex-direction:column; gap:1rem;">
               <input type="hidden" id="imp_id">
               
               <div>
                  <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Nome Amigável (Mapeamento)</label>
                  <input type="text" id="imp_nome" placeholder="Cozinha Esquerda / BemeTech USB" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" required>
                  <small style="color:#888; font-size:0.75rem;">Se local, coloque O MESMO NOME da Fila do Windows.</small>
               </div>
               
               <div style="display:flex; gap:1rem;">
                   <div style="flex:1;">
                      <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Conexão</label>
                      <select id="imp_tipo" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                         <option value="rede">Rede (IP Local / TCP)</option>
                         <option value="windows">USB (Windows Spooler)</option>
                      </select>
                   </div>
                   <div style="flex:1;">
                      <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Porta/LPT</label>
                      <input type="number" id="imp_porta" value="9100" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;" required>
                   </div>
               </div>
               
               <div>
                  <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Endereço IP (Somente se for de Rede)</label>
                  <input type="text" id="imp_ip" placeholder="192.168.0.100" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
               </div>

               <div style="display:flex; gap:1rem;">
                   <div style="flex:1;">
                      <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Setor</label>
                      <select id="imp_setor" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                         <option value="geral">Geral (Tudo)</option>
                         <option value="cozinha">Cozinha / Produção</option>
                         <option value="balcao">Balcão / Caixa</option>
                         <option value="cliente">Ticket do Cliente</option>
                      </select>
                   </div>
                   <div style="flex:1;">
                      <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:0.3rem;">Papel (Bobina)</label>
                      <select id="imp_papel" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                         <option value="80">80mm (Grande)</option>
                         <option value="58">58mm (Pequena)</option>
                      </select>
                   </div>
               </div>

               <div style="display:flex; gap:1rem; align-items:center; margin-top:0.5rem; background:#f9f9f9; padding:10px; border-radius:8px; border:1px dashed #ccc;">
                   <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:bold;">
                      <input type="checkbox" id="imp_ativa" checked> Ativa e Pronta
                   </label>
                   <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:bold;">
                      <input type="checkbox" id="imp_padrao"> Marcar como Padrão
                   </label>
               </div>

               <div style="display:flex; gap:1rem; margin-top:1rem;">
                  <button type="button" onclick="document.getElementById('modalImpressora').style.display='none'" style="flex:1; padding:12px; border-radius:8px; border:1px solid #ccc; background:#fff; font-weight:bold; cursor:pointer;">Cancelar</button>
                  <button type="submit" style="flex:1; padding:12px; border-radius:8px; border:none; background:#111; color:#fff; font-weight:bold; cursor:pointer;">Salvar Máquina</button>
               </div>
            </form>
         </div>
      </div>
    </section>
    <!-- FIM ABA IMPRESSORAS -->
`;

// Remove ALL existing `<section id="cfg-impressoras"...</section>` to avoid duplicates
html = html.replace(/<section id="cfg-impressoras"[\s\S]*?<\/section>/g, '');

// Insert new section right before the script tags at the bottom, or near `cfg-integracoes`
if (html.includes('<section id="cfg-integracoes"')) {
    html = html.replace('<section id="cfg-integracoes"', impressorasHTML + '\\n    <section id="cfg-integracoes"');
} else {
    // fallback
    html = html.replace('</body>', impressorasHTML + '\\n</body>');
}

// Add script reference
if (!html.includes('admin-impressoras.js')) {
    html = html.replace('</body>', '  <script src="/js/admin-impressoras.js"></script>\\n</body>');
}

fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('HTML Injetado');

const jsPath = path.join(__dirname, 'public', 'js', 'admin-impressoras.js');
const scriptContent = `
/**
 * Pitombo Lanches - Gerenciador de Impressoras Térmicas
 * Desacoplado para facilitar escalar lógicas de driver e I/O
 */

window.carregarImpressoras = async function() {
    console.log('🔌 Carregando frota térmica do banco...');
    const container = document.getElementById('grid-impressoras');
    if(!container) return;

    container.innerHTML = '<div style="text-align:center; padding:3rem; color:#888; grid-column:1/-1;">Localizando máquinas cadastradas... 🔍</div>';

    try {
        const res = await fetch('/api/impressoras');
        if(!res.ok) throw new Error('Falha no Servidor Node');
        const data = await res.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = \`<div style="text-align:center; padding:3rem; background:#fff; border:2px dashed #ccc; border-radius:12px; grid-column:1/-1;">
                <h3 style="color:#555; margin-bottom:0.5rem;">Nenhuma Impressora Localizada</h3>
                <p style="color:#888; margin-bottom:1rem;">O sistema não possui máquinas térmicas registradas. Clique em Adicionar ou faça uma auto-busca no OS local.</p>
                <button onclick="descobrirImpressorasOS()" style="background:#1976d2; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer;">🔍 Varrer Windows (USB)</button>
            </div>\`;
            return;
        }

        container.innerHTML = data.map(imp => {
            const isOnline = imp.ultimo_status === 'online';
            const isError = imp.ultimo_status === 'erro';
            const isActive = imp.ativa;

            let badgeHtml = \`<span style="background:#9ca3af; color:#fff; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:bold;">NÃO TESTADA</span>\`;
            if(isOnline && isActive) badgeHtml = \`<span style="background:#16a34a; color:#fff; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:bold;">🟢 ONLINE</span>\`;
            else if(isError) badgeHtml = \`<span style="background:#dc2626; color:#fff; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:bold;">🔴 ERRO I/O</span>\`;
            else if(!isActive) badgeHtml = \`<span style="background:#f59e0b; color:#111; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:bold;">🟡 PAUSADA</span>\`;

            const iconType = imp.tipo_conexao === 'rede' ? '🌐' : '💻';
            const targetIp = imp.tipo_conexao === 'rede' ? \`\${imp.ip}:\${imp.porta}\` : 'USB/LPT';

            return \`
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:1.5rem; display:flex; flex-direction:column; position:relative; overflow:hidden;">
                \${imp.padrao ? '<div style="position:absolute; top:0; right:0; background:#fef08a; color:#854d0e; padding:4px 20px; font-size:0.7rem; font-weight:bold; border-bottom-left-radius:12px;">🏆 PADRÃO (Main)</div>' : ''}
                
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                    <div>
                        <h3 style="margin:0 0 0.3rem 0; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">\${iconType} \${imp.nome}</h3>
                        \${badgeHtml}
                    </div>
                </div>

                <div style="font-size:0.85rem; color:#4b5563; background:#f9fafb; padding:0.8rem; border-radius:8px; margin-bottom:1rem;">
                    <div style="margin-bottom:0.3rem;"><strong>Setor:</strong> \${imp.setor.toUpperCase()} - \${imp.papel_mm}mm</div>
                    <div style="margin-bottom:0.3rem;"><strong>Rota:</strong> \${targetIp}</div>
                    <div style="color:#9ca3af; font-size:0.75rem;">Sync: \${imp.ultima_verificacao ? new Date(imp.ultima_verificacao).toLocaleString() : 'Nunca'}</div>
                    \${imp.ultimo_erro ? \`<div style="margin-top:0.5rem; color:#dc2626; font-size:0.75rem;"><em>Erro: \${imp.ultimo_erro}</em></div>\` : ''}
                </div>

                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:auto;">
                    <button onclick="pingarConexao(\${imp.id})" style="background:#f3f4f6; color:#1f2937; border:1px solid #d1d5db; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer; flex:1;" title="Ping Porta TCP">📡 Ping</button>
                    <button onclick="testarImpressaoFisica(\${imp.id}, '\${imp.nome}')" style="background:#1976d2; color:#fff; border:none; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer; flex:1;" title="Enviar Ticket de Teste">🖨️ Testar</button>
                    <button onclick="removerImpressora(\${imp.id})" style="background:#fee2e2; color:#b91c1c; border:none; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;" title="Deletar Máquina">🗑️</button>
                    <button onclick="abrirModalNovaImpressora(\${imp.id}, '\${imp.nome}', '\${imp.ip}', \${imp.porta}, '\${imp.tipo_conexao}', '\${imp.setor}', \${imp.papel_mm}, \${imp.ativa}, \${imp.padrao})" style="background:#e5e7eb; color:#374151; border:none; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;" title="Editar Parâmetros">✏️</button>
                </div>
            </div>
            \`;
        }).join('');

    } catch(err) {
        console.error('Falha UX Impressoras:', err);
        container.innerHTML = \`<div style="color:red; background:#fee2e2; padding:1.5rem; border-radius:12px; grid-column:1/-1;">Erro Local: \${err.message}</div>\`;
    }
};

window.abrirModalNovaImpressora = function(id='', nome='', ip='', porta=9100, tipo='rede', setor='geral', papel=80, ativa=true, padrao=false) {
    document.getElementById('imp_id').value = id;
    document.getElementById('imp_nome').value = nome;
    document.getElementById('imp_ip').value = ip;
    document.getElementById('imp_porta').value = porta;
    document.getElementById('imp_tipo').value = tipo;
    document.getElementById('imp_setor').value = setor;
    document.getElementById('imp_papel').value = papel;
    document.getElementById('imp_ativa').checked = ativa;
    document.getElementById('imp_padrao').checked = padrao;

    document.getElementById('modalImpressoraTitulo').innerText = id ? 'Editar Impressora' : 'Adicionar Impressora';
    document.getElementById('modalImpressora').style.display = 'flex';
};

window.descobrirImpressorasOS = async function() {
    alert('Buscando dispositivos na fila local do sistema.\\nIsso acionará o driver do Windows (WMIC)...');
    try {
        const res = await fetch('/api/impressoras/descobrir', {method:'POST'});
        const data = await res.json();
        
        if(!data.ok) return alert('Autodiscovery OS: ' + data.error);
        
        if(!data.impressoras.length) return alert('Nenhuma impressora avulsa encontrada nas portas locais e filas do Spooler.');

        // Salvar as encontradas silenciosamente ou abrir modais?
        // Vamos auto-cadastrar se não existir e recarregar
        let added = 0;
        for (const imp of data.impressoras) {
            await fetch('/api/impressoras', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    nome: imp.nome,
                    ip: imp.nome, // Fila do OS
                    porta: 0,
                    tipo_conexao: 'windows',
                    setor: 'balcao',
                    padrao: false
                })
            });
            added++;
        }
        
        alert(\`\${added} impressoras fisicas do Sistema Operacional foram salvas via Spooler. Por favor, designe os setores!\`);
        carregarImpressoras();

    } catch(e) {
        alert('Erro no discover OS: ' + e.message);
    }
}

document.addEventListener('submit', async (e) => {
    if(e.target && e.target.id === 'formImpressora') {
        e.preventDefault();
        
        const id = document.getElementById('imp_id').value;
        const payload = {
            nome: document.getElementById('imp_nome').value,
            ip: document.getElementById('imp_ip').value || '127.0.0.1',
            porta: document.getElementById('imp_porta').value,
            tipo_conexao: document.getElementById('imp_tipo').value,
            setor: document.getElementById('imp_setor').value,
            papel_mm: document.getElementById('imp_papel').value,
            ativa: document.getElementById('imp_ativa').checked,
            padrao: document.getElementById('imp_padrao').checked
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? \`/api/impressoras/\${id}\` : '/api/impressoras';

        try {
            const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(!r.ok) throw new Error('Falha HTTP DB Impressoras');
            
            document.getElementById('modalImpressora').style.display = 'none';
            carregarImpressoras();
        } catch(err) {
            alert('Falha ao Salvar:\\n' + err.message);
        }
    }
});

window.pingarConexao = async function(id) {
    try {
        const r = await fetch(\`/api/impressoras/\${id}/testar-conexao\`, {method:'POST'});
        const data = await r.json();
        alert(\`PING: \${data.status.toUpperCase()}\\n\\n\${data.message}\`);
        carregarImpressoras();
    } catch(e) {
        alert('Falha de rota ao pingar porta:' + e.message);
    }
}

window.testarImpressaoFisica = async function(id, nome) {
    if(!confirm(\`Você ouvirá o barulho da guilhotina na máquina [\${nome}]. Podemos disparar a ordem LPT/TCP?\`)) return;
    try {
        const r = await fetch(\`/api/impressoras/\${id}/testar-impressao\`, {method:'POST'});
        const data = await r.json();
        alert(\`RESULTADO VIA HARDWARE:\\n\\n\${data.message}\`);
        carregarImpressoras();
    } catch(e) {
        alert('Falha CRÍTICA ao comandar OS Spooler/TCP:' + e.message);
    }
}

window.removerImpressora = async function(id) {
    if(!confirm('Deletar essa máquina dos bindings logísticos? O PDV não enxergará mais a porta.')) return;
    await fetch(\`/api/impressoras/\${id}\`, {method: 'DELETE'});
    carregarImpressoras();
}
`;

fs.writeFileSync(jsPath, scriptContent, 'utf8');
console.log('JS Injetado em ' + jsPath);
