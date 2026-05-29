// ═══ XSS ESCAPE HELPER ═══
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══ READ-ONLY MODE ═══
function _isReadOnly() { return window.CURRENT_USER?.role === 'VIEWER'; }

// ═══ WRITE ERROR BADGE ═══
// Shows a temporary sync-badge error when a background API write fails.
function _onWriteError(label, err) {
  console.error(label, err?.status ?? err?.code ?? err?.message, err);
  if (typeof setSyncBadge === 'function') {
    setSyncBadge('error', '⚠ Error al guardar');
    setTimeout(() => setSyncBadge('', 'Sin cambios'), 5000);
  }
}

// ═══ PUESTO ID CACHE ═══
// Cache: municipio name → { puestoName → backendId, _muniId, _ccIds: { ccName → id } }
const _puestoIdCache = {};
// Cache: zona name → backendId (loaded once via /api/zonas)
const _zonaIdCache = {};
// Expose cache references on window for test instrumentation (mutation only)
window._puestoIdCacheRef = _puestoIdCache;
window._zonaIdCacheRef   = _zonaIdCache;
async function _loadZonaIds() {
  if (Object.keys(_zonaIdCache).length > 0) return;
  if (!window.api || !window.CURRENT_USER) return;
  try {
    const zonas = await api.get('/zonas');
    for (const z of zonas) { _zonaIdCache[z.name] = z.id; _zonaIdCache[(z.name || '').toUpperCase()] = z.id; }
  } catch (err) { console.warn('[_loadZonaIds] failed', err?.status); }
}

// ═══ TESTIGO COUNTS (real-time dashboard counters) ═══
// Populated from GET /api/dashboard/testigos-counts; updated via SSE.
const _testigoCountsByMuni = {}; // { [municipioName]: number }
// Populated from GET /api/dashboard/stats (Phase 14); updated via SSE.
const _dashboardStatsByMuni = {}; // { [municipioName]: MunicipioStat }
let _muniIdToName = null; // { [municipioId]: municipioName } — built lazily
// Amendment A24 — Opción A: FLOOR(capacidadCubrir / totMesas * 100), no 100% cap.
function _coveragePct(capacidadCubrir, totMesas) {
  if (!totMesas) return 0;
  return Math.floor((capacidadCubrir / totMesas) * 100);
}

async function _buildMuniIdMap() {
  if (_muniIdToName) return _muniIdToName;
  try {
    const munis = await api.get('/municipios');
    _muniIdToName = {};
    for (const m of munis) {
      _muniIdToName[m.id] = (m.name || '').toUpperCase();
    }
  } catch {
    _muniIdToName = {};
  }
  return _muniIdToName;
}

async function loadTestigoCounts() {
  if (!window.api || !window.CURRENT_USER) return;
  try {
    const map = await _buildMuniIdMap();
    const counts = await api.getTestigoCounts();
    for (const { municipioId, count } of counts) {
      const name = map[municipioId];
      if (name) _testigoCountsByMuni[name] = count;
    }
    _applyTestigoCountsToDom();
  } catch (err) {
    console.warn('[app] loadTestigoCounts failed:', err);
  }
}

function updateDashboardTestigoCounts(counts) {
  if (!_muniIdToName) return;
  for (const { municipioId, count } of counts) {
    const name = _muniIdToName[municipioId];
    if (name) _testigoCountsByMuni[name] = count;
  }
  _applyTestigoCountsToDom();
}

function _applyTestigoCountsToDom() {
  // Update counters in-place if overview cards are currently visible.
  document.querySelectorAll('[data-testigo-count]').forEach(el => {
    const name = el.dataset.testigoCount;
    if (name && _testigoCountsByMuni[name] !== undefined) {
      el.textContent = _testigoCountsByMuni[name];
    }
  });
}

async function loadDashboardStats() {
  if (!window.api || !window.CURRENT_USER) return;
  try {
    const map = await _buildMuniIdMap();
    const stats = await api.getDashboardStats();
    for (const s of stats) {
      const name = map[s.municipioId];
      if (name) _dashboardStatsByMuni[name] = s;
    }
    _applyDashboardStatsToDom();
  } catch (err) {
    console.warn('[app] loadDashboardStats failed:', err);
  }
}

function updateDashboardStats(stats) {
  if (!_muniIdToName) return;
  for (const s of stats) {
    const name = _muniIdToName[s.municipioId];
    if (name) _dashboardStatsByMuni[name] = s;
  }
  _applyDashboardStatsToDom();
}

function _applyDashboardStatsToDom() {
  document.querySelectorAll('[data-cobertura-muni]').forEach(el => {
    const name = el.dataset.coberturaMuni;
    const s = _dashboardStatsByMuni[name];
    if (s !== undefined) {
      el.textContent = s.coberturaPct + '%';
    }
  });
  // Re-render overview so subregion totals also pick up the fresh stats
  if (document.getElementById('ov-wrap')) renderOV();
}

// Load puesto backend IDs for a municipality from the API
async function loadPuestoIds(muniName) {
  if (!window.api || !window.CURRENT_USER) return;
  // Re-load if cache exists but pk→id mapping was not built (legacy cache without pk keys)
  if (_puestoIdCache[muniName] && _puestoIdCache[muniName]._pkMapped) return;
  if (_puestoIdCache[muniName] && !_puestoIdCache[muniName]._pkMapped) {
    delete _puestoIdCache[muniName]; // force reload to build pk→id map
  }

  try {
    // Get municipio ID first
    const munis = await api.get(`/municipios`);
    const muni = munis.find(m => m.name === muniName || m.name === muniName.toUpperCase());
    if (!muni) return;

    // Get puestos and comunas for this municipio
    const [puestos, comunas] = await Promise.all([
      api.get(`/puestos?municipioId=${muni.id}`),
      api.get(`/comunas?municipioId=${muni.id}`),
    ]);
    _puestoIdCache[muniName] = {};
    _puestoIdCache[muniName]._muniId = muni.id;
    _puestoIdCache[muniName]._pkMapped = true;
    // Build name→id map
    const nameToId = {};
    for (const p of puestos) {
      _puestoIdCache[muniName][p.name.toUpperCase()] = p.id;
      nameToId[p.name.toUpperCase()] = p.id;
    }
    // Also build pk→id map by cross-referencing RAW data
    if (typeof RAW !== 'undefined' && RAW[muniName]) {
      for (const rawPuestos of Object.values(RAW[muniName])) {
        for (const rp of rawPuestos) {
          const id = nameToId[(rp.puesto || '').toUpperCase()];
          if (id) _puestoIdCache[muniName][`${rp.dd}_${rp.mm}_${rp.zz}_${rp.pp}`] = id;
        }
      }
    }
    _puestoIdCache[muniName]._ccIds = {};
    for (const c of (comunas || [])) {
      _puestoIdCache[muniName]._ccIds[c.name] = c.id;
      _puestoIdCache[muniName]._ccIds[(c.name || '').toUpperCase()] = c.id;
    }
  } catch (err) {
    console.warn('Could not load puesto IDs for', muniName, err && err.status);
  }
}

function getPuestoBackendId(muniName, puestoRawName) {
  const cache = _puestoIdCache[muniName];
  if (!cache) return null;
  // Try exact match first, then uppercase match
  return cache[puestoRawName] || cache[puestoRawName?.toUpperCase()] || null;
}

// Resolve puestoId from a pk string (dd_mm_zz_pp) by reverse-looking up RAW.
function getPuestoIdByPk(n, pkStr) {
  for (const puestos of Object.values(RAW[n] || {})) {
    for (const p of puestos) {
      if (pk(p) === pkStr) return getPuestoBackendId(n, p.puesto);
    }
  }
  return null;
}

// Resolve the backend integer ID for a coordinator scope from MCX context fields.
function _coordScopeId(type, muniName, ck, k, zonaNombre) {
  if (type === 'muni') return _puestoIdCache[muniName]?._muniId ?? null;
  if (type === 'cc') { const ids = _puestoIdCache[muniName]?._ccIds; return ids ? (ids[ck] ?? ids[(ck || '').toUpperCase()] ?? null) : null; }
  if (type === 'p') return getPuestoBackendId(muniName, k);
  if (type === 'zona') return _zonaIdCache[zonaNombre] ?? _zonaIdCache[(zonaNombre || '').toUpperCase()] ?? null;
  return null;
}

// Refresh the municipio coordinator display in the topbar (mh-cv / mh-phone-wa)
// from the live backend. Falls back silently if the backend is unreachable.
async function refreshCoordDisplay(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const muniId = _puestoIdCache[n]?._muniId;
  if (!muniId) return;
  try {
    const disp = await api.get(`/coordinador/municipio/${muniId}/display`);
    const el = document.getElementById('mh-cv');
    const pw = document.getElementById('mh-phone-wa');
    if (!el) return;
    const nombre = disp.nombre;
    const telefono = disp.telefono;
    el.textContent = nombre || '—';
    if (pw) {
      if (telefono) {
        pw.innerHTML = `<div class="cp">${esc(telefono)}<a class="wa-btn" href="https://wa.me/57${telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a></div>`;
      } else if (disp.source === 'user') {
        pw.innerHTML = `<a href="/usuarios.html" style="font-size:10px;color:var(--blue)">👁 Ver en usuarios</a>`;
      } else {
        pw.innerHTML = '';
      }
    }
  } catch (err) {
    console.warn('[refreshCoordDisplay] failed', err?.status);
  }
}

// ═══ STATE ═══
let ST = {};
let _initialized = false;
const ALL_MUNIS = Object.values(REGIONES).flat();
let CLOSED_REGIONS = new Set(Object.keys(REGIONES));
const OPEN_ITABS = {};

// Fix puestos where total=0 but mujeres+hombres have real values
(function _fixRawTotals() {
  Object.values(RAW).forEach(comunas => {
    Object.values(comunas).forEach(puestos => {
      puestos.forEach(p => {
        if (!p.total && ((p.mujeres || 0) + (p.hombres || 0)) > 0) {
          p.total = (p.mujeres || 0) + (p.hombres || 0);
        }
      });
    });
  });
})();

function loadLocalSt() {
  try { return JSON.parse(localStorage.getItem('amva26v2') || '{}'); } catch (e) { return {}; }
}
function saveLocalSt() {
  try { localStorage.setItem('amva26v2', JSON.stringify(ST)); } catch (e) {}
}

function gs(n) {
  if (!ST[n]) ST[n] = { coord: '', phone: '', comunas: {}, puestos: {}, testigos: {}, movilidad: {}, abogados: {}, refrigerios: {}, comparendos: {} };
  return ST[n];
}

function _innerPreload() {
  let changed = false;
  const forceUpdate = !ST._preload_version || ST._preload_version < PRELOAD_VERSION;

  // Preload movilidad (carros/motos + responsable) per commune
  for (const [muni, comunas] of Object.entries(MOV_PRELOAD)) {
    for (const [ck, mov] of Object.entries(comunas)) {
      const s = gs(muni);
      if (!s.movilidad) s.movilidad = {};
      if (!s.movilidad[ck] || (!s.movilidad[ck].responsables?.length && !s.movilidad[ck].motos_nec && !s.movilidad[ck].carros_nec)) {
        s.movilidad[ck] = {
          motos_nec: mov.motos_nec || 0,
          carros_nec: mov.carros_nec || 0,
          responsables: mov.responsables || []
        };
        changed = true;
      }
    }
  }

  // Preload zone, commune, and puesto coordinators
  for (const [muni, data] of Object.entries(COORD_PRELOAD)) {
    const s = gs(muni);
    // Zone coordinators (Medellín zonas geográficas)
    if (!s.zonas) s.zonas = {};
    for (const [zonaNombre, zd] of Object.entries(data.zonas || {})) {
      if (!s.zonas[zonaNombre]) s.zonas[zonaNombre] = {};
      if (forceUpdate || (!s.zonas[zonaNombre].coord && !s.zonas[zonaNombre].phone)) {
        s.zonas[zonaNombre].coord = zd.coord || '';
        s.zonas[zonaNombre].phone = zd.phone || '';
        changed = true;
      }
    }
    // Commune coordinators
    if (!s.comunas) s.comunas = {};
    for (const [ck, cd] of Object.entries(data.comunas || {})) {
      if (!s.comunas[ck]) s.comunas[ck] = {};
      if (forceUpdate || (!s.comunas[ck].coord && !s.comunas[ck].phone)) {
        s.comunas[ck].coord = cd.coord || '';
        s.comunas[ck].phone = cd.phone || '';
        changed = true;
      }
    }
    // Puesto coordinators
    if (!s.puestos) s.puestos = {};
    for (const [pk_str, pd] of Object.entries(data.puestos || {})) {
      if (!s.puestos[pk_str]) s.puestos[pk_str] = {};
      if (forceUpdate || (!s.puestos[pk_str].coord && !s.puestos[pk_str].phone)) {
        s.puestos[pk_str].coord = pd.coord || '';
        s.puestos[pk_str].phone = pd.phone || '';
        changed = true;
      }
    }
  }

  if (forceUpdate) { ST._preload_version = PRELOAD_VERSION; changed = true; }
  if (changed) saveLocalSt();
  return forceUpdate;
}

function pk(p) { return `${p.dd}_${p.mm}_${p.zz}_${p.pp}`; }
function cid(n, ck) { return 'cc_' + btoa(unescape(encodeURIComponent(n + ck))).replace(/[^a-z0-9]/gi, ''); }


// ═══ SIDEBAR ═══
let CUR = null, OPEN_CC = new Set(), OPEN_Z = new Set();

function getAccessibleMunis() {
  // Returns array of municipality names the current user can see
  if (!window.CURRENT_USER) return Object.keys(RAW);

  const role = window.CURRENT_USER.role;

  // SUPER_ADMIN and REGIONAL_COORDINATOR see all
  if (role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR') {
    return Object.keys(RAW);
  }

  // Others: filter based on scopes
  // For now, show all municipalities (we don't have a scope→municipality mapping in the frontend)
  // TODO: filter by user scopes when scopeId→municipio mapping is available
  return Object.keys(RAW);
}
function filterSB(q) {
  const ql = (q || '').toUpperCase();
  document.querySelectorAll('.sb-item').forEach(el => { el.style.display = el.dataset.nm.includes(ql) ? '' : 'none'; });
  document.querySelectorAll('.sb-region-header').forEach(rh => {
    const anyVisible = [...rh.nextElementSibling?.querySelectorAll('.sb-item') || []].some(el => el.style.display !== 'none');
    rh.style.display = (ql && !anyVisible) ? 'none' : '';
    if (rh.nextElementSibling) rh.nextElementSibling.style.display = (ql && !anyVisible) ? 'none' : '';
  });
}
function toggleSB() { const sb = document.querySelector('.sb'); const collapsed = sb.classList.toggle('collapsed'); document.querySelectorAll('.sb-toggle').forEach(btn => { btn.textContent = collapsed ? '☰' : '✕'; }); }
function buildSB() {
  const list = document.getElementById('sb-list'); list.innerHTML = '';
  const accessibleMunis = new Set(getAccessibleMunis());
  Object.entries(REGIONES).forEach(([region, munis]) => {
    const validMusis = munis.filter(n => RAW[n] && accessibleMunis.has(n));
    if (!validMusis.length) return;
    const isOpen = !CLOSED_REGIONS.has(region);
    const rh = document.createElement('div');
    rh.className = 'sb-region-header' + (isOpen ? ' open' : '');
    rh.innerHTML = `<span>${region}</span><span class="sb-region-toggle">${isOpen ? '▾' : '▸'}</span>`;
    rh.onclick = () => { if (CLOSED_REGIONS.has(region)) CLOSED_REGIONS.delete(region); else CLOSED_REGIONS.add(region); buildSB(); };
    list.appendChild(rh);
    const grp = document.createElement('div');
    grp.className = 'sb-region-group';
    if (!isOpen) grp.style.display = 'none';
    validMusis.forEach(n => {
      const s = gs(n);
      const totP = Object.values(RAW[n]).reduce((a, c) => a + c.length, 0);
      const d = document.createElement('div');
      d.className = 'sb-item' + (n === CUR ? ' on' : ''); d.dataset.nm = n; d.onclick = () => selMuni(n);
      d.innerHTML = `<div class="sb-nm">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div><div class="sb-mt">${totP} puestos</div>${s.coord ? `<div class="sb-cd">👤 ${esc(s.coord)}</div>` : ''}`;
      grp.appendChild(d);
    });
    list.appendChild(grp);
  });
}
function selMuni(n) {
  CUR = n; buildSB(); renderMuni(n);
  loadPuestoIds(n).then(() => { refreshCoordDisplay(n); loadCoordsForMuni(n); loadAbogadosForMuni(n); loadMovilidadForMuni(n); loadRefrigeriosForMuni(n); loadComparendosForMuni(n); });
  _loadZonaIds().then(() => loadCoordsForMuni(n));
  loadAllTestigosForMuni(n);
}

// Load all zone/commune coordinators from the backend and update localStorage.
// Called after IDs are available so other users always see the latest data.
async function loadCoordsForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  // Need both puestoId cache (for comunas) and zonaIdCache ready
  const ccIds = _puestoIdCache[n]?._ccIds;
  const muniId = _puestoIdCache[n]?._muniId;
  if (!ccIds && Object.keys(_zonaIdCache).length === 0) return;
  const s = gs(n);
  let changed = false;
  // Fetch commune coordinators (RAW keys are commune names)
  const communeFetches = Object.keys(RAW[n] || {}).map(async ck => {
    const comunaId = ccIds?.[ck] ?? ccIds?.[(ck || '').toUpperCase()];
    if (!comunaId) return;
    try {
      const disp = await api.get(`/coordinador/comuna/${comunaId}/display`);
      if (!s.comunas) s.comunas = {};
      s.comunas[ck] = { coord: disp.nombre || '', phone: disp.telefono || '' };
      changed = true;
    } catch(e) {}
  });
  // Fetch zone coordinators separately (stored in s.zonas, keyed by zone name)
  const zoneNames = Object.keys(_zonaIdCache).filter(k => k !== k.toUpperCase());
  const zoneFetches = zoneNames.map(async zonaNombre => {
    const zonaId = _zonaIdCache[zonaNombre];
    if (!zonaId) return;
    try {
      const disp = await api.get(`/coordinador/zona/${zonaId}/display`);
      if (!s.zonas) s.zonas = {};
      s.zonas[zonaNombre] = { coord: disp.nombre || '', phone: disp.telefono || '' };
      changed = true;
    } catch(e) {}
  });
  // Fetch all puesto coordinators in one batch call
  const puestoFetch = (async () => {
    if (!muniId) return;
    try {
      const list = await api.get(`/coordinador/puestos-by-muni/${muniId}`);
      if (!Array.isArray(list) || list.length === 0) return;
      // Build reverse map: puestoId → pk_str using _puestoIdCache + RAW
      const idToPk = {};
      for (const puestos of Object.values(RAW[n] || {})) {
        for (const p of puestos) {
          const pid = _puestoIdCache[n]?.[p.puesto.toUpperCase()];
          if (pid) idToPk[pid] = `${p.dd}_${p.mm}_${p.zz}_${p.pp}`;
        }
      }
      if (!s.puestos) s.puestos = {};
      for (const { puestoId, nombre, telefono, tag } of list) {
        const pkStr = idToPk[puestoId];
        if (!pkStr) continue;
        s.puestos[pkStr] = { ...(s.puestos[pkStr] || {}), coord: nombre || '', phone: telefono || '', tag: tag || 'n' };
        changed = true;
      }
    } catch(e) {}
  })();

  await Promise.all([...communeFetches, ...zoneFetches, puestoFetch]);
  if (changed) { saveLocalSt(); if (n === CUR) rerenderIfNotEditing(); }
}

// Load abogados for a municipality from the backend so all users see the latest data.
async function loadAbogadosForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const muniId = _puestoIdCache[n]?._muniId;
  if (!muniId) return;
  try {
    const abogados = await api.get(`/municipios/${muniId}/abogados`);
    if (!Array.isArray(abogados) || abogados.length === 0) return;
    const s = gs(n);
    if (!s.abogados) s.abogados = {};
    // Reset arrays for this muni so we get a clean load from backend
    const seenCks = new Set(abogados.map(a => a.notes).filter(Boolean));
    seenCks.forEach(ck => { s.abogados[ck] = []; });
    let changed = false;
    for (const ab of abogados) {
      const ck = ab.notes; // commune key stored in notes field
      if (!ck) continue;
      if (!Array.isArray(s.abogados[ck])) s.abogados[ck] = [];
      s.abogados[ck].push({
        nombre: ab.name || '',
        telefono: ab.phone || '',
        _backendId: ab.id,
      });
      changed = true;
    }
    if (changed) { saveLocalSt(); if (n === CUR) rerenderIfNotEditing(); }
  } catch(e) {}
}
// Helper: ensure s.abogados[ck] is always an array (migrate old single-object format)
function _abogList(s, ck) {
  if (!s.abogados) s.abogados = {};
  const cur = s.abogados[ck];
  if (!cur) { s.abogados[ck] = []; }
  else if (!Array.isArray(cur)) { s.abogados[ck] = cur.nombre ? [{ nombre: cur.nombre, telefono: cur.telefono || '', _backendId: cur._backendId || null }] : []; }
  return s.abogados[ck];
}

function goHome() {
  CUR = null; buildSB();
  document.getElementById('ct').innerHTML = `
    <div class="empty">
      <div class="empty-ico">🇨🇴</div>
      <h3 style="color:var(--t1);font-size:17px;margin-bottom:6px">Centro de Comando Antioquia</h3>
      <p style="font-size:12px">Selecciona un municipio para gestionar comunas, puestos, testigos y movilidad.</p>
      <div id="ov-wrap" style="margin-top:20px;padding:0 10px"></div>
    </div>`;
  renderOV();
  loadAllTestigosForAllMusis(); // re-trigger if not yet complete
  loadTestigoCounts();
  loadDashboardStats();
}

