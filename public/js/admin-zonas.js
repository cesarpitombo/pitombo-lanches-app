// ═══════════════════════════════════════════════════════════════
// PITOMBO — Zonas de Entrega CRUD + Configurações de Entrega
// ═══════════════════════════════════════════════════════════════

async function carregarZonas() {
  const tbody = document.getElementById('listaZonas');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';

  const btnNova = document.getElementById('btnNovaZona');
  if (btnNova && !btnNova._zh) {
    btnNova._zh = true;
    btnNova.addEventListener('click', abrirFormZonaNova);
  }
  const btnCancelar = document.getElementById('btnCancelarZona');
  if (btnCancelar && !btnCancelar._zh) {
    btnCancelar._zh = true;
    btnCancelar.addEventListener('click', fecharFormZona);
  }
  const formZ = document.getElementById('formZona');
  if (formZ && !formZ._zh) {
    formZ._zh = true;
    formZ.addEventListener('submit', salvarZona);
  }

  try {
    const res = await fetch('/api/zonas');
    if (!res.ok) throw new Error('Falha');
    const zonas = await res.json();
    if (!zonas.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">Nenhuma zona cadastrada.</td></tr>';
      return;
    }
    tbody.innerHTML = zonas.map(z => `
      <tr>
        <td><strong>${z.nome}</strong></td>
        <td style="color:#555;font-size:.9rem">${z.descricao || '—'}</td>
        <td><strong style="color:#e8420a">${window.formatCurrency(z.taxa)}</strong></td>
        <td>
          <span style="background:${z.ativo ? '#e8f5e9' : '#fce4ec'};color:${z.ativo ? '#2e7d32' : '#c62828'};padding:.2rem .6rem;border-radius:12px;font-weight:700;font-size:.85rem">
            ${z.ativo ? '✅ Ativa' : '⛔ Inativa'}
          </span>
        </td>
        <td style="display:flex;gap:.4rem">
          <button onclick="editarZona(${z.id},'${z.nome.replace(/'/g, "\\'")}','${(z.descricao||'').replace(/'/g, "\\'")}',${z.taxa},${z.ativo})"
            style="background:#0d47a1;color:#fff;border:none;padding:.4rem .7rem;border-radius:5px;cursor:pointer;font-weight:700">✏️</button>
          <button onclick="excluirZona(${z.id})"
            style="background:#dc3545;color:#fff;border:none;padding:.4rem .7rem;border-radius:5px;cursor:pointer;font-weight:700">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading" style="color:red">Erro ao carregar zonas.</td></tr>';
  }
}

function abrirFormZonaNova() {
  document.getElementById('zonaFormTitle').textContent = 'Nova Zona';
  document.getElementById('zonaId').value = '';
  ['zonaInputNome','zonaInputTaxa','zonaInputDesc'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('zonaInputAtivo').checked = true;
  document.getElementById('zonaStatusMsg').textContent = '';
  document.getElementById('zonaFormBox').style.display = 'block';
  document.getElementById('zonaFormBox').scrollIntoView({ behavior: 'smooth' });
}

function fecharFormZona() {
  document.getElementById('zonaFormBox').style.display = 'none';
}

window.editarZona = function(id, nome, desc, taxa, ativo) {
  document.getElementById('zonaFormTitle').textContent = 'Editar Zona';
  document.getElementById('zonaId').value = id;
  document.getElementById('zonaInputNome').value = nome;
  document.getElementById('zonaInputTaxa').value = taxa;
  document.getElementById('zonaInputDesc').value = desc;
  document.getElementById('zonaInputAtivo').checked = !!ativo;
  document.getElementById('zonaStatusMsg').textContent = '';
  const box = document.getElementById('zonaFormBox');
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth' });
};

async function salvarZona(e) {
  e.preventDefault();
  const id = document.getElementById('zonaId').value;
  const payload = {
    nome: document.getElementById('zonaInputNome').value.trim(),
    descricao: document.getElementById('zonaInputDesc').value.trim(),
    taxa: parseFloat(document.getElementById('zonaInputTaxa').value) || 0,
    ativo: document.getElementById('zonaInputAtivo').checked
  };
  const msg = document.getElementById('zonaStatusMsg');
  msg.style.color = '#555'; msg.textContent = 'Salvando...';
  try {
    const res = await fetch(id ? `/api/zonas/${id}` : '/api/zonas', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      msg.style.color = 'green';
      msg.textContent = id ? '✅ Zona atualizada!' : '✅ Zona criada!';
      setTimeout(() => { fecharFormZona(); carregarZonas(); }, 800);
    } else {
      const err = await res.json();
      msg.style.color = 'red'; msg.textContent = '❌ ' + err.error;
    }
  } catch(err) { msg.style.color = 'red'; msg.textContent = '❌ Falha de rede.'; }
}

window.excluirZona = async function(id) {
  if (!confirm('Excluir esta zona de entrega?')) return;
  try {
    const r = await fetch(`/api/zonas/${id}`, { method: 'DELETE' });
    if (r.ok) carregarZonas(); else alert('Erro ao excluir zona.');
  } catch(e) { alert('Falha de rede.'); }
};
