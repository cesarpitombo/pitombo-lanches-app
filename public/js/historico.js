let allPedidos = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('filter-periodo').addEventListener('change', handlePeriodoChange);
  document.querySelectorAll('.filters-bar input, .filters-bar select').forEach(el => {
    el.addEventListener('input', renderDados);
    el.addEventListener('change', renderDados);
  });
  
  await fetchPedidos();
});

function handlePeriodoChange(e) {
  const customBlock = document.getElementById('filter-custom-dates');
  if (e.target.value === 'custom') {
    customBlock.style.display = 'flex';
  } else {
    customBlock.style.display = 'none';
  }
}

async function fetchPedidos() {
  try {
    const res = await fetch('/api/pedidos');
    allPedidos = await res.json();
    renderDados();
  } catch (err) {
    console.error(err);
    alert('Erro ao buscar histórico do banco de dados.');
  }
}

function filtrarPedidos() {
  const periodo = document.getElementById('filter-periodo').value;
  const dataIni = document.getElementById('filter-data-inicio').value;
  const dataFim = document.getElementById('filter-data-fim').value;
  const fStatus = document.getElementById('filter-status').value;
  const fPag = document.getElementById('filter-pagamento').value;
  const fBusca = document.getElementById('filter-busca').value.toLowerCase();

  const hoje = new Date();
  const hojeStr = hoje.toDateString();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toDateString();
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  return allPedidos.filter(p => {
    const dataObj = new Date(p.criado_em);
    
    // Período
    if (periodo === 'hoje' && dataObj.toDateString() !== hojeStr) return false;
    if (periodo === 'ontem' && dataObj.toDateString() !== ontemStr) return false;
    if (periodo === '7dias' && dataObj < seteDiasAtras) return false;
    if (periodo === 'custom' && dataIni && dataFim) {
      const dI = new Date(dataIni); dI.setHours(0,0,0,0);
      const dF = new Date(dataFim); dF.setHours(23,59,59,999);
      if (dataObj < dI || dataObj > dF) return false;
    }

    // Status / Pagamento
    if (fStatus && p.status !== fStatus) return false;
    if (fPag && p.payment_method !== fPag) return false;

    // Busca (Nome, Telefone ou ID)
    if (fBusca) {
      const idMatch = p.id.toString().includes(fBusca);
      const nameMatch = p.cliente && p.cliente.toLowerCase().includes(fBusca);
      const telMatch = p.telefone && p.telefone.includes(fBusca);
      if (!idMatch && !nameMatch && !telMatch) {
        return false;
      }
    }

    return true;
  });
}

