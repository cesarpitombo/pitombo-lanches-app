// ═══════════════════════════════════════════════════════════════
// Pitombo Lanches — Geocoding & Distance Service
// ═══════════════════════════════════════════════════════════════
// Two-layer strategy:
//   1) Google Maps (Geocoding + Distance Matrix) when GOOGLE_MAPS_API_KEY is set.
//   2) Nominatim (OpenStreetMap) + Haversine fallback otherwise.
// All distances are returned in METERS.

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeAddress(address) {
  if (!address) return '';
  let s = address.toString().trim();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/(,\s*)+/g, ', ');
  s = s.replace(/^,\s*|,\s*$/g, '');
  if (!/portugal\s*$/i.test(s)) s = `${s}, Portugal`;
  return s;
}

function extractCityAndNeighborhood(components) {
  let cidade = null, bairro = null;
  for (const c of components || []) {
    const types = c.types || [];
    if (!cidade && (types.includes('locality') || types.includes('postal_town') || types.includes('administrative_area_level_2'))) {
      cidade = c.long_name;
    }
    if (!bairro && (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood'))) {
      bairro = c.long_name;
    }
  }
  return { cidade, bairro };
}

async function geocodeWithGoogle(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('google http ' + res.status);
  const data = await res.json();
  const status = data.status;
  if (status === 'OK' && data.results?.length) {
    const r = data.results[0];
    const { cidade, bairro } = extractCityAndNeighborhood(r.address_components);
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    if (lat == null || lng == null) throw new Error('google: coordenadas ausentes na resposta');
    return {
      lat,
      lng,
      provider: 'google',
      formatted_address: r.formatted_address,
      formatted: r.formatted_address,
      cidade,
      bairro
    };
  }
  if (status === 'ZERO_RESULTS')     throw new Error('ZERO_RESULTS: endereço não encontrado');
  if (status === 'REQUEST_DENIED')   throw new Error(`REQUEST_DENIED: API key inválida ou bloqueada${data.error_message ? ' — ' + data.error_message : ''}`);
  if (status === 'OVER_QUERY_LIMIT') throw new Error('OVER_QUERY_LIMIT: cota Google excedida');
  throw new Error('google status: ' + (status || 'desconhecido'));
}

function nominatimToResult(d, provider) {
  const a = d.address || {};
  const cidade = a.city || a.town || a.village || a.municipality || a.county || null;
  const bairro = a.suburb || a.neighbourhood || a.hamlet || null;
  return {
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    provider,
    formatted_address: d.display_name,
    formatted: d.display_name,
    cidade,
    bairro
  };
}

async function geocodeNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PitomboLanches/1.0 (contact@pitombo.local)' }
  });
  if (!res.ok) throw new Error('nominatim http ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('nominatim: no result');
  return nominatimToResult(data[0], 'nominatim');
}

// Nominatim structured search — separate street/city/country for better results
async function geocodeNominatimStructured({ street, city, country }) {
  const params = new URLSearchParams({ format: 'json', addressdetails: '1', limit: '1' });
  if (street) params.set('street', street);
  if (city) params.set('city', city);
  if (country) params.set('country', country);
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PitomboLanches/1.0 (contact@pitombo.local)' }
  });
  if (!res.ok) throw new Error('nominatim-structured http ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('nominatim-structured: no result');
  return nominatimToResult(data[0], 'nominatim_structured');
}

function validateGeoResult(r) {
  if (!r) throw new Error('resultado vazio');
  if (r.lat == null || r.lng == null) throw new Error('coordenadas inválidas');
  if (Number.isNaN(parseFloat(r.lat)) || Number.isNaN(parseFloat(r.lng))) throw new Error('coordenadas inválidas');
  return r;
}

