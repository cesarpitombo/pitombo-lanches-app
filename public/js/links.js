document.addEventListener('DOMContentLoaded', async () => {
  await carregarDadosLinks();
});

async function carregarDadosLinks() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    // 1. Textos e Slogan
    const storeNameElement = document.getElementById('storeNameText');
    if (storeNameElement) storeNameElement.textContent = settings.store_name || 'Pitombo Lanches';
    
    const subtitleElement = document.getElementById('storeSubtitleText');
    if (subtitleElement) subtitleElement.textContent = settings.store_subtitle || '';
    if (!settings.store_subtitle) subtitleElement.style.display = 'none';

    // 2. Logo
    const logoImg = document.getElementById('storeLogo');
    const initialLogo = document.getElementById('initialLogo');
    if (settings.logo_url) {
      logoImg.src = settings.logo_url;
      logoImg.style.display = 'block';
      initialLogo.style.display = 'none';
    } else {
      initialLogo.textContent = (settings.store_name || 'P').charAt(0).toUpperCase();
    }

    // 3. Banner
    const bannerContainer = document.getElementById('storeBanner');
    if (settings.store_banner_url) {
      bannerContainer.style.backgroundImage = `url('${settings.store_banner_url}')`;
    }

    // 4. Horários
    const hoursContainer = document.getElementById('operatingHoursContainer');
    const hoursText = document.getElementById('operatingHoursText');
    if (settings.operating_hours) {
      hoursContainer.style.display = 'block';
      hoursText.textContent = settings.operating_hours;
    }

    // 5. WhatsApp Link
    const _buildWaNum = (s) => {
      if (s && s.whatsapp_dial_code && s.whatsapp_number)
        return s.whatsapp_dial_code.replace(/\D/g,'') + s.whatsapp_number.replace(/\D/g,'');
      const n = ((s && s.contact_whatsapp) || '').replace(/\D/g,'');
      return n.startsWith('55') ? n : '55'+n;
    };
    const waNum = _buildWaNum(settings);
    if (waNum) {
      const waLink = document.getElementById('linkWhatsapp');
      const msg = encodeURIComponent(`Olá, vim pelo link do perfil!`);
      waLink.href = `https://wa.me/${waNum}?text=${msg}`;
      waLink.style.display = 'flex';
    }

    // 6. Redes Sociais
    if (settings.social_instagram) {
      const instaLink = document.getElementById('linkInstagram');
      instaLink.href = settings.social_instagram.startsWith('http') ? settings.social_instagram : `https://instagram.com/${settings.social_instagram.replace('@','')}`;
      instaLink.style.display = 'flex';
    }
    
    if (settings.social_facebook) {
      const fbLink = document.getElementById('linkFacebook');
      fbLink.href = settings.social_facebook.startsWith('http') ? settings.social_facebook : `https://facebook.com/${settings.social_facebook}`;
      fbLink.style.display = 'flex';
    }

    // 7. Endereço
    const addrElem = document.getElementById('storeAddressText');
    if (settings.store_address) {
      addrElem.innerHTML = `📍 ${settings.store_address}<br><br>${settings.footer_text || ''}`;
    } else {
      addrElem.innerHTML = settings.footer_text || '';
    }

    // Atualizar título da página dinamicamente
    document.title = `${settings.store_name} - Links`;

  } catch (err) {
    console.error('Erro ao carregar dados da página de links:', err);
  }
}

function shareLink() {
  if (navigator.share) {
    navigator.share({
      title: document.title,
      text: 'Confira nosso cardápio digital!',
      url: window.location.href
    }).catch(err => console.error('Error sharing:', err));
  } else {
    // Fallback: Copy to clipboard
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert('Link copiado para a área de transferência!');
    });
  }
}
