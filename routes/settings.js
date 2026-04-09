const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// --- HELPER FUNCTIONS FOR STORE HOURS ---

/**
 * Converts "HH:mm" string to minutes from midnight (0-1439)
 */
function timeToMinutes(timeStr) {
  if (!timeStr || !/^([01]\d|2[0-3]):?([0-5]\d)$/.test(timeStr)) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Gets current time and day of week in Europe/Lisbon
 */
function getLisbonTime() {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false
  });
  
  const parts = formatter.formatToParts(new Date());
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  
  const h = parseInt(map.hour);
  const m = parseInt(map.minute);
  const d = parseInt(map.day);
  const mo = parseInt(map.month);
  const y = parseInt(map.year);

  // Correct Day of Week in Lisbon
  const dtVal = new Date(y, mo - 1, d);
  const dayOfWeek = dtVal.getDay();
  
  return {
    minutesTotal: h * 60 + m,
    dayOfWeek: dayOfWeek
  };
}

/**
 * Core logic to check if store is open based on Europe/Lisbon time
 */
function isStoreOpen(weekly_hours) {
  if (!weekly_hours || typeof weekly_hours !== 'object') return false;
  
  const DIAS_CHAVE = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const now = getLisbonTime();
  const todayKey = DIAS_CHAVE[now.dayOfWeek];
  const yesterdayKey = DIAS_CHAVE[(now.dayOfWeek + 6) % 7];

  // 1. Check intervals for TODAY
  const turnosHoje = weekly_hours[todayKey] || [];
  const abertoHoje = turnosHoje.some(t => {
    const open = timeToMinutes(t.open);
    const close = timeToMinutes(t.close);
    if (open === null || close === null) return false;

    if (!t.crossMidnight) {
      // Normal interval: 10:00 - 22:00
      return now.minutesTotal >= open && now.minutesTotal <= close;
    } else {
      // Crosses midnight: Started today (e.g., 22:00) and ends tomorrow
      return now.minutesTotal >= open;
    }
  });

  if (abertoHoje) return true;

  // 2. Check intervals from YESTERDAY that crossed into today
  const turnosOntem = weekly_hours[yesterdayKey] || [];
  const vindoDeOntem = turnosOntem.some(t => {
    if (!t.crossMidnight) return false;
    const close = timeToMinutes(t.close);
    return now.minutesTotal <= close;
  });

  return vindoDeOntem;
}

/**
 * Validates weekly hours structure and prevents overlaps
 */
function validateWeeklyHours(weeklyHours) {
  if (!weeklyHours || typeof weeklyHours !== 'object') return;
  const DIAS_CHAVE = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

  for (const dia of DIAS_CHAVE) {
    let intervals = weeklyHours[dia] || [];
    if (!Array.isArray(intervals)) continue;

    // Sort by opening time
    const sorted = [...intervals].sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open));
    
    for (let i = 0; i < sorted.length; i++) {
      const { open: openStr, close: closeStr, crossMidnight } = sorted[i];
      const open = timeToMinutes(openStr);
      const close = timeToMinutes(closeStr);

      if (open === null || close === null) throw new Error(`Formato de hora inválido no dia ${dia}.`);
      if (open === close) throw new Error(`Intervalo com duração zero no dia ${dia} (${openStr}).`);

      if (crossMidnight) {
        if (open < close) throw new Error(`Turno 'crossMidnight' no dia ${dia} deve ter abertura maior que fechamento (ex: 22:00 - 02:00).`);
        if (i !== sorted.length - 1) throw new Error(`O turno que atravessa a meia-noite deve ser o último do dia ${dia}.`);
      } else {
        if (open > close) throw new Error(`Turno normal no dia ${dia} deve ter abertura menor que fechamento.`);
      }

      // Overlap check
      if (sorted[i + 1]) {
        const nextOpen = timeToMinutes(sorted[i + 1].open);
        if (close > nextOpen && !crossMidnight) {
          throw new Error(`Sobreposição de horários detectada no dia ${dia}.`);
        }
      }
    }
  }
}

// --- ROUTES ---