async function geocode(address) {
  if (!address || !address.toString().trim()) throw new Error('endereço vazio');
  const normalized = normalizeAddress(address);
  console.log(`[Geo] endereço normalizado: "${normalized}" | google_key=${GOOGLE_KEY ? 'SIM' : 'NÃO'}`);

  // 1) Google — fonte principal
  if (GOOGLE_KEY) {
    try {
      const r = validateGeoResult(await geocodeWithGoogle(normalized));
      console.log(`[Geo] google sucesso lat=${r.lat} lng=${r.lng}`);
      return r;
    } catch (e) {
      console.warn(`[Geo] google falha ${e.message}`);
    }
  } else {
    console.warn('[Geo] google falha API key ausente');
  }

  console.log('[Geo] fallback ativado');

  // 2) Nominatim — busca livre com endereço completo
  try {
    const r = await geocodeNominatim(normalized);
    console.log(`[Geo] nominatim OK: lat=${r.lat} lng=${r.lng} formatted="${r.formatted}"`);
    return r;
  } catch (e) {
    console.warn(`[Geo] nominatim free-text FALHOU: ${e.message}`);
  }

  // 3) Nominatim structured — extrair rua/cidade/país do endereço e tentar busca estruturada
  //    Formato esperado: "Rua da Eira 148A, Albufeira, Portugal"
  const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const country = parts[parts.length - 1];
    const city = parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1];
    const street = parts[0];

    // 3a) Tentar com rua + cidade + país
    try {
      console.log(`[Geo] tentando nominatim structured: street="${street}" city="${city}" country="${country}"`);
      const r = await geocodeNominatimStructured({ street, city, country });
      console.log(`[Geo] nominatim structured OK: lat=${r.lat} lng=${r.lng} formatted="${r.formatted}"`);
      return r;
    } catch (e) {
      console.warn(`[Geo] nominatim structured FALHOU: ${e.message}`);
    }

    // 3b) Tentar sem número na rua (remover token alfanumérico final da rua)
    const streetNoNum = street.replace(/\s+\S+$/, '');
    if (streetNoNum !== street) {
      try {
        console.log(`[Geo] tentando nominatim structured sem número: street="${streetNoNum}" city="${city}" country="${country}"`);
        const r = await geocodeNominatimStructured({ street: streetNoNum, city, country });
        console.log(`[Geo] nominatim structured (sem número) OK: lat=${r.lat} lng=${r.lng} formatted="${r.formatted}"`);
        r.provider = 'nominatim_approx';
        return r;
      } catch (e) {
        console.warn(`[Geo] nominatim structured (sem número) FALHOU: ${e.message}`);
      }
    }

    // 3c) Tentar só cidade + país (fallback de último recurso — localização aproximada)
    try {
      const cityQuery = `${city}, ${country}`;
      console.log(`[Geo] fallback: tentando geocodificar só cidade: "${cityQuery}"`);
      const r = await geocodeNominatim(cityQuery);
      console.log(`[Geo] fallback cidade OK: lat=${r.lat} lng=${r.lng} formatted="${r.formatted}"`);
      r.provider = 'nominatim_city_fallback';
      return r;
    } catch (e) {
      console.warn(`[Geo] fallback cidade FALHOU: ${e.message}`);
    }
  }

  throw new Error(`Geocodificação falhou para "${normalized}" — nenhum provider retornou resultado`);
}

async function distanceMeters(lat1, lng1, lat2, lng2) {
  if (GOOGLE_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&mode=driving&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const el = data.rows?.[0]?.elements?.[0];
        if (el && el.status === 'OK' && el.distance?.value) {
          return { meters: el.distance.value, provider: 'google_dm' };
        }
      }
    } catch (e) {
      console.warn('[geocoding] distance matrix falhou:', e.message);
    }
  }
  return { meters: haversine(lat1, lng1, lat2, lng2), provider: 'haversine' };
}

function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < ((xj - xi) * (lng - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function normalizeNeighborhood(s) {
  if (!s) return '';
  return s.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// Sugestão de bairros / localidades para autocomplete.
// Retorna [{ name, lat, lng, source }] (limit 6).
async function suggestNeighborhoods(q) {
  const term = (q || '').trim();
  if (term.length < 2) return [];
  if (GOOGLE_KEY) {
    try {
      const u = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(term)}&types=geocode&key=${GOOGLE_KEY}`;
      const res = await fetch(u);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.predictions)) {
          // Places autocomplete não retorna lat/lng diretamente; o cliente fará geocode ao selecionar.
          return data.predictions.slice(0, 6).map(p => ({
            name: p.description,
            place_id: p.place_id,
            lat: null,
            lng: null,
            source: 'google'
          }));
        }
      }
    } catch (e) {
      console.warn('[geocoding] places autocomplete falhou, fallback Nominatim:', e.message);
    }
  }
  // Fallback: Nominatim
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PitomboLanches/1.0 (contact@pitombo.local)' }
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter(d => {
      // Prioriza tipos relevantes (suburb, neighbourhood, village, town, city, hamlet)
      const c = (d.class || '').toLowerCase();
      const t = (d.type || '').toLowerCase();
      return ['place', 'boundary'].includes(c) ||
        ['neighbourhood', 'suburb', 'village', 'town', 'city', 'hamlet', 'district'].includes(t);
    })
    .slice(0, 6)
    .map(d => {
      const a = d.address || {};
      const friendly = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.hamlet || d.name || d.display_name;
      return {
        name: friendly,
        full: d.display_name,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        source: 'nominatim'
      };
    });
}

module.exports = {
  geocode,
  distanceMeters,
  haversine,
  pointInPolygon,
  normalizeNeighborhood,
  suggestNeighborhoods,
  hasGoogleKey: () => !!GOOGLE_KEY
};
