// ═══════════════════════════════════════════════════════════════
// Pitombo Lanches — Módulo de Delivery (modo + faixas + bairros + áreas + KM)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  geocode,
  distanceMeters,
  haversine,
  pointInPolygon,
  normalizeNeighborhood,
  suggestNeighborhoods,
  hasGoogleKey
} = require('../services/geocoding');

const ADMIN_MANAGER = ['Admin', 'Manager'];

// Modos suportados (a tabela delivery_config guarda qual está ativo)
const MODES = ['sem_preco', 'fixo', 'bairro', 'km', 'areas', 'faixas'];

// ─── Migrations (rodam no boot) ───────────────────────────────────────────────
(async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS delivery_config (
      id                          INTEGER PRIMARY KEY DEFAULT 1,
      mode                        VARCHAR(20) NOT NULL DEFAULT 'sem_preco',
      preco_fixo                  NUMERIC(10,2) NOT NULL DEFAULT 0,
      km_preco_base               NUMERIC(10,2) NOT NULL DEFAULT 0,
      km_preco_por_km             NUMERIC(10,2) NOT NULL DEFAULT 0,
      km_distancia_maxima         NUMERIC(10,2) NOT NULL DEFAULT 0,
      accept_outside_coverage     BOOLEAN NOT NULL DEFAULT FALSE,
      validate_with_google_maps   BOOLEAN NOT NULL DEFAULT TRUE,
      atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT delivery_config_singleton CHECK (id = 1)
    )`);
    await query(`INSERT INTO delivery_config (id) VALUES (1) ON CONFLICT DO NOTHING`);

    await query(`CREATE TABLE IF NOT EXISTS delivery_faixas (
      id                SERIAL PRIMARY KEY,
      cobertura_metros  INTEGER NOT NULL CHECK (cobertura_metros > 0),
      preco             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
      ativo             BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_delivery_faixas_cobertura ON delivery_faixas(cobertura_metros ASC)`);

    await query(`CREATE TABLE IF NOT EXISTS delivery_bairros (
      id           SERIAL PRIMARY KEY,
      nome_bairro  VARCHAR(120) NOT NULL,
      preco        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
      ativo        BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_delivery_bairros_nome ON delivery_bairros(LOWER(nome_bairro))`);

    await query(`CREATE TABLE IF NOT EXISTS delivery_areas (
      id         SERIAL PRIMARY KEY,
      nome       VARCHAR(120),
      preco      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
      poligono   JSONB NOT NULL,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    console.log('✅ delivery_config + faixas + bairros + areas: tabelas verificadas.');
  } catch (e) {
    console.error('⚠️ Migration delivery:', e.message);
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getStoreLatLng() {
  const { rows } = await query(`SELECT store_lat, store_lng FROM store_settings WHERE id = 1`);
  if (!rows.length) return { lat: null, lng: null };
  return {
    lat: rows[0].store_lat !== null ? parseFloat(rows[0].store_lat) : null,
    lng: rows[0].store_lng !== null ? parseFloat(rows[0].store_lng) : null,
  };
}

async function getDeliveryConfig() {
  const { rows } = await query(`SELECT * FROM delivery_config WHERE id = 1`);
  return rows[0] || null;
}

function num(v, def = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// GET /api/delivery/config — público (checkout precisa para saber se delivery está em coverage check)
router.get('/config', async (req, res) => {
  try {
    const cfg = await getDeliveryConfig();
    const store = await getStoreLatLng();
    res.json({
      ...cfg,
      store_lat: store.lat,
      store_lng: store.lng,
      google_maps_available: hasGoogleKey()
    });
    console.log(`[DeliveryConfig] load: ${cfg.mode}`);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar config de delivery: ' + e.message });
  }
});

// PUT /api/delivery/config — admin
router.put('/config', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const {
    mode,
    preco_fixo,
    km_preco_base,
    km_preco_por_km,
    km_distancia_maxima,
    accept_outside_coverage,
    validate_with_google_maps,
    store_lat,
    store_lng,
    store_address
  } = req.body;

  if (mode && !MODES.includes(mode)) {
    return res.status(400).json({ error: `Modo inválido. Use: ${MODES.join(', ')}` });
  }

  try {
    const sets = [];
    const vals = [];
    let i = 1;
    if (mode !== undefined) { sets.push(`mode = $${i++}`); vals.push(mode); }
    if (preco_fixo !== undefined) { sets.push(`preco_fixo = $${i++}`); vals.push(num(preco_fixo)); }
    if (km_preco_base !== undefined) { sets.push(`km_preco_base = $${i++}`); vals.push(num(km_preco_base)); }
    if (km_preco_por_km !== undefined) { sets.push(`km_preco_por_km = $${i++}`); vals.push(num(km_preco_por_km)); }
    if (km_distancia_maxima !== undefined) { sets.push(`km_distancia_maxima = $${i++}`); vals.push(num(km_distancia_maxima)); }
    if (accept_outside_coverage !== undefined) { sets.push(`accept_outside_coverage = $${i++}`); vals.push(!!accept_outside_coverage); }
    if (validate_with_google_maps !== undefined) { sets.push(`validate_with_google_maps = $${i++}`); vals.push(!!validate_with_google_maps); }

    if (sets.length) {
      sets.push(`atualizado_em = NOW()`);
      await query(`UPDATE delivery_config SET ${sets.join(', ')} WHERE id = 1`, vals);
      console.log(`[DeliveryConfig] mode salvo=${mode}`);
    }

    if (store_lat !== undefined || store_lng !== undefined || store_address !== undefined) {
      const sl = store_lat !== undefined ? num(store_lat, null) : null;
      const sg = store_lng !== undefined ? num(store_lng, null) : null;
      const setsS = [];
      const valsS = [];
      let j = 1;
      if (sl !== null) { setsS.push(`store_lat = $${j++}`); valsS.push(sl); }
      if (sg !== null) { setsS.push(`store_lng = $${j++}`); valsS.push(sg); }
      if (store_address !== undefined) { setsS.push(`store_address = $${j++}`); valsS.push(store_address); }
      if (setsS.length) {
        await query(`UPDATE store_settings SET ${setsS.join(', ')} WHERE id = 1`, valsS);
      }
    }

    const cfg = await getDeliveryConfig();
    const store = await getStoreLatLng();
    res.json({ ...cfg, store_lat: store.lat, store_lng: store.lng });
  } catch (e) {
    console.error('Erro ao salvar config delivery:', e.message);
    res.status(500).json({ error: 'Erro ao salvar configuração: ' + e.message });
  }
});

// ─── FAIXAS PERSONALIZADAS (cobertura_metros + preço) ────────────────────────
router.get('/faixas', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM delivery_faixas ORDER BY cobertura_metros ASC, id ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar faixas: ' + e.message });
  }
});

router.post('/faixas', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { cobertura_metros, preco, ativo } = req.body;
  const cm = parseInt(cobertura_metros, 10);
  if (!Number.isFinite(cm) || cm <= 0) {
    return res.status(400).json({ error: 'cobertura_metros deve ser inteiro positivo.' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO delivery_faixas (cobertura_metros, preco, ativo)
       VALUES ($1, $2, $3) RETURNING *`,
      [cm, num(preco), ativo !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar faixa: ' + e.message });
  }
});

router.put('/faixas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  const { cobertura_metros, preco, ativo } = req.body;
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const cm = parseInt(cobertura_metros, 10);
  if (!Number.isFinite(cm) || cm <= 0) {
    return res.status(400).json({ error: 'cobertura_metros deve ser inteiro positivo.' });
  }
  try {
    const { rows } = await query(
      `UPDATE delivery_faixas SET cobertura_metros=$1, preco=$2, ativo=$3
       WHERE id=$4 RETURNING *`,
      [cm, num(preco), ativo !== false, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Faixa não encontrada.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar faixa: ' + e.message });
  }
});

router.delete('/faixas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    const { rowCount } = await query(`DELETE FROM delivery_faixas WHERE id=$1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Faixa não encontrada.' });
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir faixa: ' + e.message });
  }
});

// PATCH /api/delivery/faixas/:id/toggle — ligar/desligar rápido
router.patch('/faixas/:id/toggle', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE delivery_faixas SET ativo = NOT ativo WHERE id=$1 RETURNING *`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Faixa não encontrada.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── BAIRROS ─────────────────────────────────────────────────────────────────
router.get('/bairros', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM delivery_bairros ORDER BY nome_bairro ASC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bairros', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { nome_bairro, preco, ativo } = req.body;
  if (!nome_bairro || !nome_bairro.toString().trim()) {
    return res.status(400).json({ error: 'nome_bairro obrigatório.' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO delivery_bairros (nome_bairro, preco, ativo)
       VALUES ($1, $2, $3) RETURNING *`,
      [nome_bairro.trim(), num(preco), ativo !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/bairros/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  const { nome_bairro, preco, ativo } = req.body;
  if (!id) return res.status(400).json({ error: 'id inválido' });
  if (!nome_bairro || !nome_bairro.toString().trim()) {
    return res.status(400).json({ error: 'nome_bairro obrigatório.' });
  }
  try {
    const { rows } = await query(
      `UPDATE delivery_bairros SET nome_bairro=$1, preco=$2, ativo=$3 WHERE id=$4 RETURNING *`,
      [nome_bairro.trim(), num(preco), ativo !== false, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bairro não encontrado.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bairros/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rowCount } = await query(`DELETE FROM delivery_bairros WHERE id=$1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Bairro não encontrado.' });
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/bairros/:id/toggle', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE delivery_bairros SET ativo = NOT ativo WHERE id=$1 RETURNING *`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bairro não encontrado.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ÁREAS PERSONALIZADAS (polígonos) ────────────────────────────────────────
function validatePolygon(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return 'Polígono precisa de pelo menos 3 pontos.';
  for (const p of poly) {
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') {
      return 'Cada ponto precisa de { lat, lng } numéricos.';
    }
    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      return 'Coordenadas fora do intervalo válido.';
    }
  }
  return null;
}

router.get('/areas', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM delivery_areas ORDER BY id ASC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/areas', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const { nome, preco, poligono, ativo } = req.body;
  const err = validatePolygon(poligono);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await query(
      `INSERT INTO delivery_areas (nome, preco, poligono, ativo)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [nome || null, num(preco), JSON.stringify(poligono), ativo !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/areas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  const { nome, preco, poligono, ativo } = req.body;
  if (!id) return res.status(400).json({ error: 'id inválido' });
  if (poligono !== undefined) {
    const err = validatePolygon(poligono);
    if (err) return res.status(400).json({ error: err });
  }
  try {
    const sets = [];
    const vals = [];
    let i = 1;
    if (nome !== undefined) { sets.push(`nome = $${i++}`); vals.push(nome || null); }
    if (preco !== undefined) { sets.push(`preco = $${i++}`); vals.push(num(preco)); }
    if (poligono !== undefined) { sets.push(`poligono = $${i++}::jsonb`); vals.push(JSON.stringify(poligono)); }
    if (ativo !== undefined) { sets.push(`ativo = $${i++}`); vals.push(!!ativo); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    vals.push(id);
    const { rows } = await query(
      `UPDATE delivery_areas SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Área não encontrada.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/areas/:id', requireAuth, requireRole(ADMIN_MANAGER), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rowCount } = await query(`DELETE FROM delivery_areas WHERE id=$1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Área não encontrada.' });
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── QUOTE: cálculo da taxa de entrega ──────────────────────────────────────
// POST /api/delivery/quote
// body: { address?, lat?, lng?, neighborhood? }
// Retorna: { mode, fee, distance_m, in_coverage, label, geocoded?, error? }
//
// Esta é a fonte autoritativa do preço. O checkout chama isso e o backend
// re-valida no /api/pedidos antes de gravar.
async function quoteDelivery({ address, lat, lng, neighborhood }) {
  const cfg = await getDeliveryConfig();
  if (!cfg) throw new Error('delivery_config ausente');

  const result = {
    mode: cfg.mode,
    fee: 0,
    distance_m: null,
    in_coverage: false,
    label: '',
    geocoded: null
  };

  // 1) sem_preco → frete grátis, qualquer endereço
  if (cfg.mode === 'sem_preco') {
    result.fee = 0;
    result.in_coverage = true;
    result.label = 'Frete grátis';
    return result;
  }

  // 2) fixo → preço fixo, qualquer endereço
  if (cfg.mode === 'fixo') {
    result.fee = parseFloat(cfg.preco_fixo) || 0;
    result.in_coverage = true;
    result.label = 'Preço fixo';
    return result;
  }

  // 3) bairro → match por nome
  if (cfg.mode === 'bairro') {
    const target = normalizeNeighborhood(neighborhood || '');
    if (!target) {
      result.label = 'Localidade do cliente não informada';
      return result;
    }
    const { rows } = await query(
      `SELECT * FROM delivery_bairros WHERE ativo = TRUE`
    );
    const match = rows.find(b => normalizeNeighborhood(b.nome_bairro) === target);
    if (match) {
      result.fee = parseFloat(match.preco) || 0;
      result.in_coverage = true;
      result.label = `Localidade: ${match.nome_bairro}`;
      result.bairro_id = match.id;
    } else {
      result.label = `Localidade "${neighborhood}" fora da cobertura`;
      result.in_coverage = false;
      if (cfg.accept_outside_coverage) result.fee = 0;
    }
    return result;
  }

  // 4 / 5 / 6 → precisa lat/lng do cliente
  if (lat == null || lng == null) {
    if (!address) {
      result.label = 'Endereço ou coordenadas obrigatórios para este modo.';
      return result;
    }
    try {
      const g = await geocode(address);
      lat = g.lat;
      lng = g.lng;
      result.geocoded = g;
    } catch (e) {
      result.label = 'Não foi possível geocodificar o endereço.';
      result.error = e.message;
      return result;
    }
  }

  const store = await getStoreLatLng();
  if (store.lat == null || store.lng == null) {
    result.label = 'Loja sem coordenadas configuradas (store_lat/store_lng).';
    return result;
  }

  const dist = await distanceMeters(store.lat, store.lng, parseFloat(lat), parseFloat(lng));
  result.distance_m = Math.round(dist.meters);
  result.distance_provider = dist.provider;

  // 4) km
  if (cfg.mode === 'km') {
    const distMaxKm = parseFloat(cfg.km_distancia_maxima) || 0;
    const distKm = dist.meters / 1000;
    if (distMaxKm > 0 && distKm > distMaxKm) {
      result.label = `Cliente a ${distKm.toFixed(2)} km — máximo ${distMaxKm} km`;
      result.in_coverage = false;
      if (cfg.accept_outside_coverage) {
        result.fee = parseFloat(cfg.km_preco_base) + distKm * parseFloat(cfg.km_preco_por_km);
      }
      return result;
    }
    result.in_coverage = true;
    result.fee = parseFloat(cfg.km_preco_base) + distKm * parseFloat(cfg.km_preco_por_km);
    result.fee = Math.round(result.fee * 100) / 100;
    result.label = `${distKm.toFixed(2)} km × ${parseFloat(cfg.km_preco_por_km).toFixed(2)}/km + base`;
    console.log(`[DeliveryQuote] mode=km origem=${store.lat},${store.lng} destino=${lat},${lng} distancia_km=${distKm.toFixed(2)} taxa=${result.fee}`);
    return result;
  }

  // 5) faixas — primeira faixa cuja cobertura_metros >= distância
  if (cfg.mode === 'faixas') {
    const { rows: faixas } = await query(
      `SELECT * FROM delivery_faixas WHERE ativo = TRUE ORDER BY cobertura_metros ASC`
    );
    if (!faixas.length) {
      result.label = 'Nenhuma faixa ativa configurada.';
      return result;
    }
    const distM = dist.meters;
    const match = faixas.find(f => distM <= parseInt(f.cobertura_metros, 10));
    if (match) {
      result.in_coverage = true;
      result.fee = parseFloat(match.preco) || 0;
      result.label = `Faixa até ${match.cobertura_metros}m — ${(distM / 1000).toFixed(2)} km`;
      result.faixa_id = match.id;
    } else {
      const max = Math.max(...faixas.map(f => parseInt(f.cobertura_metros, 10)));
      result.label = `Cliente a ${distM}m — fora das faixas (máx ${max}m)`;
      result.in_coverage = false;
      if (cfg.accept_outside_coverage) {
        const last = faixas[faixas.length - 1];
        result.fee = parseFloat(last.preco) || 0;
      }
    }
    console.log(`[DeliveryQuote] mode=faixas origem=${store.lat},${store.lng} destino=${lat},${lng} distancia_km=${(distM/1000).toFixed(2)} taxa=${result.fee}`);
    return result;
  }

  // 6) areas — primeira área cujo polígono contém o ponto
  if (cfg.mode === 'areas') {
    const { rows: areas } = await query(
      `SELECT * FROM delivery_areas WHERE ativo = TRUE ORDER BY id ASC`
    );
    const ptLat = parseFloat(lat);
    const ptLng = parseFloat(lng);
    const match = areas.find(a => {
      try {
        const poly = typeof a.poligono === 'string' ? JSON.parse(a.poligono) : a.poligono;
        return pointInPolygon(ptLat, ptLng, poly);
      } catch { return false; }
    });
    if (match) {
      result.in_coverage = true;
      result.fee = parseFloat(match.preco) || 0;
      result.label = match.nome ? `Área: ${match.nome}` : `Área #${match.id}`;
      result.area_id = match.id;
    } else {
      result.label = 'Endereço fora das áreas de entrega.';
      result.in_coverage = false;
    }
    return result;
  }

  result.label = 'Modo de entrega desconhecido: ' + cfg.mode;
  return result;
}

router.post('/quote', async (req, res) => {
  try {
    const r = await quoteDelivery(req.body || {});
    res.json(r);
  } catch (e) {
    console.error('[delivery/quote] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Autocomplete de bairros/localidades ────────────────────────────────
// GET /api/delivery/bairro-suggest?q=alb
const _suggestCache = new Map(); // q -> { ts, data }
const SUGGEST_TTL = 60_000;

router.get('/bairro-suggest', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json([]);
  const key = q.toLowerCase();
  const now = Date.now();
  const cached = _suggestCache.get(key);
  if (cached && (now - cached.ts) < SUGGEST_TTL) {
    return res.json(cached.data);
  }
  try {
    const data = await suggestNeighborhoods(q);
    _suggestCache.set(key, { ts: now, data });
    // Trim cache se ficar muito grande
    if (_suggestCache.size > 200) {
      const firstKey = _suggestCache.keys().next().value;
      _suggestCache.delete(firstKey);
    }
    res.json(data);
  } catch (e) {
    console.warn('[bairro-suggest] erro:', e.message);
    res.json([]);
  }
});

module.exports = router;
module.exports.quoteDelivery = quoteDelivery;
