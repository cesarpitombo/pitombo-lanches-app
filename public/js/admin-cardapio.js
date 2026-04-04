document.addEventListener('DOMContentLoaded', () => {
  console.log('Admin Cardápio Module Initialized');

  // Submenu Toggles
  const btnToggleCardapio = document.getElementById('btnToggleCardapio');
  const submenuCardapio = document.getElementById('submenuCardapio');
  const cardapioArrow = document.getElementById('cardapioArrow');

  if (btnToggleCardapio && submenuCardapio) {
    btnToggleCardapio.addEventListener('click', () => {
      const isHidden = submenuCardapio.style.display === 'none';
      submenuCardapio.style.display = isHidden ? 'flex' : 'none';
      if (cardapioArrow) cardapioArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });
  }

  // Load and Render Settings for the new tabs
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target === 'cfg-boas-vindas') {
        carregarConfiguracoesBoasVindas();
      } else if (target === 'cfg-pedidos') {
        carregarConfiguracoesPedidos();
      }
    });
  });

  // Handle Form Boas Vindas
  const formBoasVindas = document.getElementById('formCfgBoasVindas');
  if (formBoasVindas) {
    formBoasVindas.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(formBoasVindas);
      const statusMsg = document.getElementById('cfgStatusMsgBoasVindas');
      
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          if (statusMsg) {
            statusMsg.textContent = '✅ Configurações de Boas-vindas salvas!';
            statusMsg.style.color = 'green';
            setTimeout(() => statusMsg.textContent = '', 3000);
          }
        } else {
          throw new Error('Falha ao salvar');
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.textContent = '❌ Erro ao salvar configurações.';
          statusMsg.style.color = 'red';
        }
      }
    });
  }

  // Handle Form Pedidos (Expanded)
  const formPedidos = document.getElementById('formCfgPedidos');
  if (formPedidos) {
    formPedidos.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(formPedidos);
      const statusMsg = document.getElementById('cfgStatusMsgPedidos');

      // Add checked state for checkboxes (since FormData doesn't include unchecked ones)
      const checkboxes = formPedidos.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        if (cb.name) {
          formData.set(cb.name, cb.checked);
        }
      });

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          statusMsg.textContent = '✅ Configurações de Pedidos salvas!';
          statusMsg.style.color = 'green';
          setTimeout(() => statusMsg.textContent = '', 3000);
        } else {
          throw new Error('Falha ao salvar');
        }
      } catch (err) {
        statusMsg.textContent = '❌ Erro ao salvar configurações.';
        statusMsg.style.color = 'red';
      }
    });
  }
});

async function carregarConfiguracoesBoasVindas() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    
    document.getElementById('cfgLandingAtivo').checked = data.landing_ativo;
    document.getElementById('cfgLandingTitulo').value = data.landing_titulo || '';
    document.getElementById('cfgLandingSubtitulo').value = data.landing_subtitulo || '';
    document.getElementById('cfgLandingTexto').value = data.landing_texto || '';
    document.getElementById('cfgLandingBotao').value = data.landing_botao_texto || 'Ver Cardápio';
  } catch (err) {
    console.error('Erro ao carregar boas-vindas:', err);
  }
}

async function carregarConfiguracoesPedidos() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    
    const form = document.getElementById('formCfgPedidos');
    if (!form) return;

    // Fill standard fields
    for (const key in data) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = !!data[key];
        } else if (input.type === 'radio') {
          const radio = form.querySelector(`[name="${key}"][value="${data[key]}"]`);
          if (radio) radio.checked = true;
        } else {
          input.value = data[key] || '';
        }
      }
    }

    // Special fields handled by ID if needed (though name should work)
    if (document.getElementById('cfgStatusLoja')) document.getElementById('cfgStatusLoja').value = data.status_loja || 'aberta';
    if (document.getElementById('cfgTempoPreparo')) document.getElementById('cfgTempoPreparo').value = data.tempo_preparo || '';
    if (document.getElementById('cfgPedidoMinimo')) document.getElementById('cfgPedidoMinimo').value = data.pedido_minimo || 0;
    if (document.getElementById('cfgMensagemAutomatica')) document.getElementById('cfgMensagemAutomatica').value = data.mensagem_automatica || '';

  } catch (err) {
    console.error('Erro ao carregar configurações de pedidos:', err);
  }
}