// Auto-migrate
(async () => {
  try {
    await query(`ALTER TABLE store_settings
      ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) DEFAULT 'zona',
      ADD COLUMN IF NOT EXISTS delivery_base NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_per_km NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_fixed NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_min NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_max NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_free_km NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS scheduling_min_advance INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS scheduling_queue_before INTEGER DEFAULT 20,
      ADD COLUMN IF NOT EXISTS accept_orders BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS order_receive_mode VARCHAR(50) DEFAULT 'app_whatsapp',
      ADD COLUMN IF NOT EXISTS contact_whatsapp_pedidos VARCHAR(50),
      ADD COLUMN IF NOT EXISTS auto_accept VARCHAR(30) DEFAULT 'revisados',
      ADD COLUMN IF NOT EXISTS upsell_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS req_delivery VARCHAR(30) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS cfg_retirada BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS cfg_local BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS qr_type VARCHAR(30) DEFAULT 'generic',
      ADD COLUMN IF NOT EXISTS table_service BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS gorjeta_enabled BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS pay_money BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS pay_card_machine BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS pay_pix BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS pay_amex BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS pay_visa BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS pay_mastercard BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS pay_online_stripe BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS hide_address BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) DEFAULT 'BRL',
      ADD COLUMN IF NOT EXISTS app_language VARCHAR(20) DEFAULT 'pt-BR',
      ADD COLUMN IF NOT EXISTS google_maps_link TEXT,
      ADD COLUMN IF NOT EXISTS show_google_reviews BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS only_4_stars BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS google_business_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS business_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS food_style VARCHAR(50),
      ADD COLUMN IF NOT EXISTS main_pos_system VARCHAR(50),
      ADD COLUMN IF NOT EXISTS pos_system_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS print_mode VARCHAR(20) DEFAULT 'web',
      ADD COLUMN IF NOT EXISTS print_auto_kitchen BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS print_auto_web_client BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS print_auto_web_client_trigger VARCHAR(30) DEFAULT 'pendente',
      ADD COLUMN IF NOT EXISTS print_auto_pdv_client BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS landing_titulo VARCHAR(150),
      ADD COLUMN IF NOT EXISTS landing_subtitulo VARCHAR(255),
      ADD COLUMN IF NOT EXISTS landing_texto TEXT,
      ADD COLUMN IF NOT EXISTS landing_ativo BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS landing_botao_texto VARCHAR(50) DEFAULT 'Ver Cardápio',
      ADD COLUMN IF NOT EXISTS pedido_minimo NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tempo_preparo VARCHAR(50) DEFAULT '30-45 min',
      ADD COLUMN IF NOT EXISTS mensagem_automatica TEXT,
      ADD COLUMN IF NOT EXISTS status_loja VARCHAR(20) DEFAULT 'aberta',
      ADD COLUMN IF NOT EXISTS checkout_cpf_required BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS checkout_email_required BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS checkout_obs_required BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS hero_video_url TEXT,
      ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
      ADD COLUMN IF NOT EXISTS hero_photo_url TEXT,
      ADD COLUMN IF NOT EXISTS operating_hours VARCHAR(255),
      ADD COLUMN IF NOT EXISTS weekly_hours JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS whatsapp_country_code VARCHAR(5),
      ADD COLUMN IF NOT EXISTS whatsapp_dial_code VARCHAR(10),
      ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30)`);
    console.log('\u2705 store_settings: colunas verificadas adequadamente.');
  } catch(e) {
    console.error('\u26a0\ufe0f Migration settings:', e.message);
  }
})();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for settings (Logo, Hero, etc)
const settingsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === 'logo' ? 'logo-' : 'hero-';
    cb(null, prefix + Date.now() + ext);
  }
});
const upload = multer({ storage: settingsStorage });

router.post('/upload-logo', requireAuth, requireRole(ADMIN_MANAGER), upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const url = '/uploads/' + req.file.filename;
  res.json({ url });
});

// GET /api/settings - Retorna configurações da loja
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM store_settings WHERE id = 1');
    if (rows.length === 0) return res.status(404).json({ error: 'Configurações não encontradas.' });
    
    const settings = rows[0];
    // Calculate real-time status
    settings.is_open = isStoreOpen(settings.weekly_hours);
    
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configurações.' });
  }
});