// ═══ MUNI VIEW ═══
function renderMuni(n) {
  const comunas = RAW[n]; const s = gs(n); const ckeys = Object.keys(comunas).sort();
  let totP = 0, totM = 0, totV = 0;
  let totTestReg = 0, totMesasSinAsignar = 0, totCapacidad = 0;
  ckeys.forEach(c => {
    comunas[c].forEach(p => { totP++; totM += (p.mesas || 0); totV += (p.total || 0); });
    const st = _ccStats(n, c);
    totTestReg += st.testReg; totMesasSinAsignar += st.mesasSinAsignar; totCapacidad += st.capacidadCubrir;
  });
  const _apiStatDetail = _dashboardStatsByMuni[n];
  const pctCov = _apiStatDetail !== undefined ? _apiStatDetail.coberturaPct : _coveragePct(totCapacidad, totM);
  const testigosExc = _apiStatDetail !== undefined ? (_apiStatDetail.testigosExcedentes || 0) : Math.max(0, totCapacidad - totM);
  const isExcedente = pctCov > 100;
  const isMed = (n === 'MEDELLIN'); const label = isMed ? 'MEDELLÍN' : n;
  document.getElementById('ct').innerHTML = `
    <div class="mh">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <button class="back-btn" data-action="go-home" title="Volver al inicio">← Inicio</button>
        <div><div class="mh-t">${label}</div><div class="mh-s">${totP} puestos · ${ckeys.length} zonas · ${totV.toLocaleString('es-CO')} votantes</div></div>
      </div>
      <div class="mh-coord">
        <div><div class="cl">Coordinador ${isMed ? 'ciudad' : 'municipal'}</div><div class="cv" id="mh-cv">${esc(s.coord) || '—'}</div><span id="mh-phone-wa">${s.phone ? `<div class="cp">${esc(s.phone)}<a class="wa-btn" href="https://wa.me/57${s.phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a></div>` : ''}</span></div>
        ${_isReadOnly() ? '' : `<button class="ebtn" onclick="editMuni('${n}')">✎ Editar</button>`}
      </div>
    </div>
    <div class="stats">
      <div class="sc"><div class="sl">Puestos</div><div class="sv">${totP}</div></div>
      <div class="sc"><div class="sl">Mesas</div><div class="sv">${totM.toLocaleString('es-CO')}</div></div>
      <div class="sc"><div class="sl">Zonas/Comunas</div><div class="sv">${ckeys.length}</div></div>
      <div class="sc"><div class="sl">Votantes</div><div class="sv">${(totV / 1000).toFixed(0)}K</div></div>
      <div class="sc"><div class="sl">Testigos</div><div class="sv" id="mh-test-reg">${totTestReg}</div></div>
      <div class="sc${totMesasSinAsignar > 0 ? ' sc-warn' : ''}" id="mh-test-falt"><div class="sl">Mesas sin asignar</div><div class="sv">${totMesasSinAsignar}</div></div>
      <div class="sc${isExcedente ? ' sc-excedente' : ''}"><div class="sl">% Cobertura</div><div class="sv" id="mh-cov-pct" data-cobertura-muni="${n}">${pctCov}%</div></div>
      ${testigosExc > 0 ? `<div class="sc sc-excedente"><div class="sl">Testigos excedentes</div><div class="sv">${testigosExc}</div></div>` : ''}
    </div>
    <div class="otabs">
      <div class="otab on" onclick="switchOTab(this,'ot-comunas')">Por Zonas/Comunas</div>
      <div class="otab" onclick="switchOTab(this,'ot-todos')">Todos los puestos</div>
      <div class="otab" onclick="switchOTab(this,'ot-mapa')">🗺 Mapa</div>
      <div class="otab" onclick="switchOTab(this,'ot-prioridad')">⭐ Priorización</div>
    </div>
    <div id="ot-comunas" class="opane on"><div class="body" id="cc-body"></div></div>
    <div id="ot-todos" class="opane"><div class="body" id="at-body"></div></div>
    <div id="ot-mapa" class="opane"><div id="ot-mapa-inner" style="height:520px"></div></div>
    <div id="ot-prioridad" class="opane"><div id="ot-prioridad-inner"></div></div>`;
  renderCCs(n);
}
function switchOTab(el, id) {
  document.querySelectorAll('.otab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.opane').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); document.getElementById(id).classList.add('on');
  if (id === 'ot-todos') renderAllPuestos(CUR);
  if (id === 'ot-mapa') renderMuniMap(CUR);
  if (id === 'ot-prioridad' && typeof renderPrioridadTabForMuni === 'function') renderPrioridadTabForMuni(CUR);
}

// ═══ STATS HELPER PER COMMUNE ═══
function _refrigCountComuna(n, ck) {
  const s = gs(n);
  const puestos = RAW[n]?.[ck] || [];
  const testigos = puestos.reduce((sum, p) => sum + ((s.testigos?.[ck]?.[p.puesto] || []).filter(r => r.nombre).length), 0);
  const coordPuestos = puestos.filter(p => !!((s.puestos || {})[pk(p)]?.coord)).length;
  const coordComuna = (s.comunas || {})[ck]?.coord ? 1 : 0;
  return { testigos, coordPuestos, coordComuna, total: testigos + coordPuestos + coordComuna };
}

function _ccStats(n, ck) {
  const s = gs(n);
  const puestos = RAW[n][ck] || [];
  const totPuestos = puestos.length;
  const totMesas = puestos.reduce((a, p) => a + (p.mesas || 0), 0);
  let testReg = 0, testPuCub = 0;
  puestos.forEach(p => {
    const rows = (s.testigos?.[ck]?.[p.puesto] || []).filter(r => r.nombre);
    testReg += rows.length;
    if (rows.length > 0) testPuCub++;
  });
  // A24 Opción A: 1 testigo = 1 mesa (no cap at 100%)
  const capacidadCubrir = testReg;
  const mesasSinAsignar = Math.max(0, totMesas - capacidadCubrir);
  const mesasExcedentes = Math.max(0, capacidadCubrir - totMesas);
  const testigosExcedentes = Math.max(0, capacidadCubrir - totMesas);
  const covPuestos = puestos.filter(p => (s.puestos[pk(p)] || {}).coord).length;
  const pct = _coveragePct(capacidadCubrir, totMesas);
  const resps = (s.movilidad?.[ck]?.responsables) || [];
  const totMotos = resps.filter(r => (r.tipo || (parseInt(r.motos) > 0 ? 'moto' : 'carro')) === 'moto').length || resps.reduce((a, r) => a + (parseInt(r.motos) || 0), 0);
  const totCarros = resps.filter(r => (r.tipo || (parseInt(r.carros) > 0 ? 'carro' : 'moto')) === 'carro').length || resps.reduce((a, r) => a + (parseInt(r.carros) || 0), 0);
  return { totPuestos, totMesas, capacidadCubrir, testReg, mesasSinAsignar, mesasExcedentes, testigosExcedentes, testPuCub, covPuestos, pct, totMotos, totCarros };
}

function _refreshCCStats(n, ck) {
  const id = cid(n, ck);
  if (!document.getElementById(id)) return;
  const { testReg, mesasSinAsignar } = _ccStats(n, ck);
  const rfCnt = _refrigCountComuna(n, ck);
  const tEl = document.getElementById(id + '-s-t');
  const tfEl = document.getElementById(id + '-s-tf');
  const rfEl = document.getElementById(id + '-s-refrig');
  if (tEl) tEl.textContent = testReg;
  if (tfEl) {
    tfEl.querySelector('.v').textContent = mesasSinAsignar;
    tfEl.classList.toggle('cc-st-warn', mesasSinAsignar > 0);
  }
  if (rfEl) rfEl.querySelector('.v').textContent = rfCnt.total;
  if (n === 'MEDELLIN') {
    const zona = (typeof MEDELLIN_ZONAS !== 'undefined' ? MEDELLIN_ZONAS : []).find(z => z.comunas.includes(ck));
    if (zona) _refreshZonaStats(n, zona.nombre);
  }
  _refreshMuniStats(n);
}

function _refreshZonaStats(n, zonaNombre) {
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zonaNombre))).replace(/[^a-z0-9]/gi, '');
  const zona = (typeof MEDELLIN_ZONAS !== 'undefined' ? MEDELLIN_ZONAS : []).find(z => z.nombre === zonaNombre);
  if (!zona) return;
  let totTestReg = 0, totTestFalt = 0, totRefrig = 0;
  zona.comunas.forEach(ck => {
    if (!RAW[n][ck]) return;
    const st = _ccStats(n, ck);
    totTestReg += st.testReg;
    totTestFalt += st.mesasSinAsignar;
    totRefrig += _refrigCountComuna(n, ck).total;
  });
  const tEl = document.getElementById(zid + '-s-t');
  const tfEl = document.getElementById(zid + '-s-tf');
  const rfEl = document.getElementById(zid + '-s-refrig');
  if (tEl) tEl.textContent = totTestReg;
  if (tfEl) {
    tfEl.querySelector('.v').textContent = totTestFalt;
    tfEl.classList.toggle('cc-st-warn', totTestFalt > 0);
  }
  if (rfEl) rfEl.querySelector('.v').textContent = totRefrig;
}

function _refreshMuniStats(n) {
  if (n !== CUR) return; // don't overwrite stats of a different municipality
  const tEl = document.getElementById('mh-test-reg');
  const tfEl = document.getElementById('mh-test-falt');
  if (!tEl || !tfEl) return;
  let totTestReg = 0, totMesasSinAsignar = 0;
  Object.keys(RAW[n] || {}).forEach(ck => {
    const st = _ccStats(n, ck);
    totTestReg += st.testReg;
    totMesasSinAsignar += st.mesasSinAsignar;
  });
  tEl.textContent = totTestReg;
  tfEl.querySelector('.sv').textContent = totMesasSinAsignar;
  tfEl.classList.toggle('sc-warn', totMesasSinAsignar > 0);
  // NOTE: #mh-cov-pct is NOT updated here — API value set by _applyDashboardStatsToDom() is authoritative.
}

async function loadAllTestigosForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const comunas = Object.keys(RAW[n] || {});
  await Promise.all(comunas.map(ck => loadTestigosForComune(n, ck)));
  _refreshMuniStats(n);
  if (n === CUR && document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(n);
}

let _allTestigosLoading = false;
let _allTestigosLoaded = false;
async function loadAllTestigosForAllMusis() {
  if (!window.api || !window.CURRENT_USER) return;
  if (_allTestigosLoading || _allTestigosLoaded) return;
  _allTestigosLoading = true;
  for (const n of ALL_MUNIS.filter(m => RAW[m])) {
    await loadAllTestigosForMuni(n);
  }
  _allTestigosLoaded = true;
  _allTestigosLoading = false;
  renderOV();
}

// ═══ ZONA CARDS ═══
function buildZonaCard(n, zona) {
  const s = gs(n); const sz = (s.zonas || {})[zona.nombre] || {};
  let totPuestos = 0, totMesas = 0, totCapacidad = 0;
  let totTestReg = 0, totMesasSinAsignar = 0, totMotos = 0, totCarros = 0;
  let totRefrig = 0;
  zona.comunas.forEach(ck => {
    if (!RAW[n][ck]) return;
    const st = _ccStats(n, ck);
    totPuestos += st.totPuestos; totMesas += st.totMesas;
    totTestReg += st.testReg; totMesasSinAsignar += st.mesasSinAsignar;
    totCapacidad += st.capacidadCubrir;
    totMotos += st.totMotos; totCarros += st.totCarros;
    totRefrig += _refrigCountComuna(n, ck).total;
  });
  const pct = _coveragePct(totCapacidad, totMesas);
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zona.nombre))).replace(/[^a-z0-9]/gi, '');
  const isOpen = OPEN_Z.has(n + zona.nombre);
  const el = document.createElement('div'); el.className = 'zona-card'; el.id = zid;
  el.innerHTML = `
    <div class="zona-card-hd" onclick="toggleZ('${n}','${zona.nombre.replace(/'/g, "\\'")}')">
      <div class="zona-card-left">
        <div class="zona-card-nm">${zona.nombre}</div>
        <div class="zona-card-coord">
          <span>Coord:</span><span id="${zid}-cv">${esc(sz.coord) || '—'}</span>
          <span id="${zid}-phone-wa">${sz.phone ? `<span>· ${esc(sz.phone)}</span><a class="wa-btn" href="https://wa.me/57${sz.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}</span>
          ${_isReadOnly() ? '' : `<button class="zona-ced" onclick="event.stopPropagation();editZona('${n}','${zona.nombre.replace(/'/g, "\\'")}')">✎</button>`}
        </div>
      </div>
      <div class="chev${isOpen ? ' op' : ''}">▾</div>
    </div>
    <div class="cc-stats-bar">
      <div class="cc-st"><div class="v">${totPuestos}</div><div class="l">Puestos</div></div>
      <div class="cc-st"><div class="v">${totMesas.toLocaleString('es-CO')}</div><div class="l">Mesas</div></div>
      <div class="cc-st"><div class="v" id="${zid}-s-t">${totTestReg}</div><div class="l">Testigos</div></div>
      <div class="cc-st${totMesasSinAsignar > 0 ? ' cc-st-warn' : ''}" id="${zid}-s-tf"><div class="v">${totMesasSinAsignar}</div><div class="l">Mesas sin asignar</div></div>
      <div class="cc-st${pct > 100 ? ' cc-st-excedente' : ''}"><div class="v">${pct}%</div><div class="l">Cobertura</div></div>
      <div class="cc-st" id="${zid}-s-refrig" style="border-left:2px solid #f5a623" title="Refrigerios necesarios = testigos + coord. puestos + coord. zona"><div class="v" style="color:#f5a623">${totRefrig}</div><div class="l">🍱 Refrig.</div></div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${Math.min(pct, 100)}%"></div></div>
    <div class="zona-card-bd${isOpen ? ' op' : ''}" id="${zid}-bd"></div>`;
  const bd = el.querySelector('#' + zid + '-bd');
  zona.comunas.forEach(ck => { if (RAW[n][ck]) bd.appendChild(buildCCCard(n, ck)); });
  return el;
}

// ═══ COMMUNE CARDS ═══
function buildCCCard(n, ck) {
  const puestos = RAW[n][ck]; const s = gs(n); const sc = (s.comunas || {})[ck] || {};
  const totV = puestos.reduce((a, p) => a + (p.total || 0), 0);
  const id = cid(n, ck); const isOpen = OPEN_CC.has(n + ck);
  const card = document.createElement('div'); card.className = 'cc'; card.id = id;
  const { totPuestos, totMesas, testReg, mesasSinAsignar, pct } = _ccStats(n, ck);
  const rfCnt = _refrigCountComuna(n, ck);
  card.innerHTML = `
    <div class="cc-hd" onclick="toggleCC('${n}','${ck.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}')">
      <div>
        <div class="cc-nm">${_ckLabel(n, ck)}</div>
        <div class="cc-crd-row">
          <span class="cc-crd-lbl">Coord:</span>
          <span class="cc-crd-val" id="${id}-cv">${esc(sc.coord) || '—'}</span>
          <span id="${id}-phone-wa">${sc.phone ? `<span class="cc-crd-ph">· ${esc(sc.phone)}</span><a class="wa-btn" href="https://wa.me/57${sc.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}</span>
          ${_isReadOnly() ? '' : `<button class="cc-ced" onclick="event.stopPropagation();editCC('${n}','${ck.replace(/'/g, "\\'")}')">✎</button>`}
        </div>
      </div>
      <div class="chev${isOpen ? ' op' : ''}">▾</div>
    </div>
    <div class="cc-stats-bar">
      <div class="cc-st"><div class="v">${totPuestos}</div><div class="l">Puestos</div></div>
      <div class="cc-st"><div class="v">${totMesas.toLocaleString('es-CO')}</div><div class="l">Mesas</div></div>
      <div class="cc-st"><div class="v" id="${id}-s-t">${testReg}</div><div class="l">Testigos</div></div>
      <div class="cc-st${mesasSinAsignar > 0 ? ' cc-st-warn' : ''}" id="${id}-s-tf"><div class="v">${mesasSinAsignar}</div><div class="l">Mesas sin asignar</div></div>
      <div class="cc-st${pct > 100 ? ' cc-st-excedente' : ''}"><div class="v">${pct}%</div><div class="l">Cobertura</div></div>
      <div class="cc-st" id="${id}-s-refrig" style="border-left:2px solid #f5a623" title="Refrigerios = testigos + coord. puestos + coord. comuna"><div class="v" style="color:#f5a623">${rfCnt.total}</div><div class="l">🍱 Refrig.</div></div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${Math.min(pct, 100)}%"></div></div>
    <div class="cc-bd${isOpen ? ' op' : ''}" id="${id}-bd">
      <div class="itabs">
        <div class="itab on" data-pane="${id}-puestos" onclick="switchIT(this,'${id}-puestos')">📋 Puestos (${puestos.length})</div>
        <div class="itab" data-pane="${id}-preg" onclick="switchIT(this,'${id}-preg');renderTestigosPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🧾 Testigos</div>
        <div class="itab" data-pane="${id}-mov" onclick="switchIT(this,'${id}-mov');renderMovPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🚗 Movilidad</div>
        <div class="itab" data-pane="${id}-abog" onclick="switchIT(this,'${id}-abog');renderAbogadoPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">⚖️ Abogado</div>
        <div class="itab" data-pane="${id}-refrig" onclick="switchIT(this,'${id}-refrig');renderRefrigPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🍱 Refrigerios</div>
        <div class="itab" data-pane="${id}-comp" onclick="switchIT(this,'${id}-comp');renderComparendosPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">⚠️ Comparendos</div>
        <div class="itab" data-pane="${id}-mapa" onclick="switchIT(this,'${id}-mapa');renderMapPanel('${n}','${ck.replace(/'/g, "\\'")}','${id}')">🗺 Mapa</div>
      </div>
      <div class="ipane on" id="${id}-puestos"><div style="padding:8px">${buildPT(n, puestos, ck)}</div></div>
      <div class="ipane" id="${id}-preg"></div>
      <div class="ipane" id="${id}-mov"></div>
      <div class="ipane" id="${id}-abog"></div>
      <div class="ipane" id="${id}-refrig"></div>
      <div class="ipane" id="${id}-comp"></div>
      <div class="ipane" id="${id}-mapa"></div>
    </div>`;
  return card;
}
function _restoreTabForCC(n, ck) {
  const id = cid(n, ck);
  const savedPane = OPEN_ITABS[id];
  if (!savedPane || !OPEN_CC.has(n + ck)) return;
  const bd = document.getElementById(id + '-bd');
  if (!bd) return;
  bd.querySelectorAll('.itab').forEach(t => t.classList.toggle('on', t.dataset.pane === savedPane));
  bd.querySelectorAll('.ipane').forEach(p => p.classList.toggle('on', p.id === savedPane));
  const suffix = savedPane.replace(id + '-', '');
  const renders = { preg: () => renderTestigosPanel(n, ck, id), mov: () => renderMovPanel(n, ck, id), abog: () => renderAbogadoPanel(n, ck, id), refrig: () => renderRefrigPanel(n, ck, id), comp: () => renderComparendosPanel(n, ck, id), mapa: () => renderMapPanel(n, ck, id) };
  if (renders[suffix]) renders[suffix]();
}
function renderCCs(n) {
  const body = document.getElementById('cc-body'); body.innerHTML = '';
  if (n === 'MEDELLIN') {
    MEDELLIN_ZONAS.forEach(zona => {
      body.appendChild(buildZonaCard(n, zona));
      zona.comunas.forEach(ck => { if (RAW[n][ck]) _restoreTabForCC(n, ck); });
    });
  } else {
    Object.keys(RAW[n]).sort().forEach(ck => {
      body.appendChild(buildCCCard(n, ck));
      _restoreTabForCC(n, ck);
    });
  }
}
function switchIT(el, paneid) {
  const bd = el.closest('.cc-bd');
  const cardId = bd.id.replace('-bd', '');
  OPEN_ITABS[cardId] = paneid;
  bd.querySelectorAll('.itab').forEach(t => t.classList.remove('on'));
  bd.querySelectorAll('.ipane').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); document.getElementById(paneid).classList.add('on');
}
function toggleCC(n, ck) {
  const key = n + ck; const id = cid(n, ck);
  const bd = document.getElementById(id + '-bd'); const chev = document.querySelector('#' + id + ' .chev');
  if (!bd) return;
  if (OPEN_CC.has(key)) { OPEN_CC.delete(key); bd.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_CC.add(key); bd.classList.add('op'); if (chev) chev.classList.add('op'); }
}
function toggleZ(n, zonaNombre) {
  const key = n + zonaNombre;
  const zid = 'z_' + btoa(unescape(encodeURIComponent(zonaNombre))).replace(/[^a-z0-9]/gi, '');
  const bd = document.getElementById(zid + '-bd'); const chev = document.querySelector('#' + zid + ' .chev');
  if (!bd) return;
  if (OPEN_Z.has(key)) { OPEN_Z.delete(key); bd.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_Z.add(key); bd.classList.add('op'); if (chev) chev.classList.add('op'); }
}

// ═══ PUESTOS ═══
function buildPT(n, puestos, ckKey) {
  const s = gs(n);
  return puestos.map(p => {
    const k = pk(p); const ps = (s.puestos || {})[k] || {};
    const t = ps.tag || 'n'; const tg = TAGS[t] || TAGS.n;
    const map = p.lat && p.lon ? `<a class="map-a" href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank">Ver mapa</a>` : '';
    const testReg = ((s.testigos?.[ckKey]?.[p.puesto]) || []).filter(r => r.nombre).length;
    const divipole = `${String(p.dd).padStart(2, '0')}.${String(p.mm).padStart(3, '0')}.${String(p.zz).padStart(2, '0')}.${String(p.pp).padStart(2, '0')}`;
    const pcid = 'pc_' + k + '_' + btoa(unescape(encodeURIComponent(ckKey))).replace(/[^a-z0-9]/gi, '');
    const coordPill = ps.coord
      ? `<span class="pc-pill coord" ${_isReadOnly() ? '' : `onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')"`}>👤 ${esc(ps.coord)}${ps.phone ? ' · ' + esc(ps.phone) : ''}</span>${ps.phone ? `<a class="wa-btn" href="https://wa.me/57${ps.phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>` : ''}`
      : (_isReadOnly() ? '' : `<span class="pc-pill nocoord" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')">+ Coord. puesto</span>`);
    return `<div class="pc" id="${pcid}">
      <div class="pc-hd" onclick="togglePC('${pcid}')">
        <div class="pc-left">
          <div class="pc-nm">${p.puesto}</div>
          <div class="pc-dir">${p.direccion}</div>
          <div class="pc-pills">
            <span class="pc-pill">${p.mesas || 0} mesas</span>
            <span class="pc-pill">${(p.total || 0).toLocaleString('es-CO')} v.</span>
            ${_isReadOnly() ? `<span class="${tg.cls} tbtn" style="cursor:default">${tg.lbl}</span>` : `<button class="${tg.cls} tbtn" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}');">${tg.lbl}</button>`}
            ${coordPill}
            ${testReg > 0 ? `<span class="pc-pill" style="color:var(--green);border-color:rgba(46,216,122,.3)">Test. ${testReg}</span>` : ''}
            ${map}
          </div>
        </div>
        <div class="pc-right">
          ${_isReadOnly() ? '' : `<button class="pc-edit-btn" onclick="event.stopPropagation();editPCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}')" title="Editar coordinador">✎</button>`}
          <div class="pc-chev" id="${pcid}-chev">▾</div>
        </div>
      </div>
      <div class="pc-body" id="${pcid}-body">
        <div class="pc-section">
          <div class="pc-section-title">Coordinador del puesto</div>
          <div class="pc-coord-row">
            ${_isReadOnly() ? `
              <span style="font-size:13px;color:var(--t1)">${esc(ps.coord) || '—'}</span>
              ${ps.phone ? `<span style="font-size:12px;color:var(--t2)">&nbsp;· ${esc(ps.phone)}</span>` : ''}
              <span class="${tg.cls}" style="cursor:default;margin-left:6px">${tg.lbl}</span>
            ` : `
              <input class="pc-inp" type="text" placeholder="Nombre coordinador" value="${esc(ps.coord)}" id="${pcid}-coord">
              <input class="pc-inp" type="text" placeholder="Teléfono" value="${esc(ps.phone)}" id="${pcid}-phone" style="max-width:150px">
              <select class="pc-inp" id="${pcid}-tag" style="max-width:130px">
                <option value="n" ${t === 'n' ? 'selected' : ''}>Sin estado</option>
                <option value="ok" ${t === 'ok' ? 'selected' : ''}>✓ Cubierto</option>
                <option value="pr" ${t === 'pr' ? 'selected' : ''}>★ Prioritario</option>
                <option value="pe" ${t === 'pe' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="al" ${t === 'al' ? 'selected' : ''}>⚠ Alerta</option>
              </select>
              <button class="pc-save" onclick="savePCard('${n}','${k}','${ckKey.replace(/'/g, "\\'")}','${pcid}')">💾 Guardar</button>
            `}
          </div>
        </div>
        <div class="pc-info-row">
          <span>DIVIPOLE: <b>${divipole}</b></span>
          <span>Mesas: <b>${p.mesas || 0}</b></span>
          <span>Votantes: <b>${(p.total || 0).toLocaleString('es-CO')}</b></span>
        </div>
        ${ps.notes ? `<div style="font-size:11px;color:var(--t2);background:var(--bg);border-radius:5px;padding:6px 9px;margin-bottom:8px">📝 ${esc(ps.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

let OPEN_PP = new Set();
function togglePP(id) {
  const body = document.getElementById(id); const chev = document.getElementById(id + '-chev');
  if (!body) return;
  if (OPEN_PP.has(id)) { OPEN_PP.delete(id); body.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_PP.add(id); body.classList.add('op'); if (chev) chev.classList.add('op'); }
}
let OPEN_PC = new Set();
function togglePC(id) {
  const body = document.getElementById(id + '-body'); const chev = document.getElementById(id + '-chev');
  if (!body) return;
  if (OPEN_PC.has(id)) { OPEN_PC.delete(id); body.classList.remove('op'); if (chev) chev.classList.remove('op'); }
  else { OPEN_PC.add(id); body.classList.add('op'); if (chev) chev.classList.add('op'); }
}

async function savePCard(n, k, ck, pcid) {
  const s = gs(n); if (!s.puestos) s.puestos = {};
  const coord = document.getElementById(pcid + '-coord').value.trim();
  const phone = document.getElementById(pcid + '-phone').value.trim();
  const tag = document.getElementById(pcid + '-tag').value;
  s.puestos[k] = { ...((s.puestos[k]) || {}), coord, phone, tag };
  saveLocalSt();
  await writeMuni(n);
  if (window.api && window.CURRENT_USER) {
    const puestoId = getPuestoBackendId(n, k); // k is pk string, now stored in cache
    if (puestoId) {
      api.patch(`/coordinador/puesto/${puestoId}/adhoc`, { nombre: coord || null, telefono: phone || null, tag: tag || null })
        .catch(err => { if (err?.status !== 409) _onWriteError('coord puesto adhoc patch failed', err); });
    }
  }
  const tg = TAGS[tag] || TAGS.n;
  const tagBtn = document.querySelector(`#${pcid} .tbtn`);
  if (tagBtn) { tagBtn.className = tg.cls + ' tbtn'; tagBtn.textContent = tg.lbl; }
  const coordPills = document.querySelectorAll(`#${pcid} .pc-pill.coord, #${pcid} .pc-pill.nocoord`);
  coordPills.forEach(el => {
    el.className = coord ? 'pc-pill coord' : 'pc-pill nocoord';
    el.textContent = coord ? '👤 ' + coord + (phone ? ' · ' + phone : '') : '+ Coord. puesto';
  });
  const btn = document.querySelector(`#${pcid} .pc-save`);
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Guardado'; btn.style.background = 'var(--green)'; setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1800); }
  renderCCs(n);
}