function renderDados() {
  const pedidos = filtrarPedidos();
  
  // Resumo Financeiro
  const entregues = pedidos.filter(p => p.status === 'entregue');
  const faturamento = entregues.reduce((acc, p) => acc + Number(p.total), 0);
  
  const fatDinheiro = entregues.filter(p => p.payment_method === 'dinheiro').reduce((acc, p) => acc + Number(p.total), 0);
  const fatCartao = entregues.filter(p => p.payment_method === 'cartao').reduce((acc, p) => acc + Number(p.total), 0);
  const fatPix = entregues.filter(p => p.payment_method === 'mbway/pix').reduce((acc, p) => acc + Number(p.total), 0);

  document.getElementById('kpi-faturamento').textContent = `R$ ${faturamento.toFixed(2).replace('.',',')}`;
  document.getElementById('kpi-faturamento-sub').textContent = `Din: R$${fatDinheiro.toFixed(0)} | PIX: R$${fatPix.toFixed(0)} | Cart: R$${fatCartao.toFixed(0)}`;
  
  document.getElementById('kpi-entregues').textContent = entregues.length;
  const ticket = entregues.length ? (faturamento / entregues.length) : 0;
  document.getElementById('kpi-ticket').textContent = `Ticket Médio: R$ ${ticket.toFixed(2).replace('.',',')}`;

  // Resumo Operacional
  const cancelados = pedidos.filter(p => p.status === 'cancelado').length;
  let atrasadosCont = 0;
  let somaTempoMinutos = 0;
  let comTempoCount = 0;
  
  entregues.forEach(p => {
    // Calculando SLA: se não houver atualizado_em seguro, simulamos para relatórios. Idealmente o backend envia a hora final real.
    // Pelo index.js e checkout, criamos sem atualizado_em explicito, mas o banco costuma gerar.
    // Usaremos atualizado_em se for maior que criado_em, ou fallback seguro.
    const criado = new Date(p.criado_em);
    const atualizado = p.atualizado_em ? new Date(p.atualizado_em) : criado;
    const diffMin = Math.floor((atualizado - criado) / 60000);
    
    if (diffMin > 0) {
      somaTempoMinutos += diffMin;
      comTempoCount++;
      if (diffMin >= 20) atrasadosCont++;
    }
  });
  
  // Como fallback para o app atual, se banco não salvar atualizado_em, verificamos atrasos pelo criador ativo
  pedidos.filter(p => !['entregue','cancelado'].includes(p.status)).forEach(p => {
    if (Math.floor((new Date() - new Date(p.criado_em))/60000) >= 20) {
      atrasadosCont++;
    }
  });

  document.getElementById('kpi-problemas').textContent = `${cancelados} / ${atrasadosCont}`;
  const mediaTempo = comTempoCount > 0 ? Math.floor(somaTempoMinutos / comTempoCount) : 0;
  document.getElementById('kpi-tempo').textContent = `${mediaTempo} min`;

  // Tabela
  const tbody = document.querySelector('#tabela-historico tbody');
  if (pedidos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">Nenhuma informação foi encontrada nessa busca.</td></tr>';
    return;
  }

  tbody.innerHTML = pedidos.map(p => {
    const dataStr = new Date(p.criado_em).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    const corBg = p.status === 'entregue' ? '#d1e7dd' : (p.status === 'cancelado' ? '#f8d7da' : '#fff3cd');
    const corTx = p.status === 'entregue' ? '#0f5132' : (p.status === 'cancelado' ? '#842029' : '#664d03');
    const pgNm = p.payment_method ? (p.payment_method === 'mbway/pix' ? 'PIX' : p.payment_method.toUpperCase()) : 'N/A';
    
    // SLA Tabela
    let slaLabel = '-';
    if (p.status === 'entregue' && p.atualizado_em) {
       const m = Math.floor((new Date(p.atualizado_em) - new Date(p.criado_em))/60000);
       slaLabel = m > 0 ? `${m} min` : '-';
    } else if (!['entregue','cancelado'].includes(p.status)) {
       const m = Math.floor((new Date() - new Date(p.criado_em))/60000);
       slaLabel = `<span style="color:${m>=20?'red':'inherit'}">${m} min (Ativo)</span>`;
    }

    return `
      <tr>
        <td><strong>#${p.id}</strong></td>
        <td>${dataStr}</td>
        <td><strong>${p.cliente}</strong><br><small>${p.telefone}</small></td>
        <td style="font-size:0.8rem; color:#555">${p.itens.map(i => `${i.quantidade}x ${i.nome_produto}`).join('<br>')}</td>
        <td style="font-weight:bold; color:var(--primary)">R$ ${Number(p.total).toFixed(2).replace('.',',')}</td>
        <td>${pgNm}</td>
        <td><span class="status-badge" style="background:${corBg}; color:${corTx}">${p.status.toUpperCase()}</span></td>
        <td><strong>${slaLabel}</strong></td>
      </tr>
    `;
  }).join('');
}

function exportarCSV() {
  const pedidos = filtrarPedidos();
  if (!pedidos.length) return alert('Realize uma busca válida antes de exportar dados.');
  
  let csv = 'ID,Data_Hora,Cliente,Celular,Total_BRL,Metodo_Pagto,Status_Sistema,Tempo_SLA_min\n';
  pedidos.forEach(p => {
    const dataStr = new Date(p.criado_em).toLocaleString('pt-BR');
    let diffMin = 0;
    if (p.atualizado_em) {
        diffMin = Math.floor((new Date(p.atualizado_em) - new Date(p.criado_em))/60000);
    } else {
        diffMin = Math.floor((new Date() - new Date(p.criado_em))/60000);
    }
    const pgNm = (p.payment_method || 'N/A').toUpperCase();
    
    // Escape csv
    let cliente = p.cliente ? p.cliente.replace(/,/g, '') : '';
    let celular = p.telefone ? p.telefone.replace(/,| /g, '') : '';
    
    csv += `${p.id},"${dataStr}","${cliente}",${celular},${p.total},${pgNm},${p.status.toUpperCase()},${diffMin}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `pitombo_vendas_${new Date().getTime()}.csv`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
