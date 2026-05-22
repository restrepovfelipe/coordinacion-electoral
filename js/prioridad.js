// js/prioridad.js — Phase 14: Priorización tab (list + Leaflet map) + Admin config UI

// ── Estado colors ─────────────────────────────────────────────────────────────

const ESTADO_META = {
  CRITICO:    { label: 'CRÍTICO',    bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5', color: '#dc2626' },
  ATENCION:   { label: 'ATENCIÓN',   bg: '#ffedd5', fg: '#9a3412', border: '#fdba74', color: '#ea580c' },
  VIGILAR:    { label: 'VIGILAR',    bg: '#fef9c3', fg: '#854d0e', border: '#fde047', color: '#ca8a04' },
  CUBIERTO:   { label: 'CUBIERTO',   bg: '#dcfce7', fg: '#166534', border: '#86efac', color: '#16a34a' },
  BAJO_RIESGO:{ label: 'BAJO RIESGO',bg: '#f3f4f6', fg: '#4b5563', border: '#d1d5db', color: '#6b7280' },
};

function estadoPill(estado) {
  const m = ESTADO_META[estado] || ESTADO_META.BAJO_RIESGO;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;background:${m.bg};color:${m.fg};border:1px solid ${m.border}">${m.label}</span>`;
}

function nivelPill(nivel) {
  const colors = { ALTA: '#dc2626', MEDIA: '#ea580c', BAJA: '#4b5563' };
  const c = colors[nivel] || '#4b5563';
  return `<span style="color:${c};font-weight:700;font-size:11px">${nivel}</span>`;
}

// ── Municipio → ID lookup helper ──────────────────────────────────────────────

async function _getMuniId(muniName) {
  if (!window.api) return null;
  try {
    const munis = await api.get('/municipios');
    const m = munis.find(x => x.name === muniName || x.name === muniName.toUpperCase());
    return m ? m.id : null;
  } catch { return null; }
}

// ── T86: Priorización tab for a specific municipio ───────────────────────────

let _priorCurrentMuni = null;
let _priorCurrentPage = 1;
let _priorFilters = { nivel: '', cubierto: '', orderBy: 'votos', dir: 'desc' };
let _priorView = 'lista'; // 'lista' | 'mapa'
let _priorMapInstance = null;
let _priorMapCluster = null;

async function renderPrioridadTabForMuni(muniName) {
  const container = document.getElementById('ot-prioridad-inner');
  if (!container) return;

  _priorCurrentMuni = muniName;
  _priorCurrentPage = 1;
  _priorFilters = { nivel: '', cubierto: '', orderBy: 'votos', dir: 'desc' };
  _priorView = 'lista';

  container.innerHTML = `
    <div style="padding:12px 0">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div class="view-toggle" style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <button id="prio-btn-lista" onclick="priorSetView('lista')" style="padding:6px 14px;font-size:12px;background:var(--accent);color:#fff;border:none;cursor:pointer">Lista</button>
          <button id="prio-btn-mapa" onclick="priorSetView('mapa')" style="padding:6px 14px;font-size:12px;background:transparent;color:var(--fg);border:none;cursor:pointer">🗺 Mapa</button>
        </div>
        <select id="prio-sel-nivel" onchange="priorApplyFilters()" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">Todos los niveles</option>
          <option value="ALTA">ALTA</option>
          <option value="MEDIA">MEDIA</option>
          <option value="BAJA">BAJA</option>
        </select>
        <select id="prio-sel-cubierto" onchange="priorApplyFilters()" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">Todos</option>
          <option value="false">Solo no cubiertos</option>
          <option value="true">Solo cubiertos</option>
        </select>
        <select id="prio-sel-order" onchange="priorApplyFilters()" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
          <option value="votos:desc">Mayor votos primero</option>
          <option value="votos:asc">Menor votos primero</option>
          <option value="nombre:asc">Nombre A–Z</option>
          <option value="nombre:desc">Nombre Z–A</option>
        </select>
      </div>
      <div id="prio-content" style="min-height:200px">
        <div style="text-align:center;padding:40px;color:var(--t2)">Cargando...</div>
      </div>
    </div>`;

  await _loadPriorContent();
}

function priorSetView(view) {
  _priorView = view;
  document.getElementById('prio-btn-lista').style.background = view === 'lista' ? 'var(--accent)' : 'transparent';
  document.getElementById('prio-btn-lista').style.color = view === 'lista' ? '#fff' : 'var(--fg)';
  document.getElementById('prio-btn-mapa').style.background = view === 'mapa' ? 'var(--accent)' : 'transparent';
  document.getElementById('prio-btn-mapa').style.color = view === 'mapa' ? '#fff' : 'var(--fg)';
  _loadPriorContent();
}

function priorApplyFilters() {
  _priorFilters.nivel = document.getElementById('prio-sel-nivel')?.value || '';
  _priorFilters.cubierto = document.getElementById('prio-sel-cubierto')?.value || '';
  const orderVal = document.getElementById('prio-sel-order')?.value || 'votos:desc';
  [_priorFilters.orderBy, _priorFilters.dir] = orderVal.split(':');
  _priorCurrentPage = 1;
  _loadPriorContent();
}

function priorGoPage(page) {
  _priorCurrentPage = page;
  _loadPriorContent();
}
window.priorGoPage = priorGoPage;
window.priorSetView = priorSetView;
window.priorApplyFilters = priorApplyFilters;

async function _loadPriorContent() {
  const container = document.getElementById('prio-content');
  if (!container || !window.api) return;

  if (_priorView === 'mapa') {
    await _renderPriorMapa(container);
    return;
  }

  container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--t2)">Cargando...</div>`;

  try {
    const params = { page: _priorCurrentPage, perPage: 50, orderBy: _priorFilters.orderBy, dir: _priorFilters.dir };
    if (_priorFilters.nivel) params.nivel = _priorFilters.nivel;
    if (_priorFilters.cubierto) params.cubierto = _priorFilters.cubierto;

    // Get municipio ID to add as a filter hint (backend uses scope anyway)
    const data = await api.getPrioridadPuestos(params);

    _renderPriorList(container, data);
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:#dc2626">Error cargando datos: ${err.message}</div>`;
  }
}