// POST /api/settings
router.post('/', requireAuth, requireRole(ADMIN_MANAGER), upload.fields([
  { name: 'logo',        maxCount: 1 },
  { name: 'favicon',     maxCount: 1 },
  { name: 'banner',      maxCount: 1 },
  { name: 'hero_image',  maxCount: 1 },
  { name: 'hero_video',  maxCount: 1 }
]), async (req, res) => {
  try {
    const { rows: currentRows } = await query(
      'SELECT logo_url, favicon_url, store_banner_url, hero_image_url, hero_video_url FROM store_settings WHERE id = 1'
    );
    const defaultSettings = currentRows[0] || {};

    let logo_url = defaultSettings.logo_url;
    let favicon_url = defaultSettings.favicon_url;
    let store_banner_url = defaultSettings.store_banner_url;
    let hero_image_url = defaultSettings.hero_image_url;
    let hero_video_url = defaultSettings.hero_video_url;

    if (req.files && req.files['logo']) logo_url = '/uploads/' + req.files['logo'][0].filename;
    if (req.files && req.files['favicon']) favicon_url = '/uploads/' + req.files['favicon'][0].filename;
    if (req.files && req.files['banner']) store_banner_url = '/uploads/' + req.files['banner'][0].filename;
    if (req.files && req.files['hero_image']) hero_image_url = '/uploads/' + req.files['hero_image'][0].filename;
    else if (req.body.hero_image_clear === '1') hero_image_url = null;
    if (req.files && req.files['hero_video']) hero_video_url = '/uploads/' + req.files['hero_video'][0].filename;
    else if (req.body.hero_video_clear === '1') hero_video_url = null;
    
    const fields = [
      'store_name', 'store_subtitle', 'color_primary', 'color_secondary',
      'color_accent', 'color_button_main', 'color_panel_bg', 'color_card_bg',
      'color_text', 'color_status_recebido', 'color_status_preparo',
      'color_status_pronto', 'color_status_entrega', 'color_status_entregue',
      'color_status_cancelado', 'color_status_atrasado', 'contact_phone',
      'contact_whatsapp', 'whatsapp_country_code', 'whatsapp_dial_code', 'whatsapp_number',
      'store_address', 'footer_text', 'admin_display_name',
      'public_display_name', 'domain', 'social_instagram', 'social_facebook',
      'operating_hours', 'weekly_hours',
      'delivery_mode', 'delivery_base', 'delivery_per_km', 'delivery_fixed',
      'delivery_min', 'delivery_max', 'delivery_free_km',
      'scheduling_min_advance', 'scheduling_queue_before',
      'order_receive_mode', 'contact_whatsapp_pedidos', 'auto_accept',
      'req_delivery', 'qr_type',
      'currency_code', 'app_language', 'google_maps_link', 'google_business_name',
      'business_type', 'food_style', 'main_pos_system', 'pos_system_name',
      'print_mode', 'print_auto_web_client_trigger',
      'landing_titulo', 'landing_subtitulo', 'landing_texto', 'landing_botao_texto',
      'pedido_minimo', 'tempo_preparo', 'mensagem_automatica', 'status_loja',
      'logo_url'
    ];
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    setClauses.push(`logo_url = $${paramIndex++}`); values.push(logo_url);
    setClauses.push(`favicon_url = $${paramIndex++}`); values.push(favicon_url);
    setClauses.push(`store_banner_url = $${paramIndex++}`); values.push(store_banner_url);
    setClauses.push(`hero_image_url = $${paramIndex++}`); values.push(hero_image_url);
    setClauses.push(`hero_video_url = $${paramIndex++}`); values.push(hero_video_url);
    
    const boolFields = [
      'scheduling_enabled', 'accept_orders', 'upsell_enabled',
      'delivery_enabled', 'cfg_retirada', 'cfg_local', 'table_service', 'gorjeta_enabled',
      'pay_money', 'pay_card_machine', 'pay_pix', 'pay_amex', 'pay_visa', 'pay_mastercard', 'pay_online_stripe',
      'hide_address', 'show_google_reviews', 'only_4_stars',
      'print_auto_kitchen', 'print_auto_web_client', 'print_auto_pdv_client',
      'landing_ativo', 'checkout_cpf_required', 'checkout_email_required', 'checkout_obs_required'
    ];
    for (const bField of boolFields) {
       if (req.body[bField] !== undefined) {
         setClauses.push(`${bField} = $${paramIndex++}`);
         values.push(req.body[bField] === 'true' || req.body[bField] === 'on' || req.body[bField] === true);
       }
    }
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let val = req.body[field] || null;
        if (field === 'weekly_hours' && typeof val === 'string') {
          try {
            val = JSON.parse(val);
            validateWeeklyHours(val);
          } catch (e) {
            return res.status(400).json({ error: 'Erro de validação nos horários: ' + e.message });
          }
        }
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(val);
      }
    }
    
    // Se os novos campos de WhatsApp foram enviados, monta contact_whatsapp composto
    const waDial   = req.body.whatsapp_dial_code;
    const waNumber = req.body.whatsapp_number;
    if (waDial && waNumber) {
      const fullNum = waDial.replace(/\D/g, '') + waNumber.replace(/\D/g, '');
      // Só adiciona se contact_whatsapp ainda não foi incluído pelos fields (evita coluna duplicada no SET)
      if (!setClauses.some(c => c.startsWith('contact_whatsapp '))) {
        setClauses.push(`contact_whatsapp = $${paramIndex++}`);
        values.push(fullNum);
      }
    }

    values.push(1);
    const sql = `UPDATE store_settings SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const { rows } = await query(sql, values);
    res.json(rows[0]);
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

module.exports = router;
