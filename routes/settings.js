const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db/connection');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for logo and favicon
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${file.fieldname}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});
const upload = multer({ storage: storage });

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM store_settings WHERE id = 1');
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Configurações da loja não encontradas.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar configurações:', err.message);
    res.status(500).json({ error: 'Erro ao buscar configurações da loja.' });
  }
});

// POST /api/settings
router.post('/', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]), async (req, res) => {
  try {
    // 1. Fetch current settings to retain old image paths if new ones are not uploaded
    const { rows: currentRows } = await query('SELECT logo_url, favicon_url FROM store_settings WHERE id = 1');
    const defaultSettings = currentRows[0] || {};
    
    let logo_url = defaultSettings.logo_url;
    let favicon_url = defaultSettings.favicon_url;
    
    // 2. Process uploaded files
    if (req.files && req.files['logo'] && req.files['logo'][0]) {
      logo_url = '/uploads/' + req.files['logo'][0].filename;
    }
    
    if (req.files && req.files['favicon'] && req.files['favicon'][0]) {
      favicon_url = '/uploads/' + req.files['favicon'][0].filename;
    }
    
    // 3. Extract other text fields from req.body
    const fields = [
      'store_name', 'store_subtitle', 'color_primary', 'color_secondary',
      'color_accent', 'color_button_main', 'color_panel_bg', 'color_card_bg',
      'color_text', 'color_status_recebido', 'color_status_preparo',
      'color_status_pronto', 'color_status_entrega', 'color_status_entregue',
      'color_status_cancelado', 'color_status_atrasado', 'contact_phone',
      'contact_whatsapp', 'store_address', 'footer_text', 'admin_display_name',
      'public_display_name', 'domain'
    ];
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    // Always add files
    setClauses.push(`logo_url = $${paramIndex++}`);
    values.push(logo_url);
    
    setClauses.push(`favicon_url = $${paramIndex++}`);
    values.push(favicon_url);
    
    // Add text fields
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(req.body[field] || null); // Convert empty strings to null if needed
      }
    }
    
    values.push(1); // the id=1 condition
    
    const sql = `
      UPDATE store_settings 
      SET ${setClauses.join(', ')} 
      WHERE id = $${paramIndex - 1}
      RETURNING *
    `;
    
    const { rows } = await query(sql, values);
    
    if (rows.length === 0) {
      // If row somehow doesn't exist, we fallback
      return res.status(404).json({ error: 'Configuração base não encontrada para atualizar (id=1).' });
    }
    
    res.json(rows[0]);
    
  } catch (err) {
    console.error('Erro ao salvar configurações:', err.message);
    res.status(500).json({ error: 'Erro ao salvar configurações da loja.' });
  }
});

module.exports = router;
