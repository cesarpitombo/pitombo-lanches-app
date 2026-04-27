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

async function geocodeGoogle(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('google geocode http ' + res.status);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error('google geocode: ' + data.status);
  }
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted: r.formatted_address,
    provider: 'google'
  };
}

async function geocodeNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PitomboLanches/1.0 (contact@pitombo.local)' }
  });
  if (!res.ok) throw new Error('nominatim http ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('nominatim: no result');
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    formatted: data[0].display_name,
    provider: 'nominatim'
  };
}

async function geocode(address) {
  if (!address || !address.trim()) throw new Error('endereço vazio');
  if (GOOGLE_KEY) {
    try { return await geocodeGoogle(address); }
    catch (e) { console.warn('[geocoding] google falhou, fallback Nominatim:', e.message); }
  }
  return await geocodeNominatim(address);
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
