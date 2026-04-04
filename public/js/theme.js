// public/js/theme.js
// Carrega as configurações globais da loja e aplica identidade visual

async function loadStoreBrand() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    
    const settings = await res.json();
    window.StoreSettings = settings;

    // 1. Atualizar Título e Favicon
    if (settings.public_display_name) {
      document.title = settings.public_display_name;
    }
    
    if (settings.favicon_url) {
      let iconLink = document.querySelector("link[rel~='icon']");
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = settings.favicon_url;
    }

    // 2. Injetar Variáveis CSS Globais
    const root = document.documentElement;
    if (settings.color_primary) root.style.setProperty('--primary', settings.color_primary);
    if (settings.color_secondary) root.style.setProperty('--secondary', settings.color_secondary);
    if (settings.color_accent) root.style.setProperty('--warning', settings.color_accent); // mapeia accent p/ warning atual
    if (settings.color_text) root.style.setProperty('--text', settings.color_text);
    if (settings.color_panel_bg) root.style.setProperty('--bg', settings.color_panel_bg);
    if (settings.color_card_bg) root.style.setProperty('--surface', settings.color_card_bg);
    // Para facilitar manutenção, injetamos também nomes padronizados novos:
    root.style.setProperty('--btn-main', settings.color_button_main || settings.color_primary);
    
    // Status colors
    if (settings.color_status_recebido) root.style.setProperty('--status-recebido', settings.color_status_recebido);
    if (settings.color_status_preparo) root.style.setProperty('--status-preparo', settings.color_status_preparo);
    if (settings.color_status_pronto) root.style.setProperty('--status-pronto', settings.color_status_pronto);
    if (settings.color_status_entrega) root.style.setProperty('--status-entrega', settings.color_status_entrega);
    if (settings.color_status_entregue) root.style.setProperty('--status-entregue', settings.color_status_entregue);
    if (settings.color_status_cancelado) root.style.setProperty('--status-cancelado', settings.color_status_cancelado);
    if (settings.color_status_atrasado) root.style.setProperty('--status-atrasado', settings.color_status_atrasado);

    // 3. Substituir Texto e Logo Dinamicamente no DOM
    const brandNames = document.querySelectorAll('[data-brand="name"]');
    brandNames.forEach(el => el.textContent = settings.store_name);

    const brandDisplayNames = document.querySelectorAll('[data-brand="display_name"]');
    brandDisplayNames.forEach(el => el.textContent = window.location.pathname.includes('/admin') ? settings.admin_display_name : settings.public_display_name);

    const brandLogos = document.querySelectorAll('img[data-brand="logo"]');
    if (settings.logo_url) {
      brandLogos.forEach(img => {
        img.src = settings.logo_url;
        img.style.display = 'block';
      });
    }

    const brandSubtitles = document.querySelectorAll('[data-brand="subtitle"]');
    brandSubtitles.forEach(el => el.textContent = settings.store_subtitle);

    const brandAddresses = document.querySelectorAll('[data-brand="address"]');
    if (brandAddresses.length > 0) {
      brandAddresses.forEach(el => el.textContent = settings.store_address || '');
    }

    const brandFooters = document.querySelectorAll('[data-brand="footer"]');
    brandFooters.forEach(el => el.textContent = settings.footer_text);
    
    const brandPhones = document.querySelectorAll('[data-brand="contact_whatsapp"]');
    if (brandPhones.length > 0) {
      const _waNum = (() => {
        if (settings.whatsapp_dial_code && settings.whatsapp_number)
          return settings.whatsapp_dial_code.replace(/\D/g,'') + settings.whatsapp_number.replace(/\D/g,'');
        const n = (settings.contact_whatsapp || '').replace(/\D/g,'');
        return n.startsWith('55') ? n : '55'+n;
      })();
      brandPhones.forEach(el => {
        if (el.tagName === 'A' && el.href.includes('wa.me')) {
          el.href = 'https://wa.me/' + _waNum;
        } else {
          el.textContent = settings.whatsapp_number
            ? (settings.whatsapp_dial_code || '') + ' ' + settings.whatsapp_number
            : (settings.contact_whatsapp || '');
        }
      });
    }

  } catch (err) {
    console.error('Falha ao carregar tema da loja:', err);
  }
}

// Executa imediatamente ao carregar o script
loadStoreBrand();
