/**
 * services/deliveryGrouping.js
 *
 * Detecção de pedidos delivery candidatos a agrupamento por proximidade.
 * Score 0..1; quanto maior, mais forte a sugestão.
 *
 * Níveis (em ordem de prioridade):
 *   1.0   mesmo_endereco        — texto idêntico após normalização
 *   0.95  mesmo_cliente         — mesmo telefone OU mesmo nome de cliente
 *   0.95  geo_muito_proximo     — lat/lng < 120m (se houver)
 *   0.85  endereco_proximo      — mesma rua + número diferente até 10
 *   0.75  geo_proximo           — lat/lng < 300m
 *   0.65  mesma_rua             — mesma rua, sem número confiável
 *   0.55  geo_mesma_regiao      — lat/lng < 700m
 *   0.45  mesma_zona            — mesma zona/bairro
 *
 * Limiar mínimo para sugerir: 0.45.
 */

const STATUSES_AGRUPAVEIS = new Set([
  'recebido',
  'pendente_aprovacao',
  'em_preparo',
  'pronto',
  'em_entrega',
]);

function _normTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

function _parseEndereco(endereco) {
  if (!endereco) return { rua: '', numero: null, bairro: '' };
  const norm = _normTexto(endereco);
  const partes = norm.split(',').map(p => p.trim()).filter(Boolean);
  const rua = partes[0] || '';
  let numero = null;
  if (partes[1]) {
    const m = partes[1].match(/\d+/);
    if (m) numero = parseInt(m[0], 10);
  }
  // Tenta extrair bairro: penúltima parte antes de cidade/cep
  const bairro = partes.length >= 3 ? partes[partes.length - 2] : '';
  return { rua, numero, bairro };
}

// Distância Haversine em metros
function _haversine(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Calcula score (0..1) de proximidade entre dois pedidos delivery.
 * Retorna { score, motivo } ou null se não houver afinidade alguma.
 */
function scorePar(a, b) {
  if (!a || !b || a.id === b.id) return null;
  if (a.tipo !== 'delivery' || b.tipo !== 'delivery') return null;
  if (!STATUSES_AGRUPAVEIS.has(a.status) || !STATUSES_AGRUPAVEIS.has(b.status)) return null;

  // 1) Mesmo endereço exato
  const endA = _normTexto(a.endereco);
  const endB = _normTexto(b.endereco);
  if (endA && endA === endB) {
    return { score: 1.00, motivo: 'mesmo_endereco' };
  }

  // 2) Mesmo cliente (telefone idêntico)
  const telA = _onlyDigits(a.telefone);
  const telB = _onlyDigits(b.telefone);
  if (telA && telA.length >= 8 && telA === telB) {
    return { score: 0.95, motivo: 'mesmo_cliente' };
  }

  // 3) Geolocalização (se ambos tiverem)
  const dist = _haversine(a.latitude, a.longitude, b.latitude, b.longitude);
  if (dist !== null) {
    if (dist <= 120) return { score: 0.95, motivo: `geo_muito_proximo_${Math.round(dist)}m` };
    if (dist <= 300) return { score: 0.75, motivo: `geo_proximo_${Math.round(dist)}m` };
    if (dist <= 700) return { score: 0.55, motivo: `geo_mesma_regiao_${Math.round(dist)}m` };
  }

  // 4) Heurística textual
  const pa = _parseEndereco(a.endereco);
  const pb = _parseEndereco(b.endereco);

  if (pa.rua && pa.rua === pb.rua) {
    if (pa.numero != null && pb.numero != null && Math.abs(pa.numero - pb.numero) <= 10) {
      return { score: 0.85, motivo: 'endereco_proximo' };
    }
    return { score: 0.65, motivo: 'mesma_rua' };
  }

  // 5) Mesma zona/bairro
  const zonaA = (a.zona_nome || pa.bairro || '').toLowerCase().trim();
  const zonaB = (b.zona_nome || pb.bairro || '').toLowerCase().trim();
  if (zonaA && zonaA === zonaB) {
    return { score: 0.45, motivo: 'mesma_zona' };
  }

  return null;
}

/**
 * Recebe lista de pedidos e retorna sugestões de agrupamento.
 * Cada sugestão: { pedido_id, candidatos: [{ id, score, motivo }] }
 * Apenas inclui pares com score >= threshold.
 */
function gerarSugestoes(pedidos, threshold = 0.45) {
  const elegíveis = pedidos.filter(p =>
    p.tipo === 'delivery'
    && STATUSES_AGRUPAVEIS.has(p.status)
    && !p.delivery_group_id
  );

  const sugestoes = [];
  for (const p of elegíveis) {
    const candidatos = [];
    for (const q of elegíveis) {
      const r = scorePar(p, q);
      if (r && r.score >= threshold) {
        candidatos.push({ id: q.id, score: r.score, motivo: r.motivo, cliente: q.cliente, endereco: q.endereco });
        console.log(`[DeliveryGrouping] pedido #${p.id} candidato com #${q.id} score=${r.score.toFixed(2)} motivo=${r.motivo}`);
      }
    }
    if (candidatos.length) {
      candidatos.sort((x, y) => y.score - x.score);
      sugestoes.push({ pedido_id: p.id, candidatos });
    }
  }
  return sugestoes;
}

module.exports = {
  scorePar,
  gerarSugestoes,
  STATUSES_AGRUPAVEIS,
};
