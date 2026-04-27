// ═══════════════════════════════════════════════════════════════
// Pitombo Lanches — Map helpers (Leaflet wrapper)
// ═══════════════════════════════════════════════════════════════
// Pequeno wrapper sobre Leaflet para os painéis de delivery.
// Não exporta API ES; expõe `window.PitomboMap`.

(function () {
  'use strict';

  const PALETTE = ['#dc2626', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

  function ensureLeaflet() {
    if (typeof L === 'undefined') {
      console.error('[PitomboMap] Leaflet não carregado. Verifique se os <script> de leaflet estão no head.');
      return false;
    }
    return true;
  }

  function paletteColor(i) {
    if (typeof i !== 'number' || i < 0) i = 0;
    return PALETTE[i % PALETTE.length];
  }

  // Cria um mapa Leaflet num container já presente no DOM, com tiles OSM
  // opts: { lat, lng, zoom, scrollWheelZoom }
  function createMap(container, opts = {}) {
    if (!ensureLeaflet()) return null;
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) {
      console.error('[PitomboMap] container não encontrado:', container);
      return null;
    }
    if (el._leaflet_id) {
      // already initialized — caller should remove first
      console.warn('[PitomboMap] container já tem mapa — remover antes de re-criar');
    }
    const map = L.map(el, {
      center: [opts.lat ?? 37.0891, opts.lng ?? -8.2503],
      zoom: opts.zoom ?? 12,
      scrollWheelZoom: opts.scrollWheelZoom !== false,
      zoomControl: opts.zoomControl !== false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    // garante que tiles renderizam após display:block tardio
    setTimeout(() => map.invalidateSize(), 80);
    return map;
  }

  // Desenha um círculo de raio (metros). Retorna o layer para poder remover depois.
  function drawCircle(map, latlng, radiusMeters, style = {}) {
    if (!map) return null;
    return L.circle([latlng.lat, latlng.lng], {
      radius: radiusMeters,
      color: style.color || '#3b82f6',
      weight: style.weight || 2,
      fillColor: style.fillColor || style.color || '#3b82f6',
      fillOpacity: style.fillOpacity ?? 0.18,
      interactive: !!style.popup
    })
      .addTo(map)
      .bindPopup(style.popup || '');
  }

  function drawPolygon(map, points, style = {}) {
    if (!map || !Array.isArray(points) || points.length < 3) return null;
    const latlngs = points.map(p => [p.lat, p.lng]);
    const layer = L.polygon(latlngs, {
      color: style.color || '#3b82f6',
      weight: style.weight || 2,
      fillColor: style.fillColor || style.color || '#3b82f6',
      fillOpacity: style.fillOpacity ?? 0.22
    }).addTo(map);
    if (style.popup) layer.bindPopup(style.popup);
    if (style.tooltip) layer.bindTooltip(style.tooltip, { sticky: true });
    if (typeof style.onClick === 'function') layer.on('click', style.onClick);
    return layer;
  }

  function drawMarker(map, latlng, style = {}) {
    if (!map) return null;
    const m = L.marker([latlng.lat, latlng.lng], { draggable: !!style.draggable })
      .addTo(map);
    if (style.popup) m.bindPopup(style.popup);
    return m;
  }

  // Liga um controle Leaflet.Draw para desenhar APENAS polígonos.
  // onCreate({lat, lng}[]) é chamado com os vertices ao usuário fechar o polígono.
  // Retorna o featureGroup onde os layers ficam.
  function enablePolygonDraw(map, onCreate, onCreateLayer) {
    if (!map || typeof L.Control.Draw === 'undefined') {
      console.error('[PitomboMap] Leaflet.Draw não disponível');
      return null;
    }
    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    const ctrl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#1976d2', weight: 2, fillOpacity: 0.2 }
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false
      },
      edit: { featureGroup: drawn, edit: false, remove: false }
    });
    map.addControl(ctrl);

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      const latlngs = layer.getLatLngs()[0] || [];
      const points = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
      // Não adicionamos automaticamente — deixamos o caller decidir
      if (typeof onCreate === 'function') onCreate(points, layer);
      if (typeof onCreateLayer === 'function') onCreateLayer(layer, drawn);
    });

    return { control: ctrl, group: drawn };
  }

  // Liga um vertex-edit handler num polygon existente.
  // onEnd(updatedPoints) chamado ao terminar a edição.
  function enablePolygonEdit(layer, onEnd) {
    if (!layer || typeof layer.editing === 'undefined') {
      console.warn('[PitomboMap] camada sem suporte a editing — Leaflet.Draw.Edit pode não estar carregado');
      return null;
    }
    layer.editing.enable();
    layer.on('edit', () => {
      const latlngs = layer.getLatLngs()[0] || [];
      const points = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
      if (typeof onEnd === 'function') onEnd(points);
    });
    return {
      stop: () => layer.editing.disable()
    };
  }

  // Wrapper para destruir um mapa Leaflet com segurança.
  function destroyMap(map) {
    if (!map) return;
    try { map.off(); map.remove(); } catch (e) { /* nbsp */ }
  }

  window.PitomboMap = {
    createMap,
    drawCircle,
    drawPolygon,
    drawMarker,
    enablePolygonDraw,
    enablePolygonEdit,
    destroyMap,
    paletteColor
  };
})();