function _renderPriorList(container, data) {
  const { items, total, page } = data;
  const totalPages = Math.ceil(total / 50);

  let html = `
    <div style="font-size:11px;color:var(--t2);margin-bottom:8px">${total} puestos encontrados</div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:var(--bg2);border-bottom:2px solid var(--border)">
          <th style="padding:8px 10px;text-align:left;font-weight:600">Puesto</th>
          <th style="padding:8px 6px;text-align:left;font-weight:600">Nivel</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Votos</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Mesas</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Testigos</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Requeridos</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Cobertura</th>
          <th style="padding:8px 6px;text-align:center;font-weight:600">Estado</th>
        </tr>
      </thead>
      <tbody>`;

  if (!items.length) {
    html += `<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--t2)">Sin resultados</td></tr>`;
  }

  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? '' : 'background:var(--bg2)';
    html += `
      <tr style="${bg};border-bottom:1px solid var(--border)">
        <td style="padding:7px 10px;max-width:220px">
          <div style="font-weight:500">${escHtml(item.puestoNombre)}</div>
          ${item.comunaNombre ? `<div style="font-size:10px;color:var(--t2)">${escHtml(item.comunaNombre)}</div>` : ''}
        </td>
        <td style="padding:7px 6px">${nivelPill(item.nivelPrioridad)}</td>
        <td style="padding:7px 6px;text-align:center">${item.votosTotal.toLocaleString('es-CO')}</td>
        <td style="padding:7px 6px;text-align:center">${item.mesas}</td>
        <td style="padding:7px 6px;text-align:center">${item.testigosAsignados}</td>
        <td style="padding:7px 6px;text-align:center">${item.testigosRequeridos}</td>
        <td style="padding:7px 6px;text-align:center;font-weight:600">${item.coberturaPct}%</td>
        <td style="padding:7px 6px;text-align:center">${estadoPill(item.estado)}</td>
      </tr>`;
  });

  html += `</tbody></table></div>`;

  // Pagination
  if (totalPages > 1) {
    html += `<div style="display:flex;gap:6px;justify-content:center;margin-top:14px;align-items:center;flex-wrap:wrap">`;
    if (page > 1) html += `<button onclick="priorGoPage(${page - 1})" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer;font-size:12px">← Anterior</button>`;
    html += `<span style="font-size:12px;color:var(--t2)">Página ${page} de ${totalPages}</span>`;
    if (page < totalPages) html += `<button onclick="priorGoPage(${page + 1})" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer;font-size:12px">Siguiente →</button>`;
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ── T87: Leaflet map for prioridad ────────────────────────────────────────────

async function _renderPriorMapa(container) {
  container.innerHTML = `
    <div id="prio-map-wrap" style="position:relative">
      <div id="prio-map" style="height:520px;border-radius:8px;overflow:hidden"></div>
      <div id="prio-map-legend" style="position:absolute;bottom:24px;right:10px;z-index:999;background:#fff;border:1px solid #ccc;border-radius:8px;padding:10px 14px;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
        <div style="font-weight:700;margin-bottom:6px">Estado</div>
        ${Object.entries(ESTADO_META).map(([k, m]) =>
          `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="width:12px;height:12px;border-radius:50%;background:${m.color};display:inline-block"></span>
            ${m.label}
          </div>`
        ).join('')}
      </div>
    </div>`;

  try {
    const data = await api.getPrioridadMapa();
    _initPriorMap(data);
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:#dc2626">Error cargando mapa: ${err.message}</div>`;
  }
}

function _initPriorMap(puestos) {
  const mapEl = document.getElementById('prio-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Destroy previous map if any
  if (_priorMapInstance) {
    _priorMapInstance.remove();
    _priorMapInstance = null;
    _priorMapCluster = null;
  }

  const map = L.map('prio-map');
  _priorMapInstance = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  // Use markercluster if available, else plain layer
  let layer;
  if (typeof L.markerClusterGroup !== 'undefined') {
    layer = L.markerClusterGroup({ chunkedLoading: true });
    _priorMapCluster = layer;
  } else {
    layer = L.featureGroup();
  }

  puestos.forEach(p => {
    const m = ESTADO_META[p.estado] || ESTADO_META.BAJO_RIESGO;
    const icon = L.circleMarker([p.lat, p.lng], {
      radius: 8,
      fillColor: m.color,
      color: '#fff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85,
    });

    const pct = p.testigosRequeridos > 0
      ? Math.min(100, Math.round(p.testigosAsignados / p.testigosRequeridos * 100))
      : (p.testigosAsignados > 0 ? 100 : 0);

    icon.bindPopup(`
      <div style="font-size:12px;min-width:180px">
        <div style="font-weight:700;margin-bottom:4px">${escHtml(p.nombre)}</div>
        <div style="margin-bottom:6px">${estadoPill(p.estado)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:11px">
          <span style="color:#666">Votos potenciales:</span><span style="font-weight:600">${p.votosTotal.toLocaleString('es-CO')}</span>
          <span style="color:#666">Mesas:</span><span style="font-weight:600">${p.mesas}</span>
          <span style="color:#666">Testigos asignados:</span><span style="font-weight:600">${p.testigosAsignados}</span>
          <span style="color:#666">Requeridos:</span><span style="font-weight:600">${p.testigosRequeridos}</span>
          <span style="color:#666">Cobertura:</span><span style="font-weight:600">${pct}%</span>
        </div>
      </div>
    `);

    layer.addLayer ? layer.addLayer(icon) : icon.addTo(layer);
  });

  layer.addTo(map);

  // Fit bounds to visible markers
  if (puestos.length > 0) {
    const bounds = L.latLngBounds(puestos.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });
  } else {
    map.setView([6.25, -75.56], 10); // Medellín default
  }
}

// ── T89: Admin config UI ──────────────────────────────────────────────────────

function openPrioridadConfigAdmin() {
  if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'SUPER_ADMIN') return;
  _renderPrioridadConfigModal();
}
window.openPrioridadConfigAdmin = openPrioridadConfigAdmin;
window.savePrioridadConfig = savePrioridadConfig;
window.closePrioridadConfigModal = closePrioridadConfigModal;