function editPCard(n, k, ck) {
  const pcid = 'pc_' + k + '_' + btoa(unescape(encodeURIComponent(ck))).replace(/[^a-z0-9]/gi, '');
  if (!OPEN_PC.has(pcid)) togglePC(pcid);
  setTimeout(() => { const el = document.getElementById(pcid + '-coord'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 100);
}
function buildAllPuestosSection(n, ck, puestos, s) {
  const sc = (s.comunas || {})[ck] || {};
  return `<div style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-bottom:1px solid var(--b1)">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--t3);flex:1">${_ckLabel(n, ck)}</div>
      ${sc.coord ? `<span style="font-size:10px;color:var(--blue)">👤 ${esc(sc.coord)}${sc.phone ? ' · ' + esc(sc.phone) : ''}</span>` : `<span style="font-size:10px;color:var(--t3);font-style:italic">Sin coordinador de zona</span>`}
      ${_isReadOnly() ? '' : `<button onclick="editCC('${n}','${ck.replace(/'/g, "\\'")}')" style="background:none;border:1px solid var(--b2);color:var(--t2);cursor:pointer;padding:2px 7px;font-size:11px;border-radius:4px;line-height:1.4" title="Editar coordinador de zona">✎</button>`}
    </div>
    ${buildPT(n, puestos, ck)}
  </div>`;
}
function renderAllPuestos(n) {
  const body = document.getElementById('at-body'); let html = '';
  const s = gs(n);
  if (n === 'MEDELLIN') {
    MEDELLIN_ZONAS.forEach(zona => {
      const sz = (s.zonas || {})[zona.nombre] || {};
      html += `<div class="zona-hdr">
        <span style="flex:1">${zona.nombre}</span>
        ${sz.coord ? `<span style="text-transform:none;letter-spacing:0;font-size:10px;color:var(--blue);font-weight:600">👤 ${esc(sz.coord)}${sz.phone ? ' · ' + esc(sz.phone) : ''}</span>` : ''}
        ${_isReadOnly() ? '' : `<button class="zona-ced" onclick="editZona('${n}','${zona.nombre.replace(/'/g, "\\'")}')">✎</button>`}
      </div>`;
      zona.comunas.forEach(ck => { if (RAW[n][ck]) html += buildAllPuestosSection(n, ck, RAW[n][ck], s); });
    });
  } else {
    Object.entries(RAW[n]).sort(([a], [b]) => a.localeCompare(b)).forEach(([ck, puestos]) => {
      html += buildAllPuestosSection(n, ck, puestos, s);
    });
  }
  body.innerHTML = html;
}

// ═══ TESTIGOS ═══
// Load testigos from API for all puestos in a commune, merging into localStorage state.
async function loadTestigosForComune(n, ck) {
  if (!window.api || !window.CURRENT_USER) return;
  await loadPuestoIds(n); // idempotent no-op if already loaded
  const puestosList = RAW[n][ck] || [];
  const s = gs(n);
  if (!s.testigos) s.testigos = {};
  if (!s.testigos[ck]) s.testigos[ck] = {};
  for (const p of puestosList) {
    const puestoBackendId = getPuestoBackendId(n, p.puesto);
    if (!puestoBackendId) continue;
    try {
      const rows = await api.get(`/puestos/${puestoBackendId}/testigos`);
      s.testigos[ck][p.puesto] = rows.map(t => ({
        _backendId: t.id,
        nombre: t.name || '',
        telefono: t.phone || '',
        cedula: t.cedula || '',
        notas: t.notes || '',
        mesaInicial: t.mesaInicial ?? null,
        mesaFinal: t.mesaFinal ?? null,
      }));
    } catch (err) {
      console.error('loadTestigosForComune failed for', p.puesto, err?.status);
    }
  }
  saveLocalSt();
  _refreshCCStats(n, ck);
}

async function renderTestigosPanel(n, ck, id) {
  const pane = document.getElementById(id + '-preg');
  if (!pane) return;
  pane.innerHTML = '<div style="padding:12px;color:var(--t3);font-size:11px">⏳ Cargando testigos...</div>';
  await loadTestigosForComune(n, ck);
  const puestosList = RAW[n][ck] || [];
  const s = gs(n);
  let html = `<div class="preg-panel">`;
  puestosList.forEach(p => {
    const pName = p.puesto;
    const pKey = encodeURIComponent(pName);
    const ppid = `${id}-pp-${btoa(pKey).replace(/=/g, '')}`;
    const coordPuesto = (s.puestos || {})[pk(p)] || {};
    const testReg = getTestigos(n, ck, pName).filter(t => t.nombre).length;
    html += `<div class="puesto-preg">
      <div class="pp-hd" onclick="togglePP('${ppid}')">
        <span class="pp-nm" title="${pName}">${pName}</span>
        <div class="pp-right">
          <div class="pp-pills">
            <span class="pp-pill ${testReg > 0 ? 'ok' : ''}">🧾 ${testReg}</span>
          </div>
          <span class="pp-chev" id="${ppid}-chev">▾</span>
        </div>
      </div>
      <div class="pp-body" id="${ppid}">
        ${coordPuesto.coord ? `<div style="font-size:11px;color:var(--t2);background:var(--bg);border-radius:5px;padding:6px 9px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><b>Coordinador:</b> 👤 ${esc(coordPuesto.coord)}${coordPuesto.phone ? ` · <span>${esc(coordPuesto.phone)}</span><a class="wa-btn" href="https://wa.me/57${coordPuesto.phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : ''}</div>` : ''}
        <div class="test-section">
          <h5>🧾 Testigos electorales <span style="color:var(--t3);font-weight:400">(${testReg})</span></h5>
          <div id="${id}-test-${btoa(pKey).replace(/=/g, '')}">${buildTestRows(n, ck, pName, id, pKey)}</div>
          ${_isReadOnly() ? '' : `<button class="add-btn" onclick="addTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}','${id}')">+ Agregar testigo</button>`}
        </div>
        <div class="test-section" style="margin-top:8px">
          <h5>📋 Asignación de mesas</h5>
          ${buildAsignacionTable(n, ck, pName, p.mesas || 0)}
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${_isReadOnly() ? '' : `<button class="add-btn" onclick="recalcularAsignacion('${n}','${ck.replace(/'/g, "\\'")}','${pKey}','${id}')">↺ Recalcular asignaciones</button>`}
            <button class="add-btn" onclick="descargarPdfAsignacion('${n}','${encodeURIComponent(pName)}')">⬇ Descargar PDF</button>
          </div>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  pane.innerHTML = html;
  puestosList.forEach(p => {
    const pKey2 = encodeURIComponent(p.puesto);
    const ppid = `${id}-pp-${btoa(pKey2).replace(/=/g, '')}`;
    if (OPEN_PP.has(ppid)) {
      const body2 = document.getElementById(ppid);
      const chev2 = document.getElementById(ppid + '-chev');
      if (body2) body2.classList.add('op');
      if (chev2) chev2.classList.add('op');
    }
  });
}

function getTestigos(n, ck, pName) { return (gs(n).testigos?.[ck]?.[pName]) || []; }

function buildTestRows(n, ck, pName, id, pKey) {
  const rows = getTestigos(n, ck, pName);
  if (!rows.length) return '<div style="font-size:10px;color:var(--t3);padding:2px 0">Sin testigos aún</div>';
  if (_isReadOnly()) {
    return rows.map(r => `<div class="test-row">
      <span style="flex:2;font-size:12px;color:var(--t1)">${esc(r.nombre) || '—'}</span>
      <span style="font-size:12px;color:var(--t2)">${esc(r.telefono) || ''}</span>
      ${r.telefono ? `<a class="wa-btn" href="https://wa.me/57${r.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : '<span class="wa-btn-ph"></span>'}
    </div>`).join('');
  }
  return rows.map((r, i) => `<div class="test-row">
    <input class="pi" style="flex:2" type="text" placeholder="Nombre" value="${esc(r.nombre)}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'nombre',this.value)">
    <input class="pi pi-sm" type="text" placeholder="Teléfono" value="${esc(r.telefono)}"
      onchange="updateTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'telefono',this.value)">
    ${r.telefono ? `<a class="wa-btn" href="https://wa.me/57${r.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : '<span class="wa-btn-ph"></span>'}
    <button class="del-btn" onclick="delTestigo('${n}','${ck.replace(/'/g, "\\'")}','${pKey}',${i},'${id}')">×</button>
  </div>`).join('');
}


function buildAsignacionTable(n, ck, pName, totalMesas) {
  const rows = getTestigos(n, ck, pName).filter(r => r.nombre);
  if (!rows.length) return '<div style="font-size:10px;color:var(--t3);padding:2px 0">Sin testigos asignados</div>';
  const mesasAsignadas = rows.reduce((s, r) => {
    if (r.mesaInicial == null) return s;
    return s + ((r.mesaFinal ?? r.mesaInicial) - r.mesaInicial + 1);
  }, 0);
  let html = `<div style="font-size:10px;color:var(--t3);margin-bottom:4px">Mesas asignadas: <b>${mesasAsignadas}</b> / ${totalMesas}</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:3px 6px;text-align:left">Testigo</th>
      <th style="padding:3px 6px;text-align:center">Mesas asignadas</th>
    </tr></thead><tbody>`;
  rows.forEach(r => {
    const rango = r.mesaInicial != null ? `${r.mesaInicial}–${r.mesaFinal}` : '<span style="color:var(--warn)">Sin asignar</span>';
    html += `<tr><td style="padding:3px 6px">${esc(r.nombre)}</td><td style="padding:3px 6px;text-align:center">${rango}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

async function recalcularAsignacion(n, ck, pKey, id) {
  const pName = decodeURIComponent(pKey);
  const puestoBackendId = getPuestoBackendId(n, pName);
  if (!puestoBackendId || !window.api) return;
  try {
    await api.post(`/asignacion/recalcular/${puestoBackendId}`, {});
    await loadTestigosForComune(n, ck);
    await renderTestigosPanel(n, ck, id);
  } catch (err) {
    console.error('[recalcularAsignacion] failed', err);
    alert('Error al recalcular asignaciones: ' + (err?.message || err));
  }
}

async function descargarPdfAsignacion(n, pNameEncoded) {
  const pName = decodeURIComponent(pNameEncoded);
  const puestoBackendId = getPuestoBackendId(n, pName);
  if (!puestoBackendId || !window.api) return;
  try {
    const blob = await api.getBlob(`/asignacion/puesto/${puestoBackendId}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `asignacion-puesto-${puestoBackendId}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('[descargarPdfAsignacion] failed', err);
    alert('Error al descargar PDF: ' + (err?.message || err));
  }
}

function addTestigo(n, ck, pKey, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  s.testigos[ck][pName].push({ nombre: '', telefono: '' }); saveLocalSt();
  // Real API call — fire and forget with error logging
  if (window.api && window.CURRENT_USER) {
    const testigos = s.testigos[ck][pName];
    const newT = testigos[testigos.length - 1];

    // Try to find puesto backend ID from cache
    const comunaPuestos = RAW[n] && RAW[n][ck] ? RAW[n][ck] : [];
    const puestoEntry = comunaPuestos.find ? comunaPuestos.find(p => p.puesto === pName) : null;
    const puestoRawName = puestoEntry ? puestoEntry.puesto : pName;
    const puestoBackendId = getPuestoBackendId(n, puestoRawName);

    if (puestoBackendId) {
      api.post(`/puestos/${puestoBackendId}/testigos`, {
        name: newT.nombre || '',
        phone: newT.telefono || undefined,
      }).then(created => {
        // Store backend ID on the testigo object for future update/delete
        newT._backendId = created.id;
        saveLocalSt();
      }).catch(err => _onWriteError('testigo create failed', err));
    }
  }
  const el = document.getElementById(`${id}-test-${btoa(pKey).replace(/=/g, '')}`);
  if (el) el.innerHTML = buildTestRows(n, ck, pName, id, pKey);
}

function updateTestigo(n, ck, pKey, idx, field, val) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  if (!s.testigos) s.testigos = {}; if (!s.testigos[ck]) s.testigos[ck] = {};
  if (!s.testigos[ck][pName]) s.testigos[ck][pName] = [];
  if (!s.testigos[ck][pName][idx]) s.testigos[ck][pName][idx] = { nombre: '', telefono: '' };
  s.testigos[ck][pName][idx][field] = val; saveLocalSt();
  writeDebounced(n);
  // Best-effort PATCH
  const t = s.testigos[ck][pName]?.[idx];
  if (window.api && t?._backendId) {
    const fieldMap = { nombre: 'name', telefono: 'phone', notas: 'notes' };
    const backendField = fieldMap[field] || field;
    api.patch(`/testigos/${t._backendId}`, { [backendField]: val })
      .catch(err => _onWriteError('testigo update failed', err));
  }
}

function delTestigo(n, ck, pKey, idx, id) {
  const s = gs(n); const pName = decodeURIComponent(pKey);
  const deletedTestigo = s.testigos[ck][pName][idx]; // capture before splice
  s.testigos[ck][pName].splice(idx, 1); saveLocalSt();
  if (window.api && deletedTestigo?._backendId) {
    api.delete(`/testigos/${deletedTestigo._backendId}`)
      .catch(err => _onWriteError('testigo delete failed', err));
  }
  const el = document.getElementById(`${id}-test-${btoa(pKey).replace(/=/g, '')}`);
  if (el) el.innerHTML = buildTestRows(n, ck, pName, id, pKey);
}

// ═══ MOVILIDAD ═══
function _waBtn(phone) {
  return phone ? `<a class="wa-btn" href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>` : '';
}
function _migrateMovResps(mov) {
  // Migrate old format {nombre,telefono,motos,carros} → new per-vehicle format
  if (!mov.responsables) {
    const oldMotos = mov.motos || []; const oldCarros = mov.carros || [];
    mov.responsables = [];
    [...oldMotos.map(m => ({ ...m, tipo: 'moto' })), ...oldCarros.map(c => ({ ...c, tipo: 'carro' }))]
      .forEach(v => mov.responsables.push({ tipo: v.tipo, placa: '', nombreResp: v.nombre || '', telefonoResp: v.telefono || '', nombreConductor: '', telefonoConductor: '' }));
    delete mov.motos; delete mov.carros;
  }
  mov.responsables = mov.responsables.map(r => {
    if (r.nombre !== undefined || r.motos !== undefined) {
      // Old entry — upgrade in place
      return { tipo: parseInt(r.motos) > 0 ? 'moto' : 'carro', placa: r.placa || '', nombreResp: r.nombre || r.nombreResp || '', telefonoResp: r.telefono || r.telefonoResp || '', nombreConductor: r.nombreConductor || '', telefonoConductor: r.telefonoConductor || '' };
    }
    return r;
  });
}
const _movEditMode = new Set();
const _movSubTab = new Map(); // id → 'all' | 'moto' | 'carro'

function _movTabBar(id, curTab, n, ck, mo, ca) {
  const ckE = ck.replace(/'/g, "\\'");
  const tabs = [
    { key: 'all',   lbl: `Todos (${mo + ca})` },
    { key: 'moto',  lbl: `🏍 Motos (${mo})` },
    { key: 'carro', lbl: `🚗 Carros (${ca})` },
  ];
  return `<div style="display:flex;gap:4px;margin-bottom:10px;border-bottom:1px solid var(--bdr);padding-bottom:6px;flex-wrap:wrap">
    ${tabs.map(t => `<button onclick="setMovSubTab('${id}','${t.key}','${n}','${ckE}')"
      style="padding:4px 11px;font-size:11px;border-radius:5px;border:1px solid var(--bdr);cursor:pointer;transition:all .15s;
      background:${curTab === t.key ? 'var(--blue)' : 'var(--bg2)'};
      color:${curTab === t.key ? '#fff' : 'var(--t2)'};font-weight:${curTab === t.key ? '700' : '400'}">${t.lbl}</button>`).join('')}
  </div>`;
}

function renderMovPanel(n, ck, id) {
  const pane = document.getElementById(id + '-mov');
  const s = gs(n);
  if (!s.movilidad) s.movilidad = {};
  if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: 0, carros_nec: 0 };
  const mov = s.movilidad[ck];
  _migrateMovResps(mov);
  const resps = mov.responsables;
  const totalMotosReg = resps.filter(r => r.tipo === 'moto').length;
  const totalCarrosReg = resps.filter(r => r.tipo === 'carro').length;
  const motosNec = mov.motos_nec || 0; const carrosNec = mov.carros_nec || 0;
  const ckE = ck.replace(/'/g, "\\'");
  const curTab = _movSubTab.get(id) || 'all';
  // Start in edit mode if explicitly set OR no vehicles yet
  const isEdit = _movEditMode.has(id) || resps.length === 0;

  if (!isEdit) {
    // ── VIEW MODE ──
    const filteredView = curTab === 'all' ? resps : resps.filter(r => r.tipo === curTab);
    const viewCards = filteredView.map((r, i) => {
      const tipoIcon = r.tipo === 'moto' ? '🏍' : '🚗';
      const tipoLabel = r.tipo === 'moto' ? 'Moto' : 'Carro';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;background:var(--bg2);border-radius:7px;border:1px solid var(--bdr);flex-wrap:wrap">
        <span style="font-weight:700;color:var(--t2);font-size:12px;min-width:20px">#${i+1}</span>
        <span style="font-size:12px;flex-shrink:0">${tipoIcon} <strong>${tipoLabel}</strong></span>
        ${r.placa ? `<span style="font-size:11px;font-weight:600;color:var(--t1);background:var(--bg);border:1px solid var(--bdr);border-radius:4px;padding:2px 7px;letter-spacing:.5px">${esc(r.placa.toUpperCase())}</span>` : ''}
        <span style="font-size:12px;color:var(--t1);flex:1;min-width:120px">👤 ${esc(r.nombreConductor || '—')}</span>
        ${r.telefonoConductor ? `<span style="font-size:12px;color:var(--t2)">${esc(r.telefonoConductor)}</span>${_waBtn(r.telefonoConductor)}` : ''}
      </div>`;
    }).join('') || `<div style="font-size:11px;color:var(--t3);padding:8px 0;text-align:center">Sin ${curTab === 'moto' ? 'motos' : curTab === 'carro' ? 'carros' : 'vehículos'} registrados</div>`;
    pane.innerHTML = `<div class="mov-panel">
      <div class="mov-totals-row">
        <div class="mov-total mo"><span class="lbl">🏍 Registradas:</span><span class="tot-val">${totalMotosReg}</span><span class="sep">/ necesarias:</span><span style="font-weight:600;color:var(--t1)">${motosNec}</span></div>
        <div class="mov-total ca"><span class="lbl">🚗 Registrados:</span><span class="tot-val">${totalCarrosReg}</span><span class="sep">/ necesarios:</span><span style="font-weight:600;color:var(--t1)">${carrosNec}</span></div>
      </div>
      ${_movTabBar(id, curTab, n, ck, totalMotosReg, totalCarrosReg)}
      <div style="margin:4px 0 8px">${viewCards}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${_isReadOnly() ? '' : `<button class="export-btn" onclick="editMov('${n}','${ckE}','${id}')">✏️ Editar</button>`}
        <button class="export-btn" style="background:var(--bg2);color:var(--t1);border:1px solid var(--bdr)" onclick="exportMovPDF('${n}','${ck.replace(/'/g, "\\'")}')">📄 Exportar PDF</button>
      </div>
    </div>`;
    return;
  }

  // ── EDIT MODE ──
  const indexedResps = resps.map((r, i) => ({ r, i }));
  const filteredEdit = curTab === 'all' ? indexedResps : indexedResps.filter(({r}) => r.tipo === curTab);
  const respCards = filteredEdit.length
    ? filteredEdit.map(({ r, i }) => `
      <div class="resp-card" style="padding:10px 12px;margin-bottom:8px;background:var(--bg2);border-radius:8px;border:1px solid var(--bdr)">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="resp-num" style="font-weight:700;color:var(--t2);min-width:22px">#${i + 1}</span>
          <select style="font-size:12px;padding:3px 6px;border-radius:5px;border:1px solid var(--bdr);background:var(--bg);color:var(--fg);flex-shrink:0"
            onchange="updateResp('${n}','${ckE}',${i},'tipo',this.value,'${id}')">
            <option value="moto" ${r.tipo === 'moto' ? 'selected' : ''}>🏍 Moto</option>
            <option value="carro" ${r.tipo === 'carro' ? 'selected' : ''}>🚗 Carro</option>
          </select>
          <input class="resp-name-inp" type="text" placeholder="Placa" value="${esc(r.placa || '')}"
            style="width:90px;font-size:12px;text-transform:uppercase;flex-shrink:0"
            onchange="updateResp('${n}','${ckE}',${i},'placa',this.value,'${id}')">
          <div style="flex:1;min-width:180px;background:var(--bg);border-radius:6px;padding:6px 9px">
            <div style="font-size:10px;font-weight:600;color:var(--t2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px">Conductor</div>
            <input class="resp-name-inp" type="text" placeholder="Nombre" value="${esc(r.nombreConductor || '')}"
              style="width:100%;margin-bottom:4px"
              onchange="updateResp('${n}','${ckE}',${i},'nombreConductor',this.value,'${id}')">
            <div style="display:flex;align-items:center;gap:4px">
              <input class="resp-phone-inp" type="text" placeholder="Teléfono" value="${esc(r.telefonoConductor || '')}"
                style="flex:1"
                onchange="updateResp('${n}','${ckE}',${i},'telefonoConductor',this.value,'${id}')">
              ${_waBtn(r.telefonoConductor)}
            </div>
          </div>
          <button class="del-btn" style="flex-shrink:0" onclick="delResp('${n}','${ckE}',${i},'${id}')">×</button>
        </div>
      </div>`).join('')
    : `<div style="font-size:11px;color:var(--t3);padding:8px 0;text-align:center">Sin ${curTab === 'moto' ? 'motos' : curTab === 'carro' ? 'carros' : 'vehículos'} registrados aún</div>`;
  const addLabel = curTab === 'moto' ? '+ Agregar moto' : curTab === 'carro' ? '+ Agregar carro' : '+ Agregar vehículo';
  const addTipo  = curTab === 'all' ? 'moto' : curTab;
  pane.innerHTML = `<div class="mov-panel">
    <div class="mov-totals-row">
      <div class="mov-total mo">
        <span class="lbl">🏍 Registradas:</span>
        <span class="tot-val" id="${id}-tot-mo">${totalMotosReg}</span>
        <span class="sep">/ necesarias:</span>
        <input class="nec-inp" type="number" min="0" value="${motosNec}"
          onchange="saveMovNec('${n}','${ckE}','motos_nec',this.value)">
      </div>
      <div class="mov-total ca">
        <span class="lbl">🚗 Registrados:</span>
        <span class="tot-val" id="${id}-tot-ca">${totalCarrosReg}</span>
        <span class="sep">/ necesarios:</span>
        <input class="nec-inp" type="number" min="0" value="${carrosNec}"
          onchange="saveMovNec('${n}','${ckE}','carros_nec',this.value)">
      </div>
    </div>
    ${_movTabBar(id, curTab, n, ck, totalMotosReg, totalCarrosReg)}
    <div class="resp-list" id="${id}-resp-list">${respCards}</div>
    <button class="resp-add-btn" onclick="addResp('${n}','${ckE}','${id}','${addTipo}')">${addLabel}</button>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
      <button class="mv-save-all" onclick="saveMovAll('${n}','${ckE}','${id}')">💾 Guardar movilidad</button>
      ${resps.length > 0 ? `<button onclick="cancelMov('${n}','${ckE}','${id}')" style="padding:5px 12px;font-size:12px;border-radius:5px;border:1px solid var(--bdr);background:var(--bg2);color:var(--t2);cursor:pointer">✕ Cancelar</button>` : ''}
    </div>
  </div>`;
}

function editMov(n, ck, id) { _movEditMode.add(id); renderMovPanel(n, ck, id); }
function cancelMov(n, ck, id) { _movEditMode.delete(id); renderMovPanel(n, ck, id); }
function setMovSubTab(id, tab, n, ck) { _movSubTab.set(id, tab); renderMovPanel(n, ck, id); }

// ── Shared helpers ──────────────────────────────────────────────────
const _MOV_PDF_CSS = `
  body{font-family:Arial,sans-serif;font-size:12px;margin:24px 28px;color:#222}
  .page-hdr{background:#1a2030;color:#f5c842;padding:10px 14px;border-radius:6px;margin-bottom:14px}
  .page-hdr h1{font-size:16px;margin:0 0 3px}
  .page-hdr .sub{font-size:11px;color:#ccc}
  .sec-hdr{background:#1a2030;color:#f5c842;padding:7px 12px;border-radius:5px;margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid}
  .sec-hdr .nm{font-size:13px;font-weight:700}
  .sec-hdr .coord{font-size:10px;color:#ccc}
  .stats{display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .stat{background:#f5f7fa;border:1px solid #e0e4ea;border-radius:5px;padding:6px 12px}
  .stat .val{font-size:17px;font-weight:700;color:#1a2030}
  .stat .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px}
  .stat .nec{font-size:10px;color:#aaa}
  h3{font-size:12px;margin:12px 0 5px;color:#1a2030;border-left:3px solid #f5c842;padding-left:7px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}
  thead tr{background:#f0f0f0}
  th{padding:5px 7px;border:1px solid #ddd;text-align:left;font-size:10px}
  td{padding:4px 7px;border:1px solid #ddd}
  .empty{color:#999;font-style:italic;font-size:11px;margin:2px 0 10px}
  @media print{body{margin:12px 14px}.sec-hdr{page-break-before:auto}}`;

function _movVehTable(list) {
  if (!list.length) return '';
  return `<table><thead><tr><th>#</th><th>Placa</th><th>Conductor</th><th>Teléfono</th></tr></thead><tbody>
    ${list.map((r, i) => `<tr style="background:${i%2===0?'#fff':'#fafafa'}">
      <td style="color:#aaa">${i+1}</td>
      <td style="font-weight:700;letter-spacing:.4px">${esc((r.placa||'').toUpperCase())||'—'}</td>
      <td>${esc(r.nombreConductor||'—')}</td>
      <td>${esc(r.telefonoConductor||'—')}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

function _movComunaSection(n, ck, s) {
  const mov = s.movilidad?.[ck] || { responsables: [], motos_nec: 0, carros_nec: 0 };
  _migrateMovResps(mov);
  const resps = mov.responsables;
  const motos = resps.filter(r => r.tipo === 'moto');
  const carros = resps.filter(r => r.tipo === 'carro');
  const sc = (s.comunas || {})[ck] || {};
  return `
    <div class="sec-hdr">
      <span class="nm">${esc(ck)}</span>
      ${sc.coord ? `<span class="coord">👤 ${esc(sc.coord)}${sc.phone ? ' · ' + esc(sc.phone) : ''}</span>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><div class="val">${motos.length}</div><div class="lbl">🏍 Motos</div><div class="nec">/ ${mov.motos_nec||0} nec.</div></div>
      <div class="stat"><div class="val">${carros.length}</div><div class="lbl">🚗 Carros</div><div class="nec">/ ${mov.carros_nec||0} nec.</div></div>
      <div class="stat"><div class="val">${motos.length+carros.length}</div><div class="lbl">Total</div></div>
    </div>
    <h3>🏍 Motos (${motos.length})</h3>
    ${motos.length ? _movVehTable(motos) : '<p class="empty">Sin motos registradas</p>'}
    <h3>🚗 Carros (${carros.length})</h3>
    ${carros.length ? _movVehTable(carros) : '<p class="empty">Sin carros registrados</p>'}`;
}

function _movOpenPrint(title, body) {
  const footer = `<div style="font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #eee;padding-top:6px">
    Coordinación Electoral · Defensores de la Patria · ${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${_MOV_PDF_CSS}</style></head><body>${body}${footer}</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ── Per-commune (called from inline button inside panel) ─────────────
function exportMovPDF(n, ck) {
  const menu = document.getElementById('mov-pdf-menu'); if (menu) menu.classList.remove('show');
  const s = gs(n);
  const sc = (s.comunas || {})[ck] || {};
  const header = `<div class="page-hdr"><h1>Plan de Movilidad</h1>
    <div class="sub">${esc(ck)}${sc.coord ? ' · Coord: ' + esc(sc.coord) + (sc.phone ? ' · ' + esc(sc.phone) : '') : ''}</div></div>`;
  _movOpenPrint('Movilidad — ' + ck, header + _movComunaSection(n, ck, s));
}

// ── Per-municipality ─────────────────────────────────────────────────
function exportMovPDFMuni(n) {
  const menu = document.getElementById('mov-pdf-menu'); if (menu) menu.classList.remove('show');
  if (!RAW[n]) return;
  const s = gs(n);
  const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
  const header = `<div class="page-hdr"><h1>Plan de Movilidad — ${esc(label)}</h1>
    <div class="sub">${Object.keys(RAW[n]).length} comunas / sectores</div></div>`;
  const body = header + Object.keys(RAW[n]).sort().map(ck => _movComunaSection(n, ck, s)).join('');
  _movOpenPrint('Movilidad — ' + label, body);
}

// ── Per-zona (Medellín only) ─────────────────────────────────────────
function exportMovPDFZona(n, zonaNombre) {
  const menu = document.getElementById('mov-pdf-menu'); if (menu) menu.classList.remove('show');
  const zona = MEDELLIN_ZONAS.find(z => z.nombre === zonaNombre); if (!zona) return;
  const s = gs(n);
  const header = `<div class="page-hdr"><h1>Plan de Movilidad — ${esc(zonaNombre)}</h1>
    <div class="sub">Zona de Medellín · ${zona.comunas.filter(ck => RAW[n]?.[ck]).length} comunas</div></div>`;
  const body = header + zona.comunas.filter(ck => RAW[n]?.[ck]).map(ck => _movComunaSection(n, ck, s)).join('');
  _movOpenPrint('Movilidad — ' + zonaNombre, body);
}

// ── All AMVA ─────────────────────────────────────────────────────────
function exportMovPDFAll() {
  const menu = document.getElementById('mov-pdf-menu'); if (menu) menu.classList.remove('show');
  let body = `<div class="page-hdr"><h1>Plan de Movilidad — AMVA Completo</h1>
    <div class="sub">${ALL_MUNIS.filter(n => RAW[n]).length} municipios</div></div>`;
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n);
    const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
    body += `<div style="margin-top:24px;page-break-before:always">
      <div style="font-size:15px;font-weight:700;color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:6px;margin-bottom:10px">${esc(label)}</div>
      ${Object.keys(RAW[n]).sort().map(ck => _movComunaSection(n, ck, s)).join('')}
    </div>`;
  });
  _movOpenPrint('Movilidad AMVA', body);
}

function updateResp(n, ck, idx, field, val, id) {
  const s = gs(n);
  if (!s.movilidad[ck].responsables[idx]) return;
  s.movilidad[ck].responsables[idx][field] = val;
  saveLocalSt();
  writeDebounced(n, 700);
  // Update totals in-place
  const resps = s.movilidad[ck].responsables;
  const moEl = document.getElementById(id + '-tot-mo'); if (moEl) moEl.textContent = resps.filter(r => r.tipo === 'moto').length;
  const caEl = document.getElementById(id + '-tot-ca'); if (caEl) caEl.textContent = resps.filter(r => r.tipo === 'carro').length;
  // Refresh WA button on phone fields without full re-render
  if (field === 'telefonoConductor') renderMovPanel(n, ck, id);
}
async function addResp(n, ck, id, tipo) {
  tipo = tipo || 'moto';
  const s = gs(n);
  if (!s.movilidad[ck].responsables) s.movilidad[ck].responsables = [];
  s.movilidad[ck].responsables.push({ tipo, placa: '', nombreConductor: '', telefonoConductor: '' });
  saveLocalSt();
  await writeMuni(n);
  renderMovPanel(n, ck, id);
}
async function delResp(n, ck, idx, id) {
  const s = gs(n);
  const resp = s.movilidad[ck].responsables[idx];
  // Delete from backend if it has a backend ID
  if (resp?._backendId && window.api && window.CURRENT_USER) {
    api.delete(`/movilidad/${resp._backendId}`).catch(err => console.warn('[mov] delete failed', err));
  }
  s.movilidad[ck].responsables.splice(idx, 1);
  saveLocalSt();
  renderMovPanel(n, ck, id);
}
function saveMovNec(n, ck, field, val) {
  const s = gs(n); if (!s.movilidad) s.movilidad = {}; if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: 0, carros_nec: 0 };
  s.movilidad[ck][field] = parseInt(val) || 0; saveLocalSt();
  writeDebounced(n, 500);
}
async function saveMovAll(n, ck, id) {
  const s = gs(n);
  saveLocalSt();
  // Sync each vehicle to backend
  if (window.api && window.CURRENT_USER) {
    const ccIds = _puestoIdCache[n]?._ccIds;
    const comunaId = ccIds?.[ck] ?? ccIds?.[(ck || '').toUpperCase()];
    if (comunaId) {
      const resps = s.movilidad[ck]?.responsables || [];
      for (const r of resps) {
        const payload = {
          vehicleType: r.tipo || 'moto',
          plate: r.placa || '',
          driverName: r.nombreConductor || '',
          driverPhone: r.telefonoConductor || undefined,
        };
        try {
          if (r._backendId) {
            await api.patch(`/movilidad/${r._backendId}`, payload);
          } else {
            const created = await api.post('/movilidad', { ...payload, scopeType: 'COMUNA', scopeId: comunaId });
            r._backendId = created.id;
          }
        } catch(err) { console.warn('[mov] sync failed', err); }
      }
      saveLocalSt();
    }
  }
  _movEditMode.delete(id);
  renderMovPanel(n, ck, id);
}

// Load movilidad for a municipality from the backend so all users see the latest data.
async function loadMovilidadForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const ccIds = _puestoIdCache[n]?._ccIds;
  if (!ccIds) return;
  const s = gs(n);
  if (!s.movilidad) s.movilidad = {};
  let changed = false;
  const fetches = Object.keys(RAW[n] || {}).map(async ck => {
    const comunaId = ccIds[ck] ?? ccIds[(ck || '').toUpperCase()];
    if (!comunaId) return;
    try {
      const vehicles = await api.get(`/movilidad?scopeType=COMUNA&scopeId=${comunaId}`);
      if (!Array.isArray(vehicles) || vehicles.length === 0) return;
      if (!s.movilidad[ck]) s.movilidad[ck] = { responsables: [], motos_nec: s.movilidad[ck]?.motos_nec || 0, carros_nec: s.movilidad[ck]?.carros_nec || 0 };
      s.movilidad[ck].responsables = vehicles.map(v => ({
        tipo: v.vehicleType || 'moto',
        placa: v.plate || '',
        nombreConductor: v.driverName || '',
        telefonoConductor: v.driverPhone || '',
        _backendId: v.id,
      }));
      changed = true;
    } catch(e) {}
  });
  await Promise.all(fetches);
  if (changed) { saveLocalSt(); if (n === CUR) rerenderIfNotEditing(); }
}

// ═══ MODAL ═══
let MCX = null, SEL_T = 'n';
function openM(title, sub, ctx, opts = {}) {
  MCX = ctx; SEL_T = opts.tag || 'n';
  document.getElementById('mo-t').textContent = title; document.getElementById('mo-s').textContent = sub;
  document.getElementById('mi-c').value = opts.coord || ''; document.getElementById('mi-p').value = opts.phone || '';
  document.getElementById('mf-tag').style.display = opts.showTag ? '' : 'none';
  document.getElementById('mf-notes').style.display = opts.showNotes ? '' : 'none';
  if (opts.showNotes) document.getElementById('mi-n').value = opts.notes || '';
  document.querySelectorAll('.topt').forEach(t => t.classList.toggle('sel', t.dataset.t === SEL_T));
  document.getElementById('modal').style.display = 'flex';
  setTimeout(() => document.getElementById('mi-c').focus(), 50);
}
function closeM() { document.getElementById('modal').style.display = 'none'; MCX = null; }
function selT(el) { SEL_T = el.dataset.t; document.querySelectorAll('.topt').forEach(t => t.classList.remove('sel')); el.classList.add('sel'); }
async function saveM() {
  if (!MCX) return;
  const coord = document.getElementById('mi-c').value.trim();
  const phone = document.getElementById('mi-p').value.trim();
  const notes = document.getElementById('mi-n')?.value.trim() || '';
  const s = gs(MCX.n);
  if (MCX.type === 'muni') {
    s.coord = coord; s.phone = phone;
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'cc') {
    if (!s.comunas) s.comunas = {}; s.comunas[MCX.ck] = { coord, phone };
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'p') {
    if (!s.puestos) s.puestos = {}; s.puestos[MCX.k] = { coord, phone, tag: SEL_T, notes };
    saveLocalSt();
    await writeMuni(MCX.n);
  } else if (MCX.type === 'zona') {
    if (!s.zonas) s.zonas = {};
    s.zonas[MCX.zonaNombre] = { coord, phone };
    saveLocalSt();
    await writeMuni(MCX.n);
  }
  // T94: persist coordinator to backend (best-effort, 409 silenced = user-coord exists)
  if (window.api && window.CURRENT_USER) {
    const _scopeTypeMap = { muni: 'municipio', cc: 'comuna', p: 'puesto', zona: 'zona' };
    const scopeStr = _scopeTypeMap[MCX.type];
    // For zona type, ensure _zonaIdCache is populated before looking up the ID
    if (MCX.type === 'zona') await _loadZonaIds();
    const scopeId = _coordScopeId(MCX.type, MCX.n, MCX.ck, MCX.k, MCX.zonaNombre);
    if (scopeStr && scopeId) {
      api.patch(`/coordinador/${scopeStr}/${scopeId}/adhoc`, { nombre: coord || null, telefono: phone || null })
        .catch(err => { if (err?.status !== 409) _onWriteError('coord adhoc patch failed', err); });
    }
  }
  const _waHtml = (phone, extra) => phone
    ? `<span${extra ? ` class="${extra}"` : ''}>· ${esc(phone)}</span><a class="wa-btn" href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp">💬</a>`
    : '';
  if (MCX.type === 'muni') {
    const el = document.getElementById('mh-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById('mh-phone-wa');
    if (pw) pw.innerHTML = phone ? `<div class="cp">${esc(phone)}<a class="wa-btn" href="https://wa.me/57${phone.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a></div>` : '';
    buildSB();
  } else if (MCX.type === 'cc') {
    const id = cid(MCX.n, MCX.ck);
    const el = document.getElementById(id + '-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById(id + '-phone-wa'); if (pw) pw.innerHTML = _waHtml(phone, 'cc-crd-ph');
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
  } else if (MCX.type === 'p') {
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
    else renderCCs(MCX.n);
  } else if (MCX.type === 'zona') {
    const zid = 'z_' + btoa(unescape(encodeURIComponent(MCX.zonaNombre))).replace(/[^a-z0-9]/gi, '');
    const el = document.getElementById(zid + '-cv'); if (el) el.textContent = coord || '—';
    const pw = document.getElementById(zid + '-phone-wa'); if (pw) pw.innerHTML = _waHtml(phone, '');
    if (document.getElementById('ot-todos')?.classList.contains('on')) renderAllPuestos(MCX.n);
  }
  closeM();
}
function editMuni(n) { const s = gs(n); openM(`Coordinador — ${n === 'MEDELLIN' ? 'MEDELLÍN' : n}`, 'Coordinador principal', { type: 'muni', n }, { coord: s.coord, phone: s.phone }); }
function editCC(n, ck) { const s = gs(n); const sc = (s.comunas || {})[ck] || {}; openM('Coordinador de zona', ck, { type: 'cc', n, ck }, { coord: sc.coord, phone: sc.phone }); }
function editZona(n, zonaNombre) { const s = gs(n); const sz = (s.zonas || {})[zonaNombre] || {}; openM('Coordinador de zona geográfica', zonaNombre, { type: 'zona', n, zonaNombre }, { coord: sz.coord, phone: sz.phone }); }
function editP(n, k, ck) { if (ck !== undefined) { editPCard(n, k, ck); return; } const s = gs(n); const ps = (s.puestos || {})[k] || {}; openM('Puesto de votación', k.replace(/_/g, ' '), { type: 'p', n, k }, { coord: ps.coord, phone: ps.phone, tag: ps.tag || 'n', notes: ps.notes, showTag: true, showNotes: true }); }

// ═══ OVERVIEW ═══
function renderOV() {
  const wrap = document.getElementById('ov-wrap'); if (!wrap) return;
  let html = '';
  Object.entries(REGIONES).forEach(([region, munis]) => {
    const validMusis = munis.filter(n => RAW[n]);
    if (!validMusis.length) return;
    const rTotP = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.length, 0), 0);
    const rTotM = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.reduce((d, p) => d + (p.mesas || 0), 0), 0), 0);
    const rTotV = validMusis.reduce((a, n) => a + Object.values(RAW[n]).reduce((b, c) => b + c.reduce((d, p) => d + (p.total || 0), 0), 0), 0);
    const rTotZ = validMusis.reduce((a, n) => a + Object.keys(RAW[n]).length, 0);
    let rTestReg = 0, rTestFalt = 0, rCapacidad = 0;
    const _allMusisHaveDsStats = validMusis.every(n => _dashboardStatsByMuni[n]);
    if (_allMusisHaveDsStats) {
      validMusis.forEach(n => { rTestReg += _dashboardStatsByMuni[n].testigosCount; });
      rTestFalt = Math.max(0, rTotM - rTestReg);
    } else {
      validMusis.forEach(n => Object.keys(RAW[n]).forEach(c => {
        const st = _ccStats(n, c);
        rTestReg += st.testReg; rTestFalt += st.mesasSinAsignar; rCapacidad += st.capacidadCubrir;
      }));
    }
    const rPct = _allMusisHaveDsStats
      ? (rTotM ? Math.round(rTestReg / rTotM * 100) : 0)
      : _coveragePct(rCapacidad, rTotM);
    html += `
    <div style="margin-top:22px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:var(--fg)">${region} <span style="font-size:11px;font-weight:400;color:var(--t2)">· ${validMusis.length} municipios</span></div>
        <button class="export-btn" style="font-size:11px;padding:5px 12px" onclick="openRegionMap('${region}')">🗺 Mapa</button>
      </div>
      <div class="stats" style="margin-bottom:10px">
        <div class="sc"><div class="sl">Puestos</div><div class="sv">${rTotP}</div></div>
        <div class="sc"><div class="sl">Mesas</div><div class="sv">${rTotM.toLocaleString('es-CO')}</div></div>
        <div class="sc"><div class="sl">Zonas/Comunas</div><div class="sv">${rTotZ}</div></div>
        <div class="sc"><div class="sl">Votantes</div><div class="sv">${(rTotV / 1000).toFixed(0)}K</div></div>
        <div class="sc"><div class="sl">Testigos</div><div class="sv">${rTestReg}</div></div>
        <div class="sc${rTestFalt > 0 ? ' sc-warn' : ''}"><div class="sl">Mesas sin asignar</div><div class="sv">${rTestFalt}</div></div>
        <div class="sc"><div class="sl">% Cobertura</div><div class="sv">${rPct}%</div></div>
      </div>
    </div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px;margin-bottom:8px">`;
    validMusis.forEach(n => {
      const s = gs(n);
      const ckeys = Object.keys(RAW[n]);
      const totP = ckeys.reduce((a, c) => a + RAW[n][c].length, 0);
      const totM = ckeys.reduce((a, c) => a + RAW[n][c].reduce((b, p) => b + (p.mesas || 0), 0), 0);
      const totV = ckeys.reduce((a, c) => a + RAW[n][c].reduce((b, p) => b + (p.total || 0), 0), 0);
      let testReg = 0, testFalt = 0, mCap = 0;
      ckeys.forEach(c => {
        const st = _ccStats(n, c);
        testReg += st.testReg; testFalt += st.mesasSinAsignar; mCap += st.capacidadCubrir;
      });
      const pct = _coveragePct(mCap, totM);
      const apiCount = _testigoCountsByMuni[n];
      const displayCount = apiCount !== undefined ? apiCount : testReg;
      const apiStat = _dashboardStatsByMuni[n];
      const displayPct = apiStat !== undefined ? apiStat.coberturaPct : pct;
      html += `<div class="ov-muni-card" onclick="selMuni('${n}')">
        <div class="ov-muni-nm">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</div>
        <div class="ov-muni-sub">${ckeys.length} zonas · ${totP} puestos · ${totM.toLocaleString('es-CO')} mesas</div>
        ${s.coord ? `<div class="ov-muni-coord">👤 ${esc(s.coord)}</div>` : `<div class="ov-muni-coord" style="font-style:italic;color:var(--t3)">Sin coordinador</div>`}
        <div class="ov-muni-stats">
          <span class="ov-stat"><b>${(totV/1000).toFixed(0)}K</b><span>Votantes</span></span>
          <span class="ov-stat"><b data-testigo-count="${n}">${displayCount}</b><span>Testigos</span></span>
          <span class="ov-stat${testFalt > 0 ? ' warn' : ''}"><b>${testFalt}</b><span>Mesas sin asignar</span></span>
          <span class="ov-stat"><b data-cobertura-muni="${n}">${displayPct}%</b><span>Cobertura</span></span>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeM();
  if (e.key === 'Enter' && document.getElementById('modal').style.display !== 'none' && document.activeElement.tagName !== 'TEXTAREA') saveM();
});

// ═══ DIRECTORIO ═══
function openDirectorio() { document.getElementById('dir-modal').style.display = 'flex'; renderDirectorio(); }
function closeDirectorio() { document.getElementById('dir-modal').style.display = 'none'; }
function renderDirectorio() {
  const el = document.getElementById('dir-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return; const s = gs(n);
    const muniLabel = n === 'MEDELLIN' ? 'MEDELLÍN' : n;

    // ── Municipality-level coordinator header ──
    if (s.coord) {
      html += `<div class="dir-section" style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">${muniLabel}</h3>
          <button class="export-btn" style="font-size:11px;padding:3px 10px" onclick="exportDirectorioSeccionPDF('${n}','')">📄 PDF municipio</button>
        </div>
        <div class="dir-row">
          <div><div class="dir-name">${esc(s.coord)}</div><div class="dir-role">Coordinador ${n === 'MEDELLIN' ? 'ciudad' : 'municipal'}</div></div>
          <div class="dir-phone">${s.phone ? esc(s.phone) : '<span style="color:var(--t3)">Sin teléfono</span>'}</div>
        </div></div>`;
    }

    // ── Per-commune sections ──
    Object.keys(RAW[n]).sort().forEach(ck => {
      const sc = (s.comunas || {})[ck] || {};
      const items = [];
      if (sc.coord) items.push({ rol: 'Coord. zona/comuna', nombre: sc.coord, phone: sc.phone || '' });
      RAW[n][ck].forEach(p => {
        const ps = (s.puestos || {})[pk(p)] || {};
        if (ps.coord) items.push({ rol: 'Coord. puesto · ' + p.puesto, nombre: ps.coord, phone: ps.phone || '' });
      });
      if (!items.length) return;
      const ckE = ck.replace(/'/g, "\\'");
      html += `<div class="dir-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0;font-size:13px">${esc(ck)}</h3>
          <button class="export-btn" style="font-size:11px;padding:3px 10px" onclick="exportDirectorioSeccionPDF('${n}','${ckE}')">📄 PDF</button>
        </div>
        ${items.map(it => `<div class="dir-row">
          <div><div class="dir-name">${esc(it.nombre)}</div><div class="dir-role">${esc(it.rol)}</div></div>
          <div class="dir-phone">${it.phone ? esc(it.phone) : '<span style="color:var(--t3)">Sin teléfono</span>'}</div>
        </div>`).join('')}</div>`;
    });
  });
  if (!html) html = '<div class="dir-empty">Aún no hay coordinadores registrados.</div>';
  el.innerHTML = html;
}
// Build coordinator-only table rows for a municipality (optionally filtered to one commune)
function _dirCoordRows(n, ckFilter) {
  if (!RAW[n]) return [];
  const s = gs(n); const items = [];
  if (!ckFilter && s.coord) items.push({ rol: `Coordinador ${n === 'MEDELLIN' ? 'ciudad' : 'municipal'}`, nombre: s.coord, phone: s.phone || '', zona: '—' });
  Object.keys(RAW[n]).sort().filter(ck => !ckFilter || ck === ckFilter).forEach(ck => {
    const sc = (s.comunas || {})[ck] || {};
    if (sc.coord) items.push({ rol: 'Coord. zona/comuna', nombre: sc.coord, phone: sc.phone || '', zona: ck });
    RAW[n][ck].forEach(p => {
      const ps = (s.puestos || {})[pk(p)] || {};
      if (ps.coord) items.push({ rol: 'Coord. puesto', nombre: ps.coord, phone: ps.phone || '', zona: p.puesto });
    });
  });
  return items;
}

function _dirBuildHTML(title, sections) {
  const now = new Date().toLocaleString('es-CO');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:16px;color:#1a2030;margin-bottom:4px}.meta{font-size:11px;color:#666;margin-bottom:20px}@media print{body{padding:10px}}</style>
  </head><body>
    <h1>👥 ${title}</h1><div class="meta">Generado: ${now} · Coordinación Electoral AMVA 2026</div>
    ${sections || '<p>Sin coordinadores registrados.</p>'}
  </body></html>`;
}

function _dirSectionHTML(label, items) {
  if (!items.length) return '';
  return `<div style="margin-bottom:20px;page-break-inside:avoid">
    <h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:6px;margin-bottom:10px;font-size:13px">${label}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <tr style="background:#f0f0f0">
        <th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Nombre</th>
        <th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Rol</th>
        <th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Zona / Puesto</th>
        <th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Teléfono</th>
      </tr>
      ${items.map(it => `<tr>
        <td style="padding:5px 8px;border:1px solid #ddd">${esc(it.nombre)}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${esc(it.rol)}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${esc(it.zona) || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${it.phone ? esc(it.phone) : '—'}</td>
      </tr>`).join('')}
    </table></div>`;
}

// Export full AMVA coordinators directory (called from modal header button)
function exportDirectorioPDF() {
  let sections = '';
  ALL_MUNIS.forEach(n => {
    const items = _dirCoordRows(n, null);
    if (items.length) sections += _dirSectionHTML(n === 'MEDELLIN' ? 'MEDELLÍN' : n, items);
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(_dirBuildHTML('Directorio de Coordinadores — AMVA 2026', sections));
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// Export only zone/commune coordinators (no puesto coords)
function exportDirZonasComunasPDF() {
  let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n);
    const items = [];
    // Municipal coordinator
    if (s.coord) items.push({ rol: `Coordinador ${n === 'MEDELLIN' ? 'ciudad' : 'municipal'}`, nombre: s.coord, phone: s.phone || '', zona: '—' });
    // Zone coordinators (Medellín only)
    if (n === 'MEDELLIN') {
      MEDELLIN_ZONAS.forEach(zona => {
        const sz = (s.zonas || {})[zona.nombre] || {};
        if (sz.coord) items.push({ rol: 'Coord. zona', nombre: sz.coord, phone: sz.phone || '', zona: zona.nombre });
      });
    }
    // Commune coordinators
    Object.keys(RAW[n]).sort().forEach(ck => {
      const sc = (s.comunas || {})[ck] || {};
      if (sc.coord) items.push({ rol: 'Coord. zona/comuna', nombre: sc.coord, phone: sc.phone || '', zona: ck });
    });
    if (items.length) sections += _dirSectionHTML(n === 'MEDELLIN' ? 'MEDELLÍN' : n, items);
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(_dirBuildHTML('Directorio de Coordinadores — Zonas y Comunas AMVA 2026', sections));
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// Export coordinators directory for a single commune or municipality (called from modal per-section buttons)
function exportDirectorioSeccionPDF(n, ck) {
  const items = _dirCoordRows(n, ck || null);
  const label = ck ? ck : (n === 'MEDELLIN' ? 'MEDELLÍN' : n);
  const title = `Directorio de Coordinadores — ${label}`;
  const sections = _dirSectionHTML(label, items);
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(_dirBuildHTML(title, sections));
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ START APP ═══
async function startApp() {
  var overlay = document.getElementById('auth-gate-overlay');
  if (overlay) overlay.style.display = 'none';
  document.getElementById('login-screen').style.display = 'none'; // safety net
  ST = loadLocalSt();
  setSyncBadge('syncing', '⏳ Cargando...');
  await loadFromFirestore();
  _innerPreload();
  saveLocalSt();
  setSyncBadge('synced', '✓ Datos cargados');
  setTimeout(() => setSyncBadge('', 'Sin cambios'), 2000);
  _initialized = true;
  buildSB();
  renderOV();
  loadAllTestigosForAllMusis(); // load all testigos in background for overview stats
  loadTestigoCounts();
  loadDashboardStats();
  buildExportMenu();
  buildExcelMenu();
  buildMovPDFMenu();
  buildRefrigPDFMenu();
  startListener();
  if (typeof initInactivityDetection === 'function') initInactivityDetection();
  if (typeof initProfileWidget === 'function' && window.CURRENT_USER) initProfileWidget(window.CURRENT_USER);
  // Show testigos page button for all authenticated roles
  if (window.CURRENT_USER) {
    const _tBtn = document.getElementById('btn-testigos-page');
    if (_tBtn) _tBtn.classList.remove('hidden');
  }
}

// ═══ EXPORT PDF ═══
function toggleExportMenu() { document.getElementById('export-menu').classList.toggle('show'); }
function toggleExcelMenu() { document.getElementById('excel-menu').classList.toggle('show'); }
function toggleMovPDFMenu() { document.getElementById('mov-pdf-menu').classList.toggle('show'); }
function toggleRefrigPDFMenu() { document.getElementById('refrig-pdf-menu').classList.toggle('show'); }
document.addEventListener('click', function (e) {
  if (!e.target.closest('.export-wrap')) {
    document.getElementById('export-menu').classList.remove('show');
    document.getElementById('excel-menu').classList.remove('show');
    const m = document.getElementById('mov-pdf-menu'); if (m) m.classList.remove('show');
    const r = document.getElementById('refrig-pdf-menu'); if (r) r.classList.remove('show');
  }
});

function buildExportMenu() {
  const list = document.getElementById('export-comuni-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportPDF('zona','MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportPDF('comuna','MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportPDF('muni','${n}','')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

function buildExcelMenu() {
  const list = document.getElementById('excel-comuni-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportExcel('zona','MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportExcel('comuna','MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportExcel('muni','${n}')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

function buildMovPDFMenu() {
  const list = document.getElementById('mov-pdf-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportMovPDFZona('MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportMovPDF('MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportMovPDFMuni('${n}')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

function buildRefrigPDFMenu() {
  const list = document.getElementById('refrig-pdf-list'); if (!list) return;
  const sep = `<div style="height:1px;background:var(--b1);margin:4px 0"></div>`;
  const lbl = t => `<div style="font-size:9px;color:var(--t3);padding:3px 10px;text-transform:uppercase;letter-spacing:1px">${t}</div>`;
  let html = lbl('Por zona — Medellín');
  MEDELLIN_ZONAS.forEach(z => {
    html += `<div class="export-item" onclick="exportRefrigPDFZona('MEDELLIN','${z.nombre.replace(/'/g, "\\'")}')">🗺 ${z.nombre}</div>`;
  });
  if (RAW['MEDELLIN']) {
    html += sep + lbl('Por comuna — Medellín');
    Object.keys(RAW['MEDELLIN']).sort().forEach(ck => {
      html += `<div class="export-item" onclick="exportRefrigPDFComuna('MEDELLIN','${ck.replace(/'/g, "\\'")}')">📑 ${ck}</div>`;
    });
  }
  Object.entries(REGIONES).filter(([r]) => r !== 'AMVA').forEach(([region, munis]) => {
    const valid = munis.filter(n => RAW[n]);
    if (!valid.length) return;
    html += sep + lbl(region);
    valid.forEach(n => { html += `<div class="export-item" onclick="exportRefrigPDFMuni('${n}')">🏙️ ${n}</div>`; });
  });
  list.innerHTML = html;
}

// ── Refrigerios PDF CSS & helpers ────────────────────────────────────
const _REFRIG_PDF_CSS = `
  body{font-family:Arial,sans-serif;font-size:12px;margin:24px 28px;color:#222}
  .page-hdr{background:#1a2030;color:#f5c842;padding:10px 14px;border-radius:6px;margin-bottom:14px}
  .page-hdr h1{font-size:16px;margin:0 0 3px}
  .page-hdr .sub{font-size:11px;color:#ccc}
  .sec-hdr{background:#1a2030;color:#f5c842;padding:7px 12px;border-radius:5px;margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid}
  .sec-hdr .nm{font-size:13px;font-weight:700}
  .sec-hdr .coord{font-size:10px;color:#ccc}
  .counts{display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap}
  .cnt{background:#f5f7fa;border:1px solid #e0e4ea;border-radius:5px;padding:6px 12px;text-align:center;min-width:90px}
  .cnt .v{font-size:17px;font-weight:700;color:#1a2030}
  .cnt .l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px}
  .cnt.total{background:#fff8ec;border:2px solid #f5a623}
  .cnt.total .v{color:#f5a623;font-size:20px}
  .cnt.total .l{color:#f5a623;font-weight:600}
  .enc{background:#f9f9f9;border:1px solid #ddd;border-radius:5px;padding:8px 12px;margin-bottom:4px;font-size:12px}
  .enc .nm{font-weight:600;margin-bottom:2px}
  .enc .ph{color:#666}
  .no-enc{color:#bbb;font-style:italic;font-size:11px;margin-bottom:8px}
  @media print{body{margin:12px 14px}}`;

function _refrigPDFSection(n, ck, s) {
  const rc = _refrigCountComuna(n, ck);
  const rf = s.refrigerios?.[ck] || {};
  const sc = (s.comunas || {})[ck] || {};
  const puestos = RAW[n]?.[ck] || [];

  // Per-puesto breakdown
  const puestoRows = puestos.map((p, i) => {
    const testigos = (s.testigos?.[ck]?.[p.puesto] || []).filter(r => r.nombre).length;
    const ps = (s.puestos || {})[pk(p)] || {};
    const hasCoord = ps.coord ? 1 : 0;
    const subtotal = testigos + hasCoord;
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'}">
      <td style="padding:4px 7px;border:1px solid #e0e4ea;font-size:11px">${esc(p.puesto)}</td>
      <td style="padding:4px 7px;border:1px solid #e0e4ea;text-align:center">${testigos}</td>
      <td style="padding:4px 7px;border:1px solid #e0e4ea;text-align:center">${hasCoord ? '1' : '0'}</td>
      <td style="padding:4px 7px;border:1px solid #e0e4ea;text-align:center;font-weight:700;color:${subtotal > 0 ? '#f5a623' : '#aaa'}">${subtotal}</td>
    </tr>`;
  }).join('');

  const puestosTable = puestos.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px">
      <thead><tr style="background:#f0f0f0">
        <th style="padding:5px 7px;border:1px solid #e0e4ea;text-align:left">Puesto de votación</th>
        <th style="padding:5px 7px;border:1px solid #e0e4ea;text-align:center;white-space:nowrap">Testigos</th>
        <th style="padding:5px 7px;border:1px solid #e0e4ea;text-align:center;white-space:nowrap">Coord. puesto</th>
        <th style="padding:5px 7px;border:1px solid #e0e4ea;text-align:center;white-space:nowrap">🍱 Subtotal</th>
      </tr></thead>
      <tbody>${puestoRows}</tbody>
      <tfoot><tr style="background:#fff8ec;font-weight:700">
        <td style="padding:5px 7px;border:1px solid #e0e4ea">+ Coord. de comuna</td>
        <td style="border:1px solid #e0e4ea"></td>
        <td style="border:1px solid #e0e4ea"></td>
        <td style="padding:5px 7px;border:1px solid #e0e4ea;text-align:center;color:#aaa">${rc.coordComuna ? '1' : '0'}</td>
      </tr>
      <tr style="background:#fff3d6;font-weight:700">
        <td style="padding:6px 7px;border:1px solid #f5a623;color:#c47a00">TOTAL REFRIGERIOS</td>
        <td style="border:1px solid #f5a623"></td>
        <td style="border:1px solid #f5a623"></td>
        <td style="padding:6px 7px;border:1px solid #f5a623;text-align:center;font-size:15px;color:#f5a623">${rc.total}</td>
      </tr></tfoot>
    </table>` : '';

  return `
    <div class="sec-hdr">
      <span class="nm">${esc(ck)}</span>
      ${sc.coord ? `<span class="coord">👤 ${esc(sc.coord)}${sc.phone ? ' · ' + esc(sc.phone) : ''}</span>` : ''}
    </div>
    ${rf.nombre
      ? `<div class="enc" style="margin-bottom:8px"><div class="nm">🍱 Encargado: ${esc(rf.nombre)}</div>${rf.telefono ? `<div class="ph">📞 ${esc(rf.telefono)}</div>` : ''}</div>`
      : `<div class="no-enc">Sin encargado de refrigerios asignado</div>`}
    ${puestosTable}`;
}

function _refrigOpenPrint(title, body) {
  const footer = `<div style="font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #eee;padding-top:6px">
    Coordinación Electoral · Defensores de la Patria · ${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${_REFRIG_PDF_CSS}</style></head><body>${body}${footer}</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

function exportRefrigPDFComuna(n, ck) {
  const menu = document.getElementById('refrig-pdf-menu'); if (menu) menu.classList.remove('show');
  const s = gs(n);
  const sc = (s.comunas || {})[ck] || {};
  const header = `<div class="page-hdr"><h1>Refrigerios — ${esc(ck)}</h1>
    <div class="sub">${sc.coord ? 'Coord: ' + esc(sc.coord) + (sc.phone ? ' · ' + esc(sc.phone) : '') : 'Sin coordinador asignado'}</div></div>`;
  _refrigOpenPrint('Refrigerios — ' + ck, header + _refrigPDFSection(n, ck, s));
}

function exportRefrigPDFMuni(n) {
  const menu = document.getElementById('refrig-pdf-menu'); if (menu) menu.classList.remove('show');
  if (!RAW[n]) return;
  const s = gs(n);
  const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
  const header = `<div class="page-hdr"><h1>Refrigerios — ${esc(label)}</h1>
    <div class="sub">${Object.keys(RAW[n]).length} comunas / sectores</div></div>`;
  const body = header + Object.keys(RAW[n]).sort().map(ck => _refrigPDFSection(n, ck, s)).join('');
  _refrigOpenPrint('Refrigerios — ' + label, body);
}

function exportRefrigPDFZona(n, zonaNombre) {
  const menu = document.getElementById('refrig-pdf-menu'); if (menu) menu.classList.remove('show');
  const zona = MEDELLIN_ZONAS.find(z => z.nombre === zonaNombre); if (!zona) return;
  const s = gs(n);
  const comunasConDatos = zona.comunas.filter(ck => RAW[n]?.[ck]);
  const counts = comunasConDatos.map(ck => ({ ck, rc: _refrigCountComuna(n, ck) }));
  const totRefrig = counts.reduce((sum, { rc }) => sum + rc.total, 0);

  // Summary table for the zone
  const summaryTable = `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#555;margin-bottom:6px">Resumen por comuna</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Comuna</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Testigos</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Coord. puestos</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Coord. comuna</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;color:#f5a623">🍱 Total</th>
        </tr></thead>
        <tbody>
          ${counts.map(({ ck, rc }, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'}">
            <td style="padding:5px 8px;border:1px solid #ddd;font-size:11px">${esc(ck)}</td>
            <td style="padding:5px 8px;border:1px solid #ddd;text-align:center">${rc.testigos}</td>
            <td style="padding:5px 8px;border:1px solid #ddd;text-align:center">${rc.coordPuestos}</td>
            <td style="padding:5px 8px;border:1px solid #ddd;text-align:center">${rc.coordComuna}</td>
            <td style="padding:5px 8px;border:1px solid #ddd;text-align:center;font-weight:700;color:#f5a623">${rc.total}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="background:#fff3d6;font-weight:700">
          <td style="padding:7px 8px;border:2px solid #f5a623;color:#c47a00">TOTAL ZONA</td>
          <td style="padding:7px 8px;border:2px solid #f5a623;text-align:center">${counts.reduce((s,{rc})=>s+rc.testigos,0)}</td>
          <td style="padding:7px 8px;border:2px solid #f5a623;text-align:center">${counts.reduce((s,{rc})=>s+rc.coordPuestos,0)}</td>
          <td style="padding:7px 8px;border:2px solid #f5a623;text-align:center">${counts.reduce((s,{rc})=>s+rc.coordComuna,0)}</td>
          <td style="padding:7px 8px;border:2px solid #f5a623;text-align:center;font-size:16px;color:#f5a623">${totRefrig}</td>
        </tr></tfoot>
      </table>
    </div>`;

  const header = `<div class="page-hdr"><h1>Refrigerios — ${esc(zonaNombre)}</h1>
    <div class="sub">${comunasConDatos.length} comunas · Total refrigerios: <strong style="color:#f5c842">${totRefrig}</strong></div></div>`;
  const body = header + summaryTable + comunasConDatos.map(ck => _refrigPDFSection(n, ck, s)).join('');
  _refrigOpenPrint('Refrigerios — ' + zonaNombre, body);
}

function exportRefrigPDFAll() {
  const menu = document.getElementById('refrig-pdf-menu'); if (menu) menu.classList.remove('show');
  let body = `<div class="page-hdr"><h1>Refrigerios — AMVA Completo</h1>
    <div class="sub">${ALL_MUNIS.filter(n => RAW[n]).length} municipios</div></div>`;
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n);
    const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
    const totRefrig = Object.keys(RAW[n]).reduce((sum, ck) => sum + _refrigCountComuna(n, ck).total, 0);
    body += `<div style="margin-top:24px;page-break-before:always">
      <div style="font-size:15px;font-weight:700;color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:6px;margin-bottom:10px">${esc(label)} <span style="font-size:12px;color:#f5a623;font-weight:600">· ${totRefrig} refrigerios</span></div>
      ${Object.keys(RAW[n]).sort().map(ck => _refrigPDFSection(n, ck, s)).join('')}
    </div>`;
  });
  _refrigOpenPrint('Refrigerios AMVA', body);
}

function exportExcel(tipo, muni, ck) {
  document.getElementById('excel-menu').classList.remove('show');

  const TAG_LABELS = { n: 'Sin estado', ok: 'Cubierto', pr: 'Prioritario', pe: 'Pendiente', al: 'Alerta' };

  // Collect flat rows across municipalities (optionally filtered to one commune)
  function collectData(munis, ckFilter) {
    const isMulti = munis.length > 1;
    const rowsCoord = [], rowsTest = [], rowsMov = [];

    for (const n of munis) {
      if (!RAW[n]) continue;
      const s = gs(n);
      const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;
      const ckeys = Object.keys(RAW[n]).sort().filter(k => !ckFilter || (Array.isArray(ckFilter) ? ckFilter.includes(k) : k === ckFilter));

      for (const comunaKey of ckeys) {
        const puestos = RAW[n][comunaKey] || [];
        const sc = (s.comunas || {})[comunaKey] || {};
        const mov = s.movilidad?.[comunaKey] || {};
        const respNombres = (mov.responsables || []).map(r => r.nombre || '').filter(Boolean).join(' / ');
        const respTels    = (mov.responsables || []).map(r => r.telefono || '').filter(Boolean).join(' / ');

        rowsMov.push([...(isMulti ? [label] : []), comunaKey, sc.coord || '', sc.phone || '',
          mov.carros_nec || 0, mov.motos_nec || 0, respNombres, respTels]);

        for (const p of puestos) {
          const k = pk(p);
          const ps = (s.puestos || {})[k] || {};
          const testRows  = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
          const testReg   = testRows.filter(r => r.nombre).length;
          const divipole  = `${String(p.dd).padStart(2,'0')}.${String(p.mm).padStart(3,'0')}.${String(p.zz).padStart(2,'0')}.${String(p.pp).padStart(2,'0')}`;

          rowsCoord.push([...(isMulti ? [label] : []),
            comunaKey, sc.coord || '', sc.phone || '',
            p.puesto, p.direccion, divipole, p.mesas || 0, p.total || 0,
            TAG_LABELS[ps.tag || 'n'], ps.coord || '', ps.phone || '',
            testReg]);

          testRows.forEach((r, i) => rowsTest.push([...(isMulti ? [label] : []),
            comunaKey, p.puesto, i + 1, r.nombre || '', r.telefono || '']));
        }
      }
    }
    return { rowsCoord, rowsTest, rowsMov, isMulti };
  }

  function withHeaders({ rowsCoord, rowsTest, rowsMov, isMulti }) {
    const m = isMulti ? ['Municipio'] : [];
    rowsCoord.unshift([...m, 'Zona / Comuna', 'Coord. Zona', 'Tel. Zona', 'Puesto', 'Dirección', 'DIVIPOLE', 'Mesas', 'Votantes', 'Estado', 'Coord. Puesto', 'Tel. Puesto', 'Testigos Reg.']);
    rowsTest.unshift([...m,  'Zona / Comuna', 'Puesto', '#', 'Nombre', 'Teléfono']);
    rowsMov.unshift([...m,   'Zona / Comuna', 'Coord. Zona', 'Tel. Zona', 'Carros Nec.', 'Motos Nec.', 'Responsable(s)', 'Tel. Responsable(s)']);
    return { rowsCoord, rowsTest, rowsMov };
  }

  function makeSheet(rows, colWidths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = colWidths.map(wch => ({ wch }));
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
    return ws;
  }

  function build(munis, ckFilter, filename) {
    const wb = XLSX.utils.book_new();
    const raw = collectData(munis, ckFilter);
    const { rowsCoord, rowsTest, rowsMov } = withHeaders(raw);
    const { isMulti } = raw;
    const M = isMulti ? [12] : [];

    XLSX.utils.book_append_sheet(wb,
      makeSheet(rowsCoord, [...M, 26, 24, 14, 32, 26, 12, 7, 10, 12, 24, 14, 10]), 'Coordinación');
    if (rowsTest.length > 1)
      XLSX.utils.book_append_sheet(wb,
        makeSheet(rowsTest, [...M, 26, 32, 4, 28, 14]), 'Testigos');
    XLSX.utils.book_append_sheet(wb,
      makeSheet(rowsMov, [...M, 26, 24, 14, 12, 12, 30, 20]), 'Movilidad');

    XLSX.writeFile(wb, filename);
  }

  if (tipo === 'all') {
    build(AMVA, null, 'Comando_Electoral_AMVA_2026.xlsx');
  } else if (tipo === 'medellin') {
    build(['MEDELLIN'], null, 'Comando_Electoral_Medellin_2026.xlsx');
  } else if (tipo === 'muni') {
    build([muni], null, 'Comando_Electoral_' + muni + '_2026.xlsx');
  } else if (tipo === 'comuna') {
    build([muni], ck, 'Comando_' + ck.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '.xlsx');
  } else if (tipo === 'zona') {
    const zona = MEDELLIN_ZONAS.find(z => z.nombre === ck);
    if (zona) build(['MEDELLIN'], zona.comunas, 'Comando_Medellin_' + ck.replace(/[^a-zA-Z0-9]/g, '_') + '_2026.xlsx');
  }
}

function exportPDF(tipo, muni, ck) {
  document.getElementById('export-menu').classList.remove('show');
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(buildPrintHTML(tipo, muni, ck));
  win.document.close(); win.focus(); setTimeout(() => win.print(), 800);
}

function buildPrintHTML(tipo, muni, ck) {
  const now = new Date().toLocaleString('es-CO');
  let title = ''; let sections = '';
  function sectionForComuna(n, comunaKey) {
    const s = gs(n); const puestos = RAW[n][comunaKey] || [];
    const sc = (s.comunas || {})[comunaKey] || {};
    // Zone lookup (Medellín only)
    const zonaDef = n === 'MEDELLIN' ? (MEDELLIN_ZONAS.find(z => z.comunas.includes(comunaKey)) || null) : null;
    const sz = zonaDef ? ((s.zonas || {})[zonaDef.nombre] || {}) : null;
    const mov = s.movilidad?.[comunaKey] || {};
    const respsP = (mov.responsables || []);
    let puestosHTML = '';
    puestos.forEach(p => {
      const k = pk(p); const ps = (s.puestos || {})[k] || {};
      const testRows = (s.testigos?.[comunaKey]?.[p.puesto]) || [];
      let testHTML = '';
      if (testRows.length > 0) {
        testHTML = `<div style="margin-top:6px"><b style="font-size:11px;color:#1a8f4a">Testigos (${testRows.filter(r => r.nombre).length}):</b>
          <table style="width:100%;font-size:10px;border-collapse:collapse;margin-top:3px">
            <tr style="background:#efffef"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Nombre</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Teléfono</th></tr>
            ${testRows.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.nombre)}</td><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.telefono)}</td></tr>`).join('')}
          </table></div>`;
      }
      const tagLabels = { n: 'Sin estado', ok: '✓ Cubierto', pr: '★ Prioritario', pe: '⏳ Pendiente', al: '⚠ Alerta' };
      puestosHTML += `<div style="margin-bottom:12px;padding:10px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div><b style="font-size:12px">${p.puesto}</b><div style="font-size:10px;color:#666">${p.direccion}</div></div>
          <div style="text-align:right;font-size:10px">
            <div>${p.mesas || 0} mesas · ${(p.total || 0).toLocaleString('es-CO')} votantes</div>
            <div style="color:#888">${tagLabels[ps.tag || 'n']}</div>
            ${ps.coord ? `<div style="color:#1a6fd4">👤 ${esc(ps.coord)}${ps.phone ? ' · ' + esc(ps.phone) : ''}</div>` : ''}
          </div>
        </div>${testHTML}</div>`;
    });
    const movHTML = respsP.length ? `<div style="margin-top:8px;padding:8px;background:#fff8e6;border:1px solid #f5c842;border-radius:6px;font-size:11px">
      <b>Movilidad:</b>
      <table style="font-size:10px;border-collapse:collapse;width:100%;margin-top:4px"><tr style="background:#f0f0f0"><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Tipo</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Placa</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Conductor</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:left">Teléfono</th></tr>
      ${respsP.map(r => `<tr><td style="padding:3px 6px;border:1px solid #ddd">${r.tipo === 'moto' ? '🏍 Moto' : '🚗 Carro'}</td><td style="padding:3px 6px;border:1px solid #ddd;font-weight:600">${esc(r.placa)}</td><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.nombreConductor)}</td><td style="padding:3px 6px;border:1px solid #ddd">${esc(r.telefonoConductor)}</td></tr>`).join('')}
      </table></div>` : '';
    const coordInfo = `<div style="text-align:right;font-size:11px;line-height:1.6">
        ${zonaDef && sz?.coord ? `<div style="color:#f5c842">Coord. zona: ${esc(sz.coord)}${sz.phone ? ' · ' + esc(sz.phone) : ''}</div>` : ''}
        ${sc.coord ? `<div style="color:#aaa">Coord. comuna: ${esc(sc.coord)}${sc.phone ? ' · ' + esc(sc.phone) : ''}</div>` : (zonaDef ? '' : `<div style="color:#555">Sin coordinador de comuna</div>`)}
      </div>`;
    return `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="background:#1a2030;color:#f5c842;padding:10px 14px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:14px">${comunaKey}</b>
        ${coordInfo}
      </div>${movHTML}<div style="margin-top:10px">${puestosHTML}</div></div>`;
  }
  if (tipo === 'all') {
    title = 'Reporte Completo — Antioquia';
    ALL_MUNIS.forEach(n => {
      if (!RAW[n]) return; const s = gs(n);
      sections += `<div style="page-break-before:always;padding-top:16px">
        <h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${n === 'MEDELLIN' ? 'MEDELLÍN' : n} — Coordinador: ${esc(s.coord) || 'Sin asignar'}${s.phone ? ' · ' + esc(s.phone) : ''}</h2>
        ${Object.keys(RAW[n]).sort().map(ck => sectionForComuna(n, ck)).join('')}</div>`;
    });
  } else if (tipo === 'zona') {
    const zona = MEDELLIN_ZONAS.find(z => z.nombre === ck);
    if (zona) {
      const s = gs('MEDELLIN'); const sz = (s.zonas || {})[ck] || {};
      title = `Reporte — MEDELLÍN · ${ck}`;
      sections = `<div><h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${ck}${sz.coord ? ' — Coord: ' + esc(sz.coord) + (sz.phone ? ' · ' + esc(sz.phone) : '') : ''}</h2>
        ${zona.comunas.filter(c => RAW['MEDELLIN'][c]).map(c => sectionForComuna('MEDELLIN', c)).join('')}</div>`;
    }
  } else if (tipo === 'comuna') {
    const s = gs(muni); title = `Reporte — MEDELLÍN · ${ck}`; sections = sectionForComuna(muni, ck);
  } else {
    const s = gs(muni); title = `Reporte — ${muni}`;
    sections = `<div><h2 style="color:#1a2030;border-bottom:3px solid #f5c842;padding-bottom:8px;margin-bottom:16px">${muni} — Coordinador: ${esc(s.coord) || 'Sin asignar'}${s.phone ? ' · ' + esc(s.phone) : ''}</h2>
      ${Object.keys(RAW[muni]).sort().map(comunaKey => sectionForComuna(muni, comunaKey)).join('')}</div>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px}h1{font-size:18px;color:#1a2030;margin-bottom:4px}.meta{font-size:11px;color:#666;margin-bottom:24px}@media print{body{padding:10px}}</style>
  </head><body><h1>⚡ ${title}</h1><div class="meta">Generado: ${now} · Comando Electoral AMVA 2026</div>${sections}</body></html>`;
}

// ═══ ABOGADO (punto 2) ═══
const _abogEditMode = new Set(); // strings "${panelId}:${index}" for items in edit mode

function renderAbogadoPanel(n, ck, id) {
  const pane = document.getElementById(id + '-abog');
  const s = gs(n);
  const list = _abogList(s, ck);
  const ckE = ck.replace(/'/g, "\\'");

  let html = `<div class="mov-panel">
    <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Abogados responsables de esta zona/comuna</div>`;

  list.forEach((ab, i) => {
    const isEditing = _abogEditMode.has(`${id}:${i}`);
    if (!isEditing) {
      html += `<div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--fg);margin-bottom:3px">⚖️ ${esc(ab.nombre)}</div>
            ${ab.telefono ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--t2)">
              📞 ${esc(ab.telefono)}
              <a class="wa-btn" href="https://wa.me/57${ab.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>
            </div>` : '<div style="font-size:12px;color:var(--t3)">Sin teléfono</div>'}
          </div>
          ${_isReadOnly() ? '' : `<div style="display:flex;gap:4px;flex-shrink:0">
            <button class="export-btn" style="font-size:11px;padding:3px 8px" onclick="editAbogadoItem('${n}','${ckE}','${id}',${i})">✏️</button>
            <button class="export-btn" style="font-size:11px;padding:3px 8px;color:#e53" onclick="delAbogadoItem('${n}','${ckE}','${id}',${i})">🗑️</button>
          </div>`}
        </div>
      </div>`;
    } else {
      html += `<div style="background:var(--bg2);border:2px solid var(--accent,#f5c842);border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <div class="mof" style="margin-bottom:8px">
          <label style="font-size:10px;color:var(--t3)">NOMBRE</label>
          <input class="resp-name-inp" style="width:100%" type="text" placeholder="Nombre completo" value="${esc(ab.nombre)}"
            onchange="updateAbogadoItem('${n}','${ckE}',${i},'nombre',this.value)">
        </div>
        <div class="mof" style="margin-bottom:10px">
          <label style="font-size:10px;color:var(--t3)">TELÉFONO / WHATSAPP</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input class="resp-phone-inp" style="flex:1" type="text" placeholder="300 000 0000" value="${esc(ab.telefono || '')}"
              onchange="updateAbogadoItem('${n}','${ckE}',${i},'telefono',this.value)">
            ${ab.telefono ? `<a class="wa-btn" href="https://wa.me/57${ab.telefono.replace(/\D/g,'')}" target="_blank">💬</a>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="mv-save-all" onclick="saveAbogadoItem('${n}','${ckE}','${id}',${i})">💾 Guardar</button>
          ${ab.nombre ? `<button class="export-btn" style="font-size:12px" onclick="cancelAbogadoItem('${n}','${ckE}','${id}',${i})">Cancelar</button>` : ''}
        </div>
      </div>`;
    }
  });

  if (!_isReadOnly()) html += `<button class="export-btn" style="font-size:12px;margin-top:4px" onclick="addAbogadoItem('${n}','${ckE}','${id}')">➕ Agregar abogado</button>`;
  html += '</div>';

  pane.innerHTML = html;
}

function editAbogadoItem(n, ck, id, i) { _abogEditMode.add(`${id}:${i}`); renderAbogadoPanel(n, ck, id); }
function cancelAbogadoItem(n, ck, id, i) {
  const s = gs(n); const list = _abogList(s, ck);
  if (!list[i]?.nombre) { list.splice(i, 1); saveLocalSt(); } // remove blank entry
  _abogEditMode.delete(`${id}:${i}`); renderAbogadoPanel(n, ck, id);
}
function addAbogadoItem(n, ck, id) {
  const s = gs(n); const list = _abogList(s, ck);
  list.push({ nombre: '', telefono: '', _backendId: null });
  _abogEditMode.add(`${id}:${list.length - 1}`);
  saveLocalSt(); renderAbogadoPanel(n, ck, id);
}
function updateAbogadoItem(n, ck, i, field, val) {
  const s = gs(n); const list = _abogList(s, ck);
  if (list[i]) { list[i][field] = val; saveLocalSt(); }
}
function delAbogadoItem(n, ck, id, i) {
  const s = gs(n); const list = _abogList(s, ck);
  if (!list[i]) return;
  const ab = list[i];
  if (ab._backendId && window.api && window.CURRENT_USER) {
    api.delete(`/abogados/${ab._backendId}`).catch(err => _onWriteError('abogado delete failed', err));
  }
  list.splice(i, 1);
  // Clean up any edit mode keys for this panel (re-index)
  [..._abogEditMode].filter(k => k.startsWith(`${id}:`)).forEach(k => _abogEditMode.delete(k));
  saveLocalSt(); renderAbogadoPanel(n, ck, id);
}
function saveAbogadoItem(n, ck, id, i) {
  const s = gs(n); const list = _abogList(s, ck);
  const ab = list[i];
  if (!ab?.nombre) return;
  saveLocalSt();
  if (window.api && window.CURRENT_USER) {
    const muniBackendId = _puestoIdCache[n]?._muniId;
    if (muniBackendId) {
      if (ab._backendId) {
        api.patch(`/abogados/${ab._backendId}`, {
          name: ab.nombre,
          phone: ab.telefono || undefined,
          notes: ck,
        }).catch(err => _onWriteError('abogado update failed', err));
      } else {
        api.post(`/municipios/${muniBackendId}/abogados`, {
          name: ab.nombre,
          phone: ab.telefono || undefined,
          notes: ck,
        }).then(created => {
          ab._backendId = created.id;
          saveLocalSt();
        }).catch(err => _onWriteError('abogado create failed', err));
      }
    }
  }
  _abogEditMode.delete(`${id}:${i}`);
  renderAbogadoPanel(n, ck, id);
}
// Legacy stubs kept for safety (not called from new UI)
function editAbogado(n, ck, id) { editAbogadoItem(n, ck, id, 0); }
function cancelAbogado(n, ck, id) { cancelAbogadoItem(n, ck, id, 0); }
function updateAbogado(n, ck, field, val) { updateAbogadoItem(n, ck, 0, field, val); }
function saveAbogado(n, ck, id) { saveAbogadoItem(n, ck, id, 0); }

// ═══ REFRIGERIOS (punto 6) ═══
const _refrigEditMode = new Set(); // panel IDs currently in edit mode

function _refrigCountBox(n, ck) {
  const rc = _refrigCountComuna(n, ck);
  return `<div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;padding:10px 14px;margin-bottom:12px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:8px">📊 Conteo de refrigerios</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
      <div style="text-align:center;background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:7px 4px">
        <div style="font-size:20px;font-weight:700;color:var(--blue)">${rc.testigos}</div>
        <div style="font-size:10px;color:var(--t3)">Testigos</div>
      </div>
      <div style="text-align:center;background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:7px 4px">
        <div style="font-size:20px;font-weight:700;color:var(--blue)">${rc.coordPuestos}</div>
        <div style="font-size:10px;color:var(--t3)">Coord. puestos</div>
      </div>
      <div style="text-align:center;background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:7px 4px">
        <div style="font-size:20px;font-weight:700;color:var(--blue)">${rc.coordComuna}</div>
        <div style="font-size:10px;color:var(--t3)">Coord. comuna</div>
      </div>
      <div style="text-align:center;background:#f5a62318;border:2px solid #f5a623;border-radius:6px;padding:7px 4px">
        <div style="font-size:22px;font-weight:700;color:#f5a623">${rc.total}</div>
        <div style="font-size:10px;color:#f5a623;font-weight:600">Total 🍱</div>
      </div>
    </div>
  </div>`;
}

function renderRefrigPanel(n, ck, id) {
  const pane = document.getElementById(id + '-refrig');
  const s = gs(n);
  if (!s.refrigerios) s.refrigerios = {};
  if (!s.refrigerios[ck]) s.refrigerios[ck] = { nombre: '', telefono: '' };
  const rf = s.refrigerios[ck];
  const ckE = ck.replace(/'/g, "\\'");
  const hasData = !!rf.nombre;
  const isEditing = _refrigEditMode.has(id) || !hasData;

  if (!isEditing) {
    // ── Vista: mostrar datos guardados + botón Editar ──
    pane.innerHTML = `<div class="mov-panel">
      ${_refrigCountBox(n, ck)}
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Encargado de refrigerios para esta zona/comuna</div>
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:600;color:var(--fg);margin-bottom:4px">🍱 ${esc(rf.nombre)}</div>
        ${rf.telefono ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--t2)">
          📞 ${esc(rf.telefono)}
          <a class="wa-btn" href="https://wa.me/57${rf.telefono.replace(/\D/g,'')}" target="_blank" title="WhatsApp">💬</a>
        </div>` : '<div style="font-size:12px;color:var(--t3)">Sin teléfono</div>'}
      </div>
      ${_isReadOnly() ? '' : `<button class="export-btn" style="font-size:12px" onclick="editRefrig('${n}','${ckE}','${id}')">✏️ Editar</button>`}
    </div>`;
  } else {
    // ── Edición: inputs + Guardar / Cancelar ──
    pane.innerHTML = `<div class="mov-panel">
      ${_refrigCountBox(n, ck)}
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Encargado de refrigerios para esta zona/comuna</div>
      <div class="mof" style="margin-bottom:8px">
        <label style="font-size:10px;color:var(--t3)">NOMBRE</label>
        <input class="resp-name-inp" style="width:100%" type="text" placeholder="Nombre completo" value="${esc(rf.nombre)}"
          onchange="updateRefrig('${n}','${ckE}','nombre',this.value)">
      </div>
      <div class="mof" style="margin-bottom:12px">
        <label style="font-size:10px;color:var(--t3)">TELÉFONO / WHATSAPP</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="resp-phone-inp" style="flex:1" type="text" placeholder="300 000 0000" value="${esc(rf.telefono)}"
            onchange="updateRefrig('${n}','${ckE}','telefono',this.value)">
          ${rf.telefono ? `<a class="wa-btn" href="https://wa.me/57${rf.telefono.replace(/\D/g,'')}" target="_blank">💬</a>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="mv-save-all" onclick="saveRefrig('${n}','${ckE}','${id}')">💾 Guardar encargado</button>
        ${hasData ? `<button class="export-btn" style="font-size:12px" onclick="cancelRefrig('${n}','${ckE}','${id}')">Cancelar</button>` : ''}
      </div>
    </div>`;
  }
}
function editRefrig(n, ck, id) { _refrigEditMode.add(id); renderRefrigPanel(n, ck, id); }
function cancelRefrig(n, ck, id) { _refrigEditMode.delete(id); renderRefrigPanel(n, ck, id); }
function updateRefrig(n, ck, field, val) {
  const s = gs(n);
  if (!s.refrigerios) s.refrigerios = {};
  if (!s.refrigerios[ck]) s.refrigerios[ck] = { nombre: '', telefono: '' };
  s.refrigerios[ck][field] = val;
  saveLocalSt();
}
function saveRefrig(n, ck, id) {
  const s0 = gs(n);
  if (!s0.refrigerios?.[ck]?.nombre) return; // no guardar vacío
  saveLocalSt();
  // Best-effort API sync
  if (window.api && window.CURRENT_USER) {
    const ccIds = _puestoIdCache[n]?._ccIds;
    const comunaId = ccIds ? (ccIds[ck] ?? ccIds[(ck || '').toUpperCase()]) : undefined;
    if (comunaId) {
      const s = gs(n);
      const rf = s.refrigerios[ck];
      if (rf) {
        const notesJson = JSON.stringify({ nombre: rf.nombre || '', telefono: rf.telefono || '' });
        if (rf._backendId) {
          api.patch(`/refrigerios/${rf._backendId}`, {
            notes: notesJson,
          }).catch(err => _onWriteError('refrigerio update failed', err));
        } else {
          api.post('/refrigerios', {
            scopeType: 'COMUNA',
            scopeId: comunaId,
            notes: notesJson,
          }).then(created => {
            rf._backendId = created.id;
            saveLocalSt();
          }).catch(err => _onWriteError('refrigerio create failed', err));
        }
      }
    }
  }
  _refrigEditMode.delete(id); // switch to view mode
  renderRefrigPanel(n, ck, id);
}

async function loadRefrigeriosForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const muniId = _puestoIdCache[n]?._muniId;
  const ccIds = _puestoIdCache[n]?._ccIds;
  if (!muniId || !ccIds) return;
  try {
    const items = await api.get(`/refrigerios/by-muni/${muniId}`);
    if (!Array.isArray(items) || items.length === 0) return;
    // Build reverse map: comunaId → ck
    const idToCk = {};
    for (const [ck, id] of Object.entries(ccIds)) {
      if (ck.startsWith('_')) continue;
      idToCk[id] = ck;
    }
    const s = gs(n);
    if (!s.refrigerios) s.refrigerios = {};
    let changed = false;
    for (const item of items) {
      const ck = idToCk[item.scopeId];
      if (!ck) continue;
      let parsed = { nombre: '', telefono: '' };
      try { parsed = JSON.parse(item.notes || '{}'); } catch(e) { parsed = { nombre: item.notes || '', telefono: '' }; }
      if (!s.refrigerios[ck]) s.refrigerios[ck] = {};
      s.refrigerios[ck].nombre = parsed.nombre || '';
      s.refrigerios[ck].telefono = parsed.telefono || '';
      s.refrigerios[ck]._backendId = item.id;
      changed = true;
    }
    if (changed) { saveLocalSt(); if (n === CUR) rerenderIfNotEditing(); }
  } catch(e) { console.warn('[refrig] load failed', e); }
}

// ═══ COMPARENDOS (punto 7) ═══
const _compEditMode = new Set(); // panel IDs currently in edit mode

function _compEstadoBadge(estado) {
  return estado === 'resuelto'
    ? '<span style="font-size:10px;font-weight:700;background:#1a4a1a;color:#4caf50;border-radius:4px;padding:2px 7px">✓ Resuelto</span>'
    : '<span style="font-size:10px;font-weight:700;background:#4a3a00;color:#ffc107;border-radius:4px;padding:2px 7px">⏳ Pendiente</span>';
}

function renderComparendosPanel(n, ck, id) {
  const pane = document.getElementById(id + '-comp');
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  const list = s.comparendos[ck];
  const ckE = ck.replace(/'/g, "\\'");
  const hasData = list.length > 0;
  const isEditing = _compEditMode.has(id) || !hasData;

  if (!isEditing) {
    // ── Vista: tarjetas read-only + botón Editar ──
    const cards = list.map((c, i) => `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;color:var(--gold)">Comparendo #${i+1}</span>
          ${_compEstadoBadge(c.estado)}
        </div>
        ${c.nombre ? `<div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:3px">👤 ${esc(c.nombre)}</div>` : ''}
        ${c.puesto ? `<div style="font-size:12px;color:var(--t2);margin-bottom:3px">📍 ${esc(c.puesto)}</div>` : ''}
        <div style="display:flex;gap:12px;font-size:11px;color:var(--t3);margin-bottom:${c.notas?'4px':'0'}">
          ${c.fecha ? `<span>📅 ${c.fecha}</span>` : ''}
          ${c.tipo ? `<span>📋 ${esc(c.tipo)}</span>` : ''}
        </div>
        ${c.notas ? `<div style="font-size:11px;color:var(--t2);margin-top:4px;font-style:italic">${esc(c.notas)}</div>` : ''}
      </div>`).join('');
    pane.innerHTML = `<div class="mov-panel">
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${list.length} comparendo(s) registrado(s)</div>
      ${cards}
      ${_isReadOnly() ? '' : `<button class="export-btn" style="font-size:12px;margin-top:4px" onclick="editComparendos('${n}','${ckE}','${id}')">✏️ Editar</button>`}
    </div>`;
  } else {
    // ── Edición: formularios + Guardar / Cancelar ──
    const rows = list.map((c, i) => `
      <div class="comp-row" style="background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;color:var(--gold)">Comparendo #${i+1}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <select style="font-size:10px;background:var(--bg2);color:var(--t1);border:1px solid var(--b1);border-radius:4px;padding:2px 4px"
              onchange="updateComparendo('${n}','${ckE}',${i},'estado',this.value)">
              <option value="pendiente" ${c.estado==='pendiente'?'selected':''}>⏳ Pendiente</option>
              <option value="resuelto" ${c.estado==='resuelto'?'selected':''}>✓ Resuelto</option>
            </select>
            ${_isReadOnly() ? '' : `<button class="del-btn" onclick="delComparendo('${n}','${ckE}',${i},'${id}')">×</button>`}
          </div>
        </div>
        <input class="resp-name-inp" style="width:100%;margin-bottom:5px" type="text" placeholder="Nombre" value="${esc(c.nombre || '')}"
          onchange="updateComparendo('${n}','${ckE}',${i},'nombre',this.value)">
        <input class="resp-name-inp" style="width:100%;margin-bottom:5px" type="text" placeholder="Puesto de votación" value="${esc(c.puesto || '')}"
          onchange="updateComparendo('${n}','${ckE}',${i},'puesto',this.value)">
        <div style="display:flex;gap:6px;margin-bottom:5px">
          <input class="resp-phone-inp" style="flex:1" type="date" value="${c.fecha||''}"
            onchange="updateComparendo('${n}','${ckE}',${i},'fecha',this.value)">
          <input class="resp-phone-inp" style="flex:1" type="text" placeholder="Tipo" value="${esc(c.tipo || '')}"
            onchange="updateComparendo('${n}','${ckE}',${i},'tipo',this.value)">
        </div>
        <textarea style="width:100%;font-size:11px;background:var(--bg2);color:var(--t1);border:1px solid var(--b1);border-radius:4px;padding:5px;box-sizing:border-box;resize:vertical;min-height:48px" placeholder="Notas / descripción"
          onchange="updateComparendo('${n}','${ckE}',${i},'notas',this.value)">${esc(c.notas || '')}</textarea>
      </div>`).join('');
    pane.innerHTML = `<div class="mov-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:11px;color:var(--t3)">${list.length} comparendo(s)</span>
        ${_isReadOnly() ? '' : `<button class="resp-add-btn" onclick="addComparendo('${n}','${ckE}','${id}')">+ Agregar comparendo</button>`}
      </div>
      <div id="${id}-comp-list">${rows || '<div style="font-size:11px;color:var(--t3);text-align:center;padding:12px">Sin comparendos registrados</div>'}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        ${_isReadOnly() ? '' : `<button class="mv-save-all" onclick="saveComparendos('${n}','${ckE}','${id}')">💾 Guardar comparendos</button>`}
        ${(!_isReadOnly() && hasData) ? `<button class="export-btn" style="font-size:12px" onclick="cancelComparendos('${n}','${ckE}','${id}')">Cancelar</button>` : ''}
      </div>
    </div>`;
  }
}
function editComparendos(n, ck, id) { _compEditMode.add(id); renderComparendosPanel(n, ck, id); }
function cancelComparendos(n, ck, id) { _compEditMode.delete(id); renderComparendosPanel(n, ck, id); }
function updateComparendo(n, ck, idx, field, val) {
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  if (!s.comparendos[ck][idx]) return;
  s.comparendos[ck][idx][field] = val;
  saveLocalSt();
}
function addComparendo(n, ck, id) {
  const s = gs(n);
  if (!s.comparendos) s.comparendos = {};
  if (!s.comparendos[ck]) s.comparendos[ck] = [];
  s.comparendos[ck].push({ nombre: '', puesto: '', fecha: '', tipo: '', notas: '', estado: 'pendiente' });
  saveLocalSt();
  _compEditMode.add(id);
  renderComparendosPanel(n, ck, id);
}
function delComparendo(n, ck, idx, id) {
  const s = gs(n);
  const c = s.comparendos[ck][idx];
  if (c?._backendId && window.api && window.CURRENT_USER) {
    api.delete(`/comparendos/${c._backendId}`).catch(err => _onWriteError('comparendo delete failed', err));
  }
  s.comparendos[ck].splice(idx, 1);
  saveLocalSt();
  renderComparendosPanel(n, ck, id);
}
function saveComparendos(n, ck, id) {
  saveLocalSt();
  if (window.api && window.CURRENT_USER) {
    const ccIds = _puestoIdCache[n]?._ccIds;
    const comunaId = ccIds ? (ccIds[ck] ?? ccIds[(ck || '').toUpperCase()]) : undefined;
    if (comunaId) {
      const s = gs(n);
      const list = s.comparendos?.[ck] || [];
      for (const c of list) {
        const notesJson = JSON.stringify({ nombre: c.nombre || '', puesto: c.puesto || '', notas: c.notas || '' });
        if (c._backendId) {
          api.patch(`/comparendos/${c._backendId}`, {
            date: c.fecha ? new Date(c.fecha).toISOString() : undefined,
            description: c.tipo || 'Sin tipo',
            status: c.estado === 'resuelto' ? 'resuelto' : 'abierto',
            notes: notesJson,
          }).catch(err => _onWriteError('comparendo update failed', err));
        } else {
          api.post('/comparendos', {
            scopeType: 'COMUNA',
            scopeId: comunaId,
            date: c.fecha ? new Date(c.fecha).toISOString() : new Date().toISOString(),
            description: c.tipo || 'Sin tipo',
            status: c.estado === 'resuelto' ? 'resuelto' : 'abierto',
            notes: notesJson,
          }).then(created => {
            c._backendId = created.id;
            saveLocalSt();
          }).catch(err => _onWriteError('comparendo create failed', err));
        }
      }
    }
  }
  _compEditMode.delete(id); // switch to view mode
  renderComparendosPanel(n, ck, id);
}

async function loadComparendosForMuni(n) {
  if (!window.api || !window.CURRENT_USER) return;
  const muniId = _puestoIdCache[n]?._muniId;
  const ccIds = _puestoIdCache[n]?._ccIds;
  if (!muniId || !ccIds) return;
  try {
    const items = await api.get(`/comparendos/by-muni/${muniId}`);
    if (!Array.isArray(items) || items.length === 0) return;
    // Build reverse map: comunaId → ck
    const idToCk = {};
    for (const [ck, cid] of Object.entries(ccIds)) {
      if (ck.startsWith('_')) continue;
      idToCk[cid] = ck;
    }
    const s = gs(n);
    if (!s.comparendos) s.comparendos = {};
    // Group items by commune
    const byComuna = {};
    for (const item of items) {
      const ck = idToCk[item.scopeId];
      if (!ck) continue;
      if (!byComuna[ck]) byComuna[ck] = [];
      let extra = { nombre: '', puesto: '', notas: '' };
      try { extra = JSON.parse(item.notes || '{}'); } catch(e) {}
      byComuna[ck].push({
        _backendId: item.id,
        nombre: extra.nombre || '',
        puesto: extra.puesto || '',
        notas: extra.notas || '',
        tipo: item.description || '',
        fecha: item.date ? item.date.slice(0, 10) : '',
        estado: item.status === 'resuelto' ? 'resuelto' : 'pendiente',
      });
    }
    let changed = false;
    for (const [ck, list] of Object.entries(byComuna)) {
      s.comparendos[ck] = list;
      changed = true;
    }
    if (changed) { saveLocalSt(); if (n === CUR) rerenderIfNotEditing(); }
  } catch(e) { console.warn('[comp] load failed', e); }
}

// ═══ MAPA DE PUESTOS (punto 4) ═══
const _maps = {};
function renderMapPanel(n, ck, id) {
  const pane = document.getElementById(id + '-mapa');
  const puestos = RAW[n][ck] || [];
  const validPuestos = puestos.filter(p => p.lat && p.lon && p.lat !== 0);
  if (!validPuestos.length) {
    pane.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">Sin coordenadas disponibles para esta zona</div>';
    return;
  }
  const mapId = id + '-leafmap';
  pane.innerHTML = `<div id="${mapId}" style="height:320px;border-radius:0 0 6px 6px"></div>`;
  setTimeout(() => {
    if (_maps[mapId]) { _maps[mapId].remove(); delete _maps[mapId]; }
    const s = gs(n);
    const center = [validPuestos[0].lat, validPuestos[0].lon];
    const map = L.map(mapId, { scrollWheelZoom: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18
    }).addTo(map);
    validPuestos.forEach(p => {
      const ts = (s.testigos?.[ck]?.[p.puesto] || []).filter(r => r.nombre).length;
      const pct = _coveragePct(Math.min(ts, p.mesas || 0), p.mesas);
      const color = _testPctColor(pct);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 8, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
      }).addTo(map);
      marker.bindPopup(`<b style="font-size:12px">${p.puesto}</b><br><span style="font-size:11px;color:#666">${p.direccion || ''}</span><br><span style="font-size:10px">${p.mesas} mesas · ${(p.total||0).toLocaleString('es-CO')} votantes · ${ts} testigo${ts !== 1 ? 's' : ''} · <b>Cobertura: ${pct}%</b></span>`);
    });
    map.fitBounds(validPuestos.map(p => [p.lat, p.lon]), { padding: [20, 20] });
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.style.cssText = 'background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:11px;line-height:1.9';
      div.innerHTML = '<b>Cobertura testigos</b><br>' +
        '<span style="color:#22c55e">●</span> 71–100%<br>' +
        '<span style="color:#f5c842">●</span> 41–70%<br>' +
        '<span style="color:#ef4444">●</span> 0–40%';
      return div;
    };
    legend.addTo(map);
    _maps[mapId] = map;
  }, 50);
}

// ═══ DIRECTORIO TESTIGOS (punto 3) ═══
function openDirTestigos() { document.getElementById('dir-testigos-modal').style.display = 'flex'; renderDirTestigos(); }
function closeDirTestigos() { document.getElementById('dir-testigos-modal').style.display = 'none'; }
function renderDirTestigos() {
  const el = document.getElementById('dir-testigos-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniHtml = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const testByCk = s.testigos?.[ck] || {};
      const items = [];
      Object.entries(testByCk).forEach(([puesto, rows]) => {
        if (!Array.isArray(rows)) return;
        rows.filter(r => r.nombre).forEach(r => items.push({ puesto, nombre: r.nombre, telefono: r.telefono || '' }));
      });
      if (!items.length) return;
      muniHtml += `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:var(--gold);margin-bottom:4px">${ck}</div>
        ${items.map(it => `<div class="dir-row"><div><div class="dir-name">${esc(it.nombre)}</div><div class="dir-role">Testigo · ${esc(it.puesto)}</div></div>
          <div class="dir-phone">${it.telefono ? `<a class="wa-btn" href="https://wa.me/57${it.telefono.replace(/\D/g,'')}" target="_blank">💬</a> ${esc(it.telefono)}` : '<span style="color:var(--t3)">Sin teléfono</span>'}</div></div>`).join('')}</div>`;
    });
    if (!muniHtml) return;
    html += `<div class="dir-section"><h3>${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3>${muniHtml}</div>`;
  });
  el.innerHTML = html || '<div class="dir-empty">Sin testigos registrados aún.</div>';
}
function exportDirTestigosPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniRows = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const testByCk = s.testigos?.[ck] || {};
      Object.entries(testByCk).forEach(([puesto, rows]) => {
        if (!Array.isArray(rows)) return;
        rows.filter(r => r.nombre).forEach(r => {
          muniRows += `<tr><td style="padding:4px 8px;border:1px solid #ddd">${ck}</td><td style="padding:4px 8px;border:1px solid #ddd">${puesto}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(r.nombre)}</td><td style="padding:4px 8px;border:1px solid #ddd">${r.telefono ? esc(r.telefono) : '—'}</td></tr>`;
        });
      });
    });
    if (!muniRows) return;
    sections += `<div style="margin-bottom:20px;page-break-inside:avoid"><h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:4px;font-size:13px">${n}</h3><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f0f0f0"><th style="padding:5px 8px;border:1px solid #ddd">Zona</th><th style="padding:5px 8px;border:1px solid #ddd">Puesto</th><th style="padding:5px 8px;border:1px solid #ddd">Nombre</th><th style="padding:5px 8px;border:1px solid #ddd">Teléfono</th></tr>${muniRows}</table></div>`;
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:10px}}</style></head><body><h1 style="font-size:16px;color:#1a2030">Directorio de Testigos Electorales</h1><div style="font-size:11px;color:#666;margin-bottom:20px">Generado: ${now}</div>${sections||'<p>Sin testigos registrados.</p>'}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ DIRECTORIO ABOGADOS (punto 3) ═══
function openDirAbogados() { document.getElementById('dir-abogados-modal').style.display = 'flex'; renderDirAbogados(); }
function closeDirAbogados() { document.getElementById('dir-abogados-modal').style.display = 'none'; }
function renderDirAbogados() {
  const el = document.getElementById('dir-abogados-content'); let html = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniHtml = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const list = Array.isArray(s.abogados?.[ck]) ? s.abogados[ck]
                 : (s.abogados?.[ck]?.nombre ? [s.abogados[ck]] : []);
      list.filter(ab => ab.nombre).forEach(ab => {
        muniHtml += `<div class="dir-row" style="margin-bottom:6px"><div><div class="dir-name">${esc(ab.nombre)}</div><div class="dir-role">⚖️ Abogado · ${esc(ck)}</div></div>
          <div class="dir-phone">${ab.telefono ? `<a class="wa-btn" href="https://wa.me/57${ab.telefono.replace(/\D/g,'')}" target="_blank">💬</a> ${esc(ab.telefono)}` : '<span style="color:var(--t3)">Sin teléfono</span>'}</div></div>`;
      });
    });
    if (!muniHtml) return;
    html += `<div class="dir-section"><h3>${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3>${muniHtml}</div>`;
  });
  el.innerHTML = html || '<div class="dir-empty">Sin abogados registrados aún.</div>';
}
function exportDirAbogadosPDF() {
  const now = new Date().toLocaleString('es-CO'); let sections = '';
  ALL_MUNIS.forEach(n => {
    if (!RAW[n]) return;
    const s = gs(n); let muniRows = '';
    Object.keys(RAW[n]).sort().forEach(ck => {
      const list = Array.isArray(s.abogados?.[ck]) ? s.abogados[ck]
                 : (s.abogados?.[ck]?.nombre ? [s.abogados[ck]] : []);
      list.filter(ab => ab.nombre).forEach(ab => {
        muniRows += `<tr><td style="padding:4px 8px;border:1px solid #ddd">${esc(ck)}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(ab.nombre)}</td><td style="padding:4px 8px;border:1px solid #ddd">${ab.telefono ? esc(ab.telefono) : '—'}</td></tr>`;
      });
    });
    if (!muniRows) return;
    sections += `<div style="margin-bottom:20px;page-break-inside:avoid"><h3 style="color:#1a2030;border-bottom:2px solid #f5c842;padding-bottom:4px;font-size:13px">${n === 'MEDELLIN' ? 'MEDELLÍN' : n}</h3><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f0f0f0"><th style="padding:5px 8px;border:1px solid #ddd">Zona/Comuna</th><th style="padding:5px 8px;border:1px solid #ddd">Nombre</th><th style="padding:5px 8px;border:1px solid #ddd">Teléfono</th></tr>${muniRows}</table></div>`;
  });
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Abogados</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:10px}}</style></head><body><h1 style="font-size:16px;color:#1a2030">Directorio de Abogados</h1><div style="font-size:11px;color:#666;margin-bottom:20px">Generado: ${now}</div>${sections||'<p>Sin abogados registrados.</p>'}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

// ═══ COORDENADAS MUNICIPIOS ═══
const MUNI_COORDS = {
  // AMVA
  'MEDELLIN':           [6.2442, -75.5812],
  'BELLO':              [6.3386, -75.5581],
  'ITAGUI':             [6.1848, -75.5975],
  'ENVIGADO':           [6.1737, -75.5899],
  'SABANETA':           [6.1513, -75.6167],
  'LA ESTRELLA':        [6.1563, -75.6432],
  'CALDAS':             [6.0934, -75.6359],
  'COPACABANA':         [6.3494, -75.5057],
  'GIRARDOTA':          [6.3828, -75.4478],
  'BARBOSA':            [6.4382, -75.3327],
  // ORIENTE
  'ABEJORRAL':          [5.7870, -75.4330],
  'ALEJANDRIA':         [6.3654, -75.0952],
  'ARGELIA':            [5.7320, -75.1660],
  'CARMEN DE VIBORAL':  [6.0893, -75.3409],
  'COCORNA':            [6.0558, -74.9980],
  'CONCEPCION':         [6.4013, -75.0434],
  'GRANADA':            [6.1537, -74.9590],
  'GUARNE':             [6.2800, -75.4250],
  'GUATAPE':            [6.2322, -74.8771],
  'LA CEJA':            [6.0311, -75.4331],
  'LA UNION':           [5.9775, -75.3605],
  'MARINILLA':          [6.1744, -75.3370],
  'NARIÑO':             [5.8143, -75.1598],
  'EL PEÑOL':           [6.2113, -75.0082],
  'RETIRO':             [6.0608, -75.5135],
  'RIONEGRO':           [6.1551, -75.3740],
  'SAN CARLOS':         [6.1880, -74.9921],
  'SAN FRANCISCO':      [6.2913, -75.0356],
  'SAN LUIS':           [6.0390, -74.9965],
  'SAN RAFAEL':         [6.2958, -75.0215],
  'SAN VICENTE':        [6.3204, -75.3368],
  'SANTUARIO':          [6.1416, -75.2686],
  'SONSON':             [5.7107, -75.3128],
  // OCCIDENTE
  'ABRIAQI':            [7.0207, -76.3560],
  'ANTIOQUIA':          [6.5609, -75.7614],
  'ANZA':               [6.4003, -75.9232],
  'ARMENIA':            [6.4814, -75.8773],
  'BURITICA':           [6.7167, -75.9109],
  'CAICEDO':            [6.3987, -76.0010],
  'CAÑASGORDAS':        [6.7459, -76.0193],
  'DABEIBA':            [7.0053, -76.2670],
  'EBEJICO':            [6.3355, -75.8266],
  'FRONTINO':           [6.7741, -76.1320],
  'GIRALDO':            [6.6507, -75.9555],
  'HELICONIA':          [6.2050, -75.7540],
  'LIBORINA':           [6.6907, -75.8718],
  'OLAYA':              [6.5878, -75.8484],
  'PEQUE':              [6.9025, -76.0243],
  'SABANALARGA':        [6.8736, -75.9697],
  'SAN JERONIMO':       [6.3731, -75.7360],
  'SOPETRAN':           [6.5038, -75.7484],
  'URAMITA':            [6.9192, -76.1773],
  // SUROESTE
  'AMAGA':              [6.0418, -75.6990],
  'ANDES':              [5.6560, -75.8760],
  'ANGELOPOLIS':        [6.1080, -75.7143],
  'BETANIA':            [5.8083, -75.9763],
  'BETULIA':            [6.1079, -75.9840],
  'BOLIVAR':            [5.8586, -75.9368],
  'CARAMANTA':          [5.5412, -75.6600],
  'CONCORDIA':          [6.0460, -75.9022],
  'FREDONIA':           [5.9337, -75.6694],
  'HISPANIA':           [5.8095, -75.9082],
  'JARDIN':             [5.5987, -75.8150],
  'JERICO':             [5.7896, -75.7777],
  'LA PINTADA':         [5.7493, -75.5930],
  'MONTEBELLO':         [5.9414, -75.5118],
  'PUEBLORRICO':        [5.6683, -75.8997],
  'SALGAR':             [5.9549, -75.9743],
  'SANTA BARBARA':      [5.8733, -75.5726],
  'TAMESIS':            [5.6621, -75.7138],
  'TARSO':              [5.8093, -75.8186],
  'TITIRIBI':           [6.0768, -75.7880],
  'URRAO':              [6.3244, -76.1316],
  'VALPARAISO':         [5.7271, -75.6325],
  'VENECIA':            [5.9634, -75.7703],
  // NORDESTE
  'AMALFI':             [6.9119, -75.0726],
  'ANORI':              [7.0761, -75.1382],
  'CISNEROS':           [6.5398, -74.9954],
  'REMEDIOS':           [7.0261, -74.6919],
  'SAN ROQUE':          [6.4819, -74.9831],
  'SANTO DOMINGO':      [6.4782, -75.1441],
  'SEGOVIA':            [7.0879, -74.7049],
  'VEGACHI':            [6.8027, -74.8092],
  'YALI':               [6.5905, -75.0131],
  'YOLOMBO':            [6.5961, -74.9897],
  // NORTE
  'ANGOSTURA':          [6.8869, -75.3449],
  'BELMIRA':            [6.6077, -75.6658],
  'BRICEÑO':            [7.1115, -75.5266],
  'CAMPAMENTO':         [7.0022, -75.3048],
  'CAROLINA':           [6.7454, -75.3285],
  'DON MATIAS':         [6.4901, -75.4095],
  'ENTRERRIOS':         [6.5530, -75.5610],
  'GOMEZ PLATA':        [6.6349, -75.2165],
  'GUADALUPE':          [6.9018, -75.2370],
  'ITUANGO':            [7.1734, -75.7594],
  'SAN ANDRES':         [6.7069, -75.4823],
  'SAN JOSE DE LA MONTAÑA': [6.8320, -75.6800],
  'SAN PEDRO':          [6.4926, -75.5637],
  'SANTA ROSA DE OSOS': [6.6459, -75.4615],
  'TOLEDO':             [7.2820, -75.3830],
  'VALDIVIA':           [7.1628, -75.4362],
  'YARUMAL':            [7.0019, -75.4208],
  // URABÁ
  'APARTADO':           [7.8836, -76.6272],
  'ARBOLETES':          [8.8507, -76.4278],
  'CAREPA':             [7.7577, -76.6558],
  'CHIGORODO':          [7.6717, -76.6837],
  'MURINDO':            [6.9826, -76.7541],
  'MUTATA':             [7.2458, -76.4354],
  'NECOCLI':            [8.4296, -76.7856],
  'SAN JUAN DE URABA':  [8.7581, -76.5285],
  'SAN PEDRO DE URABA': [8.2839, -76.3784],
  'TURBO':              [8.0961, -76.7370],
  'VIGIA DEL FUERTE':   [6.6097, -76.8743],
  // BAJO CAUCA
  'CACERES':            [7.5754, -75.3498],
  'CAUCASIA':           [7.9854, -75.1971],
  'EL BAGRE':           [7.5928, -74.8087],
  'NECHI':              [8.1040, -74.7759],
  'TARAZA':             [7.5817, -75.4005],
  'ZARAGOZA':           [7.4908, -74.8668],
  // MAGDALENA MEDIO
  'CARACOLI':           [6.4450, -74.7648],
  'PUERTO NARE':        [6.1963, -74.5895],
  'MACEO':              [6.5428, -74.7755],
  'PUERTO BERRIO':      [6.4906, -74.4069],
  'PUERTO TRIUNFO':     [5.8733, -74.7322],
  'YONDO-CASABE':       [6.8182, -74.4441],
};

function _ckLabel(n, ck) {
  return ck === 'SIN COMUNA' ? (n === 'MEDELLIN' ? 'MEDELLÍN' : n) : ck;
}

function _testPctColor(pct) {
  if (pct >= 71) return '#22c55e';
  if (pct >= 41) return '#f5c842';
  return '#ef4444';
}
function _coverageColor(tag) {
  if (tag === 'ok') return '#22c55e';
  if (tag === 'pr') return '#f5c842';
  if (tag === 'pe') return '#fb923c';
  if (tag === 'al') return '#ef4444';
  return '#64748b';
}

function _muniCoverageStats(n) {
  const s = gs(n); let total = 0, ok = 0, pr = 0, pe = 0, al = 0, none = 0;
  if (!RAW[n]) return { total, ok, pr, pe, al, none };
  Object.values(RAW[n]).forEach(puestos => {
    puestos.forEach(p => {
      total++;
      const tag = s.puestos?.[pk(p)]?.tag || 'n';
      if (tag === 'ok') ok++;
      else if (tag === 'pr') pr++;
      else if (tag === 'pe') pe++;
      else if (tag === 'al') al++;
      else none++;
    });
  });
  return { total, ok, pr, pe, al, none };
}

// ═══ MAPA POR MUNICIPIO ═══
let _muniLeafletMap = null;
function renderMuniMap(n) {
  const container = document.getElementById('ot-mapa-inner');
  if (!container) return;
  if (_muniLeafletMap) { try { _muniLeafletMap.remove(); } catch(e){} _muniLeafletMap = null; }
  container.innerHTML = '';

  const s = gs(n);
  const communes = RAW[n] ? Object.keys(RAW[n]).sort() : [];

  // Compute centroid of each commune from puesto lat/lon
  const communeData = [];
  const allLats = [], allLngs = [];
  communes.forEach(ck => {
    const puestos = RAW[n][ck] || [];
    const withCoords = puestos.filter(p => p.lat && p.lon);
    if (!withCoords.length) return;
    const lat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const lng = withCoords.reduce((s, p) => s + p.lon, 0) / withCoords.length;
    allLats.push(lat); allLngs.push(lng);

    const st = _ccStats(n, ck);
    communeData.push({ ck, lat, lng, testPct: st.pct, testReg: st.testReg, totMesas: st.totMesas });
  });

  const fallback = MUNI_COORDS[n] || [6.2442, -75.5812];
  const center = allLats.length
    ? [allLats.reduce((a, b) => a + b, 0) / allLats.length, allLngs.reduce((a, b) => a + b, 0) / allLngs.length]
    : fallback;

  _muniLeafletMap = L.map(container).setView(center, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(_muniLeafletMap);

  const bounds = [];
  communeData.forEach(({ ck, lat, lng, testPct, testReg, totMesas }) => {
    bounds.push([lat, lng]);
    const color = _testPctColor(testPct);
    const coord = s.comunas?.[ck]?.coord || '';
    const phone = s.comunas?.[ck]?.phone || '';

    L.circleMarker([lat, lng], {
      radius: 14, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(_muniLeafletMap)
      .bindPopup(`<b>${esc(_ckLabel(n, ck))}</b><br>Cobertura: ${testPct}% (${testReg}/${totMesas} mesas)${coord ? '<br>👤 ' + esc(coord) : ''}${phone ? '<br>📞 ' + esc(phone) : ''}`);
  });

  if (bounds.length > 1) _muniLeafletMap.fitBounds(bounds, { padding: [30, 30] });

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:11px;line-height:1.9';
    div.innerHTML = '<b>Cobertura testigos</b><br>' +
      '<span style="color:#22c55e">●</span> 71–100%<br>' +
      '<span style="color:#f5c842">●</span> 41–70%<br>' +
      '<span style="color:#ef4444">●</span> 0–40%';
    return div;
  };
  legend.addTo(_muniLeafletMap);
  setTimeout(() => _muniLeafletMap && _muniLeafletMap.invalidateSize(), 150);
}

// ═══ MAPA POR SUBREGIÓN ═══
let _regionLeafletMap = null;
function openRegionMap(region) {
  document.getElementById('region-map-modal').style.display = 'flex';
  document.getElementById('region-map-title').textContent = '🗺 Mapa — ' + region;
  const container = document.getElementById('region-map-container');
  if (_regionLeafletMap) { try { _regionLeafletMap.remove(); } catch(e){} _regionLeafletMap = null; }
  container.innerHTML = '';

  const munis = (REGIONES[region] || []).filter(n => RAW[n]);
  if (!munis.length) { container.innerHTML = '<div style="padding:20px;color:#94a3b8">Sin municipios con datos en esta región.</div>'; return; }

  const coords = munis.map(n => MUNI_COORDS[n]).filter(Boolean);
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;

  _regionLeafletMap = L.map(container).setView([avgLat, avgLng], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(_regionLeafletMap);

  const bounds = [];
  munis.forEach(n => {
    const coord = MUNI_COORDS[n];
    if (!coord) return;
    bounds.push(coord);
    let totMesasN = 0, testRegN = 0;
    if (RAW[n]) Object.keys(RAW[n]).forEach(ck => { const st = _ccStats(n, ck); totMesasN += st.totMesas; testRegN += st.testReg; });
    const pct = totMesasN ? Math.round(testRegN / totMesasN * 100) : 0;
    const color = _testPctColor(pct);
    const s = gs(n);
    const label = n === 'MEDELLIN' ? 'MEDELLÍN' : n;

    L.circleMarker(coord, {
      radius: 16, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
    }).addTo(_regionLeafletMap)
      .bindPopup(`<b>${label}</b><br>Cobertura: ${pct}% (${testRegN}/${totMesasN} mesas)${s.coord ? '<br>👤 ' + s.coord : ''}`);

    L.tooltip({ permanent: true, direction: 'top', offset: [0, -18], className: 'map-muni-label' })
      .setContent(label).setLatLng(coord).addTo(_regionLeafletMap);
  });

  if (bounds.length > 1) _regionLeafletMap.fitBounds(bounds, { padding: [40, 40] });

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(15,23,42,.88);color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:11px;line-height:1.9';
    div.innerHTML = '<b>Cobertura testigos</b><br>' +
      '<span style="color:#22c55e">●</span> 71–100%<br>' +
      '<span style="color:#f5c842">●</span> 41–70%<br>' +
      '<span style="color:#ef4444">●</span> 0–40%';
    return div;
  };
  legend.addTo(_regionLeafletMap);
  setTimeout(() => _regionLeafletMap && _regionLeafletMap.invalidateSize(), 150);
}

function closeRegionMap() {
  document.getElementById('region-map-modal').style.display = 'none';
  if (_regionLeafletMap) { try { _regionLeafletMap.remove(); } catch(e){} _regionLeafletMap = null; }
}

// ═══ DELEGATED EVENT LISTENERS ═══
document.addEventListener('click', (e) => {
  const action = e.target.dataset?.action || e.target.closest('[data-action]')?.dataset?.action;
  if (action === 'go-home') goHome();
});