function closePrioridadConfigModal() {
  const el = document.getElementById('modal-prioridad-config');
  if (el) el.remove();
}

async function _renderPrioridadConfigModal() {
  let cfg;
  try {
    cfg = await api.getPrioridadConfig();
  } catch (err) {
    alert('Error cargando configuración: ' + (err.message || err));
    return;
  }

  const existing = document.getElementById('modal-prioridad-config');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-prioridad-config';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:24px;width:400px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:15px;font-weight:700">Configuración de Prioridades</div>
        <button onclick="closePrioridadConfigModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--t2)">×</button>
      </div>
      <div id="prio-cfg-msg" style="display:none;margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px"></div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:14px">
        Última actualización: ${cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString('es-CO') : '—'}
      </div>
      <div style="display:grid;gap:12px">
        ${_cfgField('Umbral ALTA (votos >)', 'umbralAlto', cfg.umbralAlto, 'number')}
        ${_cfgField('Umbral MEDIA (votos >)', 'umbralMedio', cfg.umbralMedio, 'number')}
        ${_cfgField('Ratio testigos/mesa ALTA', 'ratioMesasAlta', cfg.ratioMesasAlta, 'number', '0.01')}
        ${_cfgField('Ratio testigos/mesa MEDIA', 'ratioMesasMedia', cfg.ratioMesasMedia, 'number', '0.01')}
        ${_cfgField('Ratio testigos/mesa BAJA', 'ratioMesasBaja', cfg.ratioMesasBaja, 'number', '0.01')}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
        <button onclick="closePrioridadConfigModal()" style="padding:8px 18px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-size:13px">Cancelar</button>
        <button onclick="savePrioridadConfig()" style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _cfgField(label, id, value, type, step) {
  return `
    <div>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">${label}</label>
      <input id="pcfg-${id}" type="${type}" value="${value}" ${step ? `step="${step}"` : ''}
        style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg);color:var(--fg);box-sizing:border-box">
    </div>`;
}

async function savePrioridadConfig() {
  const msg = document.getElementById('prio-cfg-msg');

  const get = (id, asFloat) => {
    const v = document.getElementById(`pcfg-${id}`)?.value;
    return asFloat ? parseFloat(v) : parseInt(v, 10);
  };

  const dto = {
    umbralAlto:      get('umbralAlto'),
    umbralMedio:     get('umbralMedio'),
    ratioMesasAlta:  get('ratioMesasAlta', true),
    ratioMesasMedia: get('ratioMesasMedia', true),
    ratioMesasBaja:  get('ratioMesasBaja', true),
  };

  if (dto.umbralAlto <= dto.umbralMedio) {
    msg.style.background = '#fee2e2'; msg.style.color = '#991b1b';
    msg.textContent = 'El umbral ALTA debe ser mayor que el umbral MEDIA';
    msg.style.display = 'block';
    return;
  }

  msg.style.background = '#fef9c3'; msg.style.color = '#854d0e';
  msg.textContent = 'Guardando y recalculando prioridades...';
  msg.style.display = 'block';

  try {
    await api.updatePrioridadConfig(dto);
    msg.style.background = '#dcfce7'; msg.style.color = '#166534';
    msg.textContent = '✓ Configuración guardada. Prioridades actualizando...';
    setTimeout(() => closePrioridadConfigModal(), 1500);
  } catch (err) {
    msg.style.background = '#fee2e2'; msg.style.color = '#991b1b';
    msg.textContent = 'Error: ' + (err.body?.message || err.message || 'desconocido');
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
