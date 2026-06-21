// js/testigos-page.js
// Dedicated Testigos management page — SUPER_ADMIN and REGIONAL_COORDINATOR

// ── State ──────────────────────────────────────────────────────────────────
let _testigosPanel = null;
let _tPage = 1;
const _T_LIMIT = 50;
let _tSearch = '';
let _tSinPuesto = false;
let _tMunicipioId = null;
let _tPuestoId = null;
let _tSelectedIds = new Set();
let _tAllData = [];
let _tTotal = 0;
let _tSearchTimer = null;
let _tMunicipiosMap = {}; // id -> name
let _tMunicipiosList = []; // [{id, name}] full list for search
let _tComunaId = null;
let _tComunasList = []; // [{id, name}] for current municipio
let _tComunasCache = {}; // municipioId -> [{id, name}]
let _tPuestosCache = {}; // key (muniId or muniId+comunaId) -> [{id, name}]
let _tPuestosList = []; // [{id, name}] for current municipio+comuna

// ── Open / Close ───────────────────────────────────────────────────────────
function openTestigosPage() {
  const role = window.CURRENT_USER && window.CURRENT_USER.role;
  if (role !== 'SUPER_ADMIN' && role !== 'REGIONAL_COORDINATOR') return;

  if (!_testigosPanel) {
    _testigosPanel = document.createElement('div');
    _testigosPanel.className = 'dir-modal';
    _testigosPanel.id = 'testigos-page-panel';
    _testigosPanel.innerHTML = _buildPanelHTML();
    document.body.appendChild(_testigosPanel);
    _attachListeners();
    _loadMunicipios();
  }
  _testigosPanel.style.display = 'flex';
  _loadTestigos(1);
}

function closeTestigosPage() {
  if (_testigosPanel) _testigosPanel.style.display = 'none';
}

// ── Build HTML ─────────────────────────────────────────────────────────────
function _buildPanelHTML() {
  return `
    <div class="dir-box t-page-box" style="position:relative">
      <div class="dir-hd">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>🧾 Gestión de Testigos</h2>
          <span class="t-counter" id="t-counter">—</span>
        </div>
        <div class="dir-hd-btns">
          <button class="dir-pdf" data-action="t-send-pendientes">📲 Enviar a pendientes</button>
          <button class="dir-pdf" data-action="t-export-pdf-comuna">🏘️ PDF por comuna</button>
          <div style="position:relative;display:inline-block">
            <button class="dir-pdf" data-action="t-toggle-comunas-menu">📦 PDF comunas ▾</button>
            <div id="t-comunas-pdf-menu" style="display:none;position:absolute;top:calc(100%+4px);right:0;z-index:400;background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;min-width:240px;max-height:360px;overflow-y:auto;box-shadow:0 4px 18px rgba(0,0,0,.18);padding:4px 0">
              <div id="t-comunas-pdf-list" style="padding:6px 10px;font-size:11px;color:var(--t3)">Selecciona un municipio primero</div>
            </div>
          </div>
          <button class="dir-pdf" data-action="t-export-pdf">📄 Exportar PDF</button>
          <button class="dir-pdf" data-action="t-export-excel">📊 Exportar Excel</button>
          <button class="dir-close" data-action="close-testigos-page">Cerrar ✕</button>
        </div>
      </div>

      <div class="t-filter-bar">
        <input type="text" id="t-search" placeholder="Buscar nombre, cédula o teléfono..." style="flex:1;min-width:200px">
        <label><input type="checkbox" id="t-sin-puesto-cb"> Sin puesto</label>
        <div style="position:relative;display:inline-block">
          <input type="text" id="t-municipio-input" placeholder="🔍 Municipio..." autocomplete="off"
            style="width:145px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg2);color:var(--fg);font-size:12px;box-sizing:border-box">
          <div id="t-muni-dd" style="display:none;position:absolute;top:calc(100%+2px);left:0;z-index:300;background:var(--bg2);border:1px solid var(--bdr);border-radius:6px;max-height:220px;overflow-y:auto;min-width:180px;box-shadow:0 4px 14px rgba(0,0,0,.18)"></div>
        </div>
        <div style="position:relative;display:inline-block">
          <input type="text" id="t-comuna-input" placeholder="🔍 Comuna..." autocomplete="off" disabled
            style="width:135px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg2);color:var(--fg);font-size:12px;box-sizing:border-box;opacity:0.5">
          <div id="t-comuna-dd" style="display:none;position:absolute;top:calc(100%+2px);left:0;z-index:300;background:var(--bg2);border:1px solid var(--bdr);border-radius:6px;max-height:220px;overflow-y:auto;min-width:180px;box-shadow:0 4px 14px rgba(0,0,0,.18)"></div>
        </div>
        <div style="position:relative;display:inline-block">
          <input type="text" id="t-puesto-input" placeholder="🔍 Puesto..." autocomplete="off" disabled
            style="width:175px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg2);color:var(--fg);font-size:12px;box-sizing:border-box;opacity:0.5">
          <div id="t-puesto-dd" style="display:none;position:absolute;top:calc(100%+2px);right:0;z-index:300;background:var(--bg2);border:1px solid var(--bdr);border-radius:6px;max-height:220px;overflow-y:auto;min-width:220px;box-shadow:0 4px 14px rgba(0,0,0,.18)"></div>
        </div>
        <button class="t-btn-cancel" data-action="t-clear-filters">Limpiar filtros</button>
      </div>

      <div class="t-bulk-bar hidden" id="t-bulk-bar" style="${window.CURRENT_USER?.role === 'VIEWER' ? 'display:none!important' : ''}">
        <span id="t-sel-count">0 seleccionados</span>
        <button class="t-btn-primary" data-action="bulk-assign-btn">Asignar a puesto...</button>
        <button class="t-btn-cancel" data-action="t-deselect-all">Deseleccionar todo</button>
      </div>

      <div class="t-table-wrap" id="t-table-wrap">
        <p style="color:var(--t3);font-size:12px;padding:20px 0">Cargando...</p>
      </div>

      <div class="t-pagination" id="t-pagination"></div>
    </div>
  `;
}

// ── Load & Render ──────────────────────────────────────────────────────────
async function _loadTestigos(page) {
  const wrap = document.getElementById('t-table-wrap');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;padding:40px 0"><div class="spinner"></div></div>';

  let url = `/testigos?page=${page}&limit=${_T_LIMIT}`;
  if (_tSearch) url += `&search=${encodeURIComponent(_tSearch)}`;
  if (_tSinPuesto) url += '&sinPuesto=true';
  if (_tPuestoId) url += `&puestoId=${_tPuestoId}`;
  else if (_tComunaId) url += `&comunaId=${_tComunaId}`;
  else if (_tMunicipioId) url += `&municipioId=${_tMunicipioId}`;

  try {
    const result = await window.api.get(url);
    _tAllData = result.data || [];
    _tTotal = result.total || 0;
    _tPage = result.page || page;
    _renderTable();
    _renderPagination();
    const badge = document.getElementById('t-counter');
    if (badge) badge.textContent = `${_tTotal} testigos`;
  } catch (err) {
    console.error('_loadTestigos failed:', err);
    if (wrap) wrap.innerHTML = `<p style="color:var(--red);font-size:12px;padding:20px 0">${esc(errorToSpanish(err))}</p>`;
  }
}

function _renderTable() {
  const wrap = document.getElementById('t-table-wrap');
  if (!wrap) return;

  if (!_tAllData.length) {
    wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 0">No se encontraron testigos.</p>';
    return;
  }

  const CONFIRM_BASE = 'https://coordinacion-electoral.vercel.app/testigo.html';

  function _confirmIcon(ts) {
    if (!ts) return '<span style="color:var(--t3);font-size:12px">—</span>';
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2,'0');
    const mon = String(d.getMonth()+1).padStart(2,'0');
    const hr  = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    const label = `${day}/${mon} ${hr}:${min}`;
    return `<span style="display:inline-flex;align-items:center;gap:3px;background:#dcfce7;border:1px solid #86efac;border-radius:5px;padding:2px 6px;font-size:10px;color:#166534;white-space:nowrap">✅ ${label}</span>`;
  }

  const rows = _tAllData.map(t => {
    const checked = _tSelectedIds.has(t.id) ? 'checked' : '';
    const statusBadge = `<span class="t-status t-status-${esc(t.status)}">${esc(t.status || '—')}</span>`;
    const puesto = t.puesto
      ? esc(t.puesto.name)
      : '<span style="color:var(--t3)">Sin asignar</span>';
    const municipioName = t.puesto && t.puesto.municipioId
      ? esc(_tMunicipiosMap[t.puesto.municipioId] || String(t.puesto.municipioId))
      : '—';
    const phone = t.phone
      ? `<a class="wa-btn" href="https://wa.me/57${esc(t.phone.replace(/\D/g,''))}" target="_blank" title="WhatsApp">💬</a> ${esc(t.phone)}`
      : '—';

    // Confirmation status columns
    const acepto     = _confirmIcon(t.confirmadoAt);
    const acreditado = _confirmIcon(t.acreditadoAt);
    const enPuesto   = _confirmIcon(t.enPuestoAt);

    // WhatsApp magic link button (only if token available)
    let waLinkBtn = '';
    if (t.token) {
      const link = `${CONFIRM_BASE}?t=${encodeURIComponent(t.token)}`;
      const puestoNombre = t.puesto ? t.puesto.name : 'puesto sin asignar';
      const municipioNombre = (t.puesto && t.puesto.municipioId && _tMunicipiosMap[t.puesto.municipioId]) || '';
      const msg = `Hola ${t.name}, quedaste registrado(a) como testigo electoral en el puesto ${puestoNombre}${municipioNombre ? ' en ' + municipioNombre : ''}.\n\nUsa este enlace para confirmar tu participación:\n${link}\n\nGracias por apoyar a Abelardo de la Espriella 🇨🇴`;
      const waPhone = t.phone ? t.phone.replace(/\D/g,'') : '';
      const waHref = waPhone
        ? `https://wa.me/57${waPhone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      waLinkBtn = `<a href="${esc(waHref)}" target="_blank" class="tbtn" style="font-size:11px;padding:3px 8px;text-decoration:none;display:inline-block" title="Enviar enlace de confirmación por WhatsApp">📲</a>`;
    }

    return `<tr>
      <td>${window.CURRENT_USER?.role === 'VIEWER' ? '' : `<input type="checkbox" class="t-row-cb" data-id="${t.id}" ${checked}>`}</td>
      <td style="color:var(--t3)">${t.id}</td>
      <td style="font-weight:500">${esc(t.name || '—')}</td>
      <td>${esc(t.cedula || '—')}</td>
      <td style="white-space:nowrap">${phone}</td>
      <td>${statusBadge}</td>
      <td style="text-align:center">${acepto}</td>
      <td style="text-align:center">${acreditado}</td>
      <td style="text-align:center">${enPuesto}</td>
      <td>${puesto}</td>
      <td>${municipioName}</td>
      <td style="white-space:nowrap">${waLinkBtn}${window.CURRENT_USER?.role === 'VIEWER' ? '' : `<button class="tbtn" data-action="edit-testigo" data-id="${t.id}" style="font-size:11px;padding:3px 10px">Editar</button>`}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="t-table">
      <thead>
        <tr>
          <th><input type="checkbox" id="t-master-cb"></th>
          <th>ID</th>
          <th>Nombre</th>
          <th>Cédula</th>
          <th>Teléfono</th>
          <th>Estado</th>
          <th title="Aceptó ser testigo">Aceptó</th>
          <th title="Recibió acreditación">Acreditado</th>
          <th title="Llegó al puesto">En puesto</th>
          <th>Puesto</th>
          <th>Municipio</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Sync master checkbox state
  const masterCb = document.getElementById('t-master-cb');
  if (masterCb) {
    const allChecked = _tAllData.length > 0 && _tAllData.every(t => _tSelectedIds.has(t.id));
    const someChecked = _tAllData.some(t => _tSelectedIds.has(t.id));
    masterCb.checked = allChecked;
    masterCb.indeterminate = someChecked && !allChecked;
  }
}

function _renderPagination() {
  const el = document.getElementById('t-pagination');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(_tTotal / _T_LIMIT));
  el.innerHTML = `
    <button class="t-btn-cancel" data-action="t-prev" ${_tPage <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span>Página ${_tPage} de ${totalPages}</span>
    <button class="t-btn-cancel" data-action="t-next" ${_tPage >= totalPages ? 'disabled' : ''}>Siguiente ›</button>
  `;
}

// ── Bulk bar ───────────────────────────────────────────────────────────────
function _updateBulkBar() {
  const bar = document.getElementById('t-bulk-bar');
  const countEl = document.getElementById('t-sel-count');
  if (!bar) return;
  const n = _tSelectedIds.size;
  if (n > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  } else {
    bar.classList.add('hidden');
  }
}

// ── Event listeners ────────────────────────────────────────────────────────
function _attachListeners() {
  if (!_testigosPanel) return;

  // Close on backdrop click
  _testigosPanel.addEventListener('click', e => {
    if (e.target === _testigosPanel) closeTestigosPage();
  });

  // Delegated clicks
  _testigosPanel.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close-testigos-page') {
      closeTestigosPage();
    } else if (action === 't-prev') {
      if (_tPage > 1) _loadTestigos(_tPage - 1);
    } else if (action === 't-next') {
      const totalPages = Math.ceil(_tTotal / _T_LIMIT);
      if (_tPage < totalPages) _loadTestigos(_tPage + 1);
    } else if (action === 't-clear-filters') {
      _tSearch = ''; _tSinPuesto = false; _tMunicipioId = null; _tComunaId = null; _tPuestoId = null;
      _tComunasList = []; _tPuestosList = [];
      const searchEl = document.getElementById('t-search');
      const cbEl = document.getElementById('t-sin-puesto-cb');
      if (searchEl) searchEl.value = '';
      if (cbEl) cbEl.checked = false;
      _resetCombo('t-municipio-input', null);
      _resetCombo('t-comuna-input', false);
      _resetCombo('t-puesto-input', false);
      _loadTestigos(1);
    } else if (action === 't-deselect-all') {
      _tSelectedIds.clear();
      _updateBulkBar();
      _renderTable();
    } else if (action === 'bulk-assign-btn') {
      _openPuestoPicker();
    } else if (action === 'edit-testigo') {
      _openEditModal(Number(btn.dataset.id));
    } else if (action === 't-export-excel') {
      _exportExcel();
    } else if (action === 't-export-pdf') {
      _exportPDF();
    } else if (action === 't-export-pdf-comuna') {
      _exportPDFComuna();
    } else if (action === 't-toggle-comunas-menu') {
      _toggleComunasPDFMenu();
    } else if (action === 't-download-all-comunas') {
      document.getElementById('t-comunas-pdf-menu').style.display = 'none';
      _downloadAllComunasPDF();
    } else if (action === 't-export-pdf-comuna-item') {
      const comunaId = Number(btn.dataset.comunaId);
      const comunaNombre = btn.dataset.comunaNombre || '';
      document.getElementById('t-comunas-pdf-menu').style.display = 'none';
      _exportPDFComunaById(comunaId, comunaNombre);
    } else if (action === 't-send-pendientes') {
      _openPendientesModal();
    }
  });

  // Master checkbox
  _testigosPanel.addEventListener('change', e => {
    if (e.target.id === 't-master-cb') {
      const checked = e.target.checked;
      _tAllData.forEach(t => {
        if (checked) _tSelectedIds.add(t.id);
        else _tSelectedIds.delete(t.id);
      });
      _renderTable();
      _updateBulkBar();
      return;
    }

    if (e.target.classList.contains('t-row-cb')) {
      const id = Number(e.target.dataset.id);
      if (e.target.checked) _tSelectedIds.add(id);
      else _tSelectedIds.delete(id);
      _updateBulkBar();
      // Update master cb indeterminate state
      const masterCb = document.getElementById('t-master-cb');
      if (masterCb) {
        const allChecked = _tAllData.every(t => _tSelectedIds.has(t.id));
        const someChecked = _tAllData.some(t => _tSelectedIds.has(t.id));
        masterCb.checked = allChecked;
        masterCb.indeterminate = someChecked && !allChecked;
      }
      return;
    }

    if (e.target.id === 't-sin-puesto-cb') {
      _tSinPuesto = e.target.checked;
      _loadTestigos(1);
      return;
    }

  });

  // Close comunas PDF menu on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('t-comunas-pdf-menu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && !e.target.closest('[data-action="t-toggle-comunas-menu"]')) {
      menu.style.display = 'none';
    }
  });

  // Search input with debounce
  _testigosPanel.addEventListener('input', e => {
    if (e.target.id === 't-search') {
      clearTimeout(_tSearchTimer);
      _tSearchTimer = setTimeout(() => {
        _tSearch = e.target.value.trim();
        _loadTestigos(1);
      }, 300);
    }
  });
}

// ── Load municipios into filter select ────────────────────────────────────
const _T_MUNIS_KEY = 'cache:testigos-municipios';
const _T_MUNIS_TTL = 5 * 60 * 1000; // 5 min

function _getMunisFromCache() {
  try {
    const raw = sessionStorage.getItem(_T_MUNIS_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > _T_MUNIS_TTL) { sessionStorage.removeItem(_T_MUNIS_KEY); return null; }
    return data;
  } catch { return null; }
}

function _setMunisCache(data) {
  try { sessionStorage.setItem(_T_MUNIS_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

async function _loadMunicipios() {
  try {
    const cached = _getMunisFromCache();
    const munis = cached || await window.api.get('/municipios');
    if (!cached) _setMunisCache(munis);
    _tMunicipiosList = munis.map(m => ({ id: m.id, name: m.name }));
    munis.forEach(m => { _tMunicipiosMap[m.id] = m.name; });
    _attachCombobox('t-municipio-input', 't-muni-dd', () => _tMunicipiosList, 'Todos los municipios', id => {
      _tMunicipioId = id; _tComunaId = null; _tPuestoId = null;
      _tComunasList = []; _tPuestosList = [];
      _resetCombo('t-comuna-input', !id); _resetCombo('t-puesto-input', false);
      if (id) _loadComunasForFilter(id); else _resetCombo('t-puesto-input', false);
      _loadTestigos(1);
    });
  } catch (err) { console.error('_loadMunicipios failed:', err); }
}

// ── Generic searchable combobox ───────────────────────────────────────────
function _attachCombobox(inputId, ddId, getList, allLabel, onSelect) {
  const input = document.getElementById(inputId);
  const dd = document.getElementById(ddId);
  if (!input || !dd) return;

  function render() {
    const q = input.value.toLowerCase().trim();
    const items = q ? getList().filter(it => it.name.toLowerCase().includes(q)) : getList();
    dd.innerHTML = `<div data-cb-id="" style="padding:7px 12px;font-size:12px;cursor:pointer;color:var(--t3)" class="t-cb-opt">${allLabel}</div>`
      + items.map(it => `<div data-cb-id="${it.id}" style="padding:7px 12px;font-size:12px;cursor:pointer;color:var(--fg)" class="t-cb-opt">${esc(it.name)}</div>`).join('');
  }

  input.addEventListener('focus', () => { render(); dd.style.display = 'block'; });
  input.addEventListener('input', () => { render(); dd.style.display = 'block'; });
  input.addEventListener('blur', () => setTimeout(() => { dd.style.display = 'none'; }, 160));

  dd.addEventListener('mousedown', e => {
    const opt = e.target.closest('.t-cb-opt');
    if (!opt) return;
    const id = opt.dataset.cbId ? Number(opt.dataset.cbId) : null;
    input.value = id ? (getList().find(it => it.id === id)?.name || '') : '';
    dd.style.display = 'none';
    onSelect(id);
  });
  dd.addEventListener('mouseover', e => { const o = e.target.closest('.t-cb-opt'); if (o) o.style.background = 'var(--bg3,#eee)'; });
  dd.addEventListener('mouseout',  e => { const o = e.target.closest('.t-cb-opt'); if (o) o.style.background = ''; });
}

// Enable/disable a combobox input visually. pass enabled=null to just clear value without changing disabled
function _resetCombo(inputId, enabled) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = '';
  if (enabled !== null) { el.disabled = !enabled; el.style.opacity = enabled ? '1' : '0.5'; }
}

// ── Load comunas for filter combobox ──────────────────────────────────────
async function _loadComunasForFilter(municipioId) {
  _tComunasList = [];
  _resetCombo('t-comuna-input', false);
  _resetCombo('t-puesto-input', false);
  try {
    const comunas = _tComunasCache[municipioId] || await window.api.get(`/comunas?municipioId=${municipioId}`);
    _tComunasCache[municipioId] = comunas;
    _tComunasList = comunas.map(c => ({ id: c.id, name: c.name }));
    if (_tComunasList.length) {
      _resetCombo('t-comuna-input', true);
      _attachCombobox('t-comuna-input', 't-comuna-dd', () => _tComunasList, 'Todas las comunas', id => {
        _tComunaId = id; _tPuestoId = null; _tPuestosList = [];
        _resetCombo('t-puesto-input', false);
        _loadPuestosForFilter(municipioId, id || null);
        _loadTestigos(1);
      });
    }
    // Also load all puestos for this muni (no comuna filter yet)
    _loadPuestosForFilter(municipioId, null);
  } catch (err) { console.error('_loadComunasForFilter failed:', err); }
}

// ── Load puestos for filter combobox ──────────────────────────────────────
async function _loadPuestosForFilter(municipioId, comunaId) {
  _tPuestosList = [];
  _resetCombo('t-puesto-input', false);
  try {
    const cacheKey = comunaId ? `${municipioId}:${comunaId}` : `${municipioId}`;
    let puestos = _tPuestosCache[cacheKey];
    if (!puestos) {
      const url = comunaId ? `/puestos?municipioId=${municipioId}&comunaId=${comunaId}` : `/puestos?municipioId=${municipioId}`;
      puestos = await window.api.get(url);
      _tPuestosCache[cacheKey] = puestos;
    }
    _tPuestosList = puestos.map(p => ({ id: p.id, name: p.name }));
    _resetCombo('t-puesto-input', true);
    _attachCombobox('t-puesto-input', 't-puesto-dd', () => _tPuestosList, 'Todos los puestos', id => {
      _tPuestoId = id;
      _loadTestigos(1);
    });
  } catch (err) { console.error('_loadPuestosForFilter failed:', err); }
}

// ── Puesto picker modal ────────────────────────────────────────────────────
function _openPuestoPicker() {
  // Remove any existing picker
  const existing = _testigosPanel.querySelector('.t-picker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 't-picker-overlay';
  overlay.innerHTML = `
    <div class="t-picker-box">
      <h4>Asignar puesto a ${_tSelectedIds.size} testigo${_tSelectedIds.size === 1 ? '' : 's'}</h4>
      <select id="t-pk-municipio">
        <option value="">Selecciona municipio...</option>
      </select>
      <select id="t-pk-puesto" disabled>
        <option value="">Selecciona puesto...</option>
      </select>
      <div class="t-err" id="t-pk-err"></div>
      <div class="t-picker-btns">
        <button class="t-btn-cancel" id="t-pk-cancel">Cancelar</button>
        <button class="t-btn-primary" id="t-pk-confirm" disabled>Confirmar</button>
      </div>
    </div>
  `;
  _testigosPanel.appendChild(overlay);

  // Populate municipios (use cached list if available)
  Promise.resolve(window._municipiosCache || window.api.get('/municipios'))
    .then(munis => {
      if (!window._municipiosCache) window._municipiosCache = munis;
      const sel = overlay.querySelector('#t-pk-municipio');
      if (!sel) return;
      munis.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    }).catch(err => {
      const errEl = overlay.querySelector('#t-pk-err');
      if (errEl) errEl.textContent = errorToSpanish(err);
    });

  // Municipio change → load puestos
  overlay.querySelector('#t-pk-municipio').addEventListener('change', async e => {
    const munId = e.target.value;
    const puestoSel = overlay.querySelector('#t-pk-puesto');
    const confirmBtn = overlay.querySelector('#t-pk-confirm');
    const errEl = overlay.querySelector('#t-pk-err');
    puestoSel.innerHTML = '<option value="">Cargando...</option>';
    puestoSel.disabled = true;
    confirmBtn.disabled = true;
    if (!munId) {
      puestoSel.innerHTML = '<option value="">Selecciona puesto...</option>';
      return;
    }
    try {
      const puestos = await window.api.get(`/puestos?municipioId=${munId}`);
      puestoSel.innerHTML = '<option value="">Selecciona puesto...</option>';
      puestos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        puestoSel.appendChild(opt);
      });
      puestoSel.disabled = false;
    } catch (err) {
      if (errEl) errEl.textContent = errorToSpanish(err);
      puestoSel.innerHTML = '<option value="">Error cargando puestos</option>';
    }
  });

  // Puesto change → enable confirm
  overlay.querySelector('#t-pk-puesto').addEventListener('change', e => {
    const confirmBtn = overlay.querySelector('#t-pk-confirm');
    confirmBtn.disabled = !e.target.value;
  });

  // Cancel
  overlay.querySelector('#t-pk-cancel').addEventListener('click', () => overlay.remove());

  // Confirm
  overlay.querySelector('#t-pk-confirm').addEventListener('click', async () => {
    const puestoId = Number(overlay.querySelector('#t-pk-puesto').value);
    if (!puestoId) return;
    const confirmBtn = overlay.querySelector('#t-pk-confirm');
    const errEl = overlay.querySelector('#t-pk-err');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Asignando...';
    try {
      await _doBulkAssign(puestoId, overlay);
      overlay.remove();
    } catch (err) {
      if (errEl) errEl.textContent = errorToSpanish(err);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirmar';
    }
  });
}

async function _doBulkAssign(puestoId, overlay) {
  const testigoIds = [..._tSelectedIds];
  const result = await window.api.patch('/testigos/bulk-assign', { testigoIds, puestoId });
  const assigned = result && result.assigned != null ? result.assigned : testigoIds.length;

  // Show success feedback in bulk bar
  const bar = document.getElementById('t-bulk-bar');
  if (bar) {
    const countEl = document.getElementById('t-sel-count');
    if (countEl) countEl.textContent = `✓ ${assigned} testigo${assigned === 1 ? '' : 's'} asignado${assigned === 1 ? '' : 's'}`;
    setTimeout(() => {
      _tSelectedIds.clear();
      _updateBulkBar();
    }, 1800);
  }

  _tSelectedIds.clear();
  await _loadTestigos(_tPage);
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function _openEditModal(testigoId) {
  const t = _tAllData.find(x => x.id === testigoId);
  if (!t) return;

  const existing = _testigosPanel.querySelector('.t-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 't-edit-overlay';
  overlay.innerHTML = `
    <div class="t-edit-box">
      <h4>Editar testigo #${t.id}</h4>
      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Nombre</label>
      <input type="text" id="t-ed-name" value="${esc(t.name || '')}" placeholder="Nombre completo">
      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Teléfono</label>
      <input type="text" id="t-ed-phone" value="${esc(t.phone || '')}" placeholder="300 000 0000">
      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Correo</label>
      <input type="email" id="t-ed-correo" value="${esc(t.correo || '')}" placeholder="correo@ejemplo.com">
      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Estado</label>
      <select id="t-ed-status">
        <option value="pendiente" ${t.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
        <option value="confirmado" ${t.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
        <option value="ausente" ${t.status === 'ausente' ? 'selected' : ''}>Ausente</option>
      </select>
      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Notas</label>
      <textarea id="t-ed-notes" placeholder="Observaciones...">${esc(t.notes || '')}</textarea>
      <div class="t-err" id="t-ed-err"></div>
      <div class="t-edit-btns">
        <button class="t-btn-cancel" id="t-ed-cancel">Cancelar</button>
        <button class="t-btn-primary" id="t-ed-save">Guardar</button>
      </div>
    </div>
  `;
  _testigosPanel.appendChild(overlay);

  overlay.querySelector('#t-ed-cancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#t-ed-save').addEventListener('click', async () => {
    const saveBtn = overlay.querySelector('#t-ed-save');
    const errEl = overlay.querySelector('#t-ed-err');
    const name = overlay.querySelector('#t-ed-name').value.trim();
    const phone = overlay.querySelector('#t-ed-phone').value.trim();
    const correo = overlay.querySelector('#t-ed-correo').value.trim();
    const notes = overlay.querySelector('#t-ed-notes').value.trim();
    const status = overlay.querySelector('#t-ed-status').value;

    if (!name) {
      errEl.textContent = 'El nombre es requerido.';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    errEl.textContent = '';

    try {
      await window.api.patch(`/testigos/${testigoId}`, { name, phone: phone || null, correo: correo || null, notes: notes || null, status });
      overlay.remove();
      await _loadTestigos(_tPage);
    } catch (err) {
      errEl.textContent = errorToSpanish(err);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });
}

// ── Pendientes WhatsApp modal ──────────────────────────────────────────────
async function _openPendientesModal() {
  const CONFIRM_BASE = 'https://coordinacion-electoral.vercel.app/testigo.html';

  // Remove any existing modal
  const existing = _testigosPanel.querySelector('.t-pendientes-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 't-pendientes-overlay t-picker-overlay';
  overlay.innerHTML = `
    <div class="t-picker-box" style="max-width:560px;width:100%">
      <h4>📲 Enviar enlaces a testigos pendientes</h4>
      <p style="font-size:12px;color:var(--t3);margin:6px 0 14px">Testigos que aún no han confirmado aceptación y tienen teléfono registrado.</p>
      <div id="t-pend-loading" style="text-align:center;padding:20px 0;color:var(--t3);font-size:13px">Cargando...</div>
      <div id="t-pend-list" style="display:none;max-height:380px;overflow-y:auto;display:none;flex-direction:column;gap:8px"></div>
      <div id="t-pend-empty" style="display:none;text-align:center;padding:20px 0;color:var(--t3);font-size:13px">No hay testigos pendientes con teléfono registrado.</div>
      <div style="margin-top:14px;text-align:right">
        <button class="t-btn-cancel" id="t-pend-close">Cerrar</button>
      </div>
    </div>
  `;
  _testigosPanel.appendChild(overlay);
  overlay.querySelector('#t-pend-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Load ALL testigos without pagination to find pendientes
  try {
    let page = 1;
    const limit = 200;
    let all = [];
    let total = Infinity;
    while (all.length < total) {
      let url = `/testigos?page=${page}&limit=${limit}`;
      const result = await window.api.get(url);
      const data = result.data || [];
      total = result.total || 0;
      all = all.concat(data);
      if (data.length < limit) break;
      page++;
    }

    // Filter: no confirmadoAt and has phone and has token
    const pendientes = all.filter(t => !t.confirmadoAt && t.phone && t.token);

    const loadingEl = overlay.querySelector('#t-pend-loading');
    const listEl = overlay.querySelector('#t-pend-list');
    const emptyEl = overlay.querySelector('#t-pend-empty');
    if (loadingEl) loadingEl.style.display = 'none';

    if (!pendientes.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (listEl) {
      listEl.style.display = 'flex';

      // Counter
      const counter = document.createElement('div');
      counter.style.cssText = 'font-size:12px;color:var(--t3);margin-bottom:6px';
      counter.textContent = `${pendientes.length} testigo${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'}`;
      listEl.appendChild(counter);

      pendientes.forEach(t => {
        const link = `${CONFIRM_BASE}?t=${encodeURIComponent(t.token)}`;
        const puestoNombre = t.puesto ? t.puesto.name : 'puesto sin asignar';
        const municipioNombre = (t.puesto && t.puesto.municipioId && _tMunicipiosMap[t.puesto.municipioId]) || '';
        const msg = `Hola ${t.name}, quedaste registrado(a) como testigo electoral en el puesto ${puestoNombre}${municipioNombre ? ' en ' + municipioNombre : ''}.\n\nUsa este enlace para confirmar tu participación:\n${link}\n\nGracias por apoyar a Abelardo de la Espriella 🇨🇴`;
        const waPhone = t.phone.replace(/\D/g,'');
        const waHref = `https://wa.me/57${waPhone}?text=${encodeURIComponent(msg)}`;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg2,#f8f9fb);border-radius:8px;gap:10px';
        row.innerHTML = `
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(t.phone)}${t.puesto ? ' · ' + esc(t.puesto.name) : ''}</div>
          </div>
          <a href="${esc(waHref)}" target="_blank" class="t-btn-primary" style="text-decoration:none;white-space:nowrap;font-size:12px;padding:6px 12px">💬 Enviar</a>
        `;
        listEl.appendChild(row);
      });
    }
  } catch (err) {
    const loadingEl = overlay.querySelector('#t-pend-loading');
    if (loadingEl) loadingEl.textContent = 'Error cargando testigos: ' + (err.message || '');
  }
}

// ── Menú desplegable PDF por comunas ──────────────────────────────────────
function _toggleComunasPDFMenu() {
  const menu = document.getElementById('t-comunas-pdf-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) { menu.style.display = 'none'; return; }

  const list = document.getElementById('t-comunas-pdf-list');
  if (!list) { menu.style.display = 'block'; return; }

  if (!_tMunicipioId) {
    list.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--t3)">Selecciona un municipio primero</div>';
    menu.style.display = 'block';
    return;
  }

  const comunas = _tComunasCache[_tMunicipioId];
  if (!comunas || !comunas.length) {
    list.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--t3)">No hay comunas para este municipio</div>';
    menu.style.display = 'block';
    return;
  }

  const muniNombre = _tMunicipiosMap[_tMunicipioId] || `Municipio ${_tMunicipioId}`;
  list.innerHTML =
    `<div data-action="t-download-all-comunas"
        style="padding:9px 14px;font-size:12px;cursor:pointer;color:#fff;background:#1a3a6e;font-weight:600;border-radius:4px;margin:6px 8px 2px;text-align:center"
        onmouseover="this.style.background='#122a55'" onmouseout="this.style.background='#1a3a6e'">
        ⬇️ Descargar todas las comunas
      </div>
      <div style="height:1px;background:var(--bdr);margin:6px 0 2px"></div>
      <div style="padding:4px 12px 2px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">${esc(muniNombre)}</div>`
    + comunas.map(c => `
      <div data-action="t-export-pdf-comuna-item" data-comuna-id="${c.id}" data-comuna-nombre="${esc(c.name)}"
        style="padding:8px 14px;font-size:12px;cursor:pointer;color:var(--fg)"
        onmouseover="this.style.background='var(--bg3,#eee)'" onmouseout="this.style.background=''">
        🏘️ ${esc(c.name)}
      </div>
    `).join('');
  menu.style.display = 'block';
}

// Cache for puestos-by-muni coordinator data  { municipioId -> Map<puestoId, coord> }
const _tCoordByPuestoCache = {};

function _coordLine(nombre, telefono, label) {
  if (!nombre) return '';
  const tel = telefono ? ` · ${esc(telefono)}` : '';
  return `<div class="coord-line"><span class="coord-label">${label}:</span> ${esc(nombre)}${tel}</div>`;
}

function _buildComunaHTML(tituloFiltro, puestosComuna, grupos, coords) {
  // coords: { comunaCoord, zonaCoord, puestoCoords: Map<id,{nombre,telefono,nombre2,telefono2}> }
  const { comunaCoord, zonaCoord, puestoCoords } = coords || {};
  const now = new Date().toLocaleString('es-CO');
  const totalTestigos = grupos.reduce((s, g) => s + g.testigos.length, 0);

  const coordHeader = [
    _coordLine(zonaCoord?.nombre, zonaCoord?.telefono, 'Coord. Zona'),
    _coordLine(comunaCoord?.nombre, comunaCoord?.telefono, 'Coord. Comuna'),
  ].filter(Boolean).join('');

  const sections = grupos.map(({ puesto, testigos }) => {
    const pc = puestoCoords?.get(puesto.id);
    const pCoordLines = [
      _coordLine(pc?.nombre || null, pc?.telefono || null, 'Coord. 1'),
      _coordLine(pc?.nombre2 || null, pc?.telefono2 || null, 'Coord. 2'),
    ].filter(Boolean).join('');

    const rows = testigos.map((t, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(t.name || '—')}</td>
        <td>${esc(t.cedula || '—')}</td>
        <td>${esc(t.phone || '—')}</td>
        <td>${esc(t.correo || '—')}</td>
        <td style="text-align:center">${esc(t.status || '—')}</td>
      </tr>
    `).join('');
    return `
      <div class="puesto-block">
        <div class="puesto-name">📍 ${esc(puesto.name)} <span class="puesto-count">(${testigos.length} testigo${testigos.length === 1 ? '' : 's'})</span></div>
        ${pCoordLines ? `<div class="puesto-coords">${pCoordLines}</div>` : ''}
        <table>
          <thead><tr><th>#</th><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Correo</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos — ${esc(tituloFiltro)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px;color:#111}
      h1{font-size:17px;margin-bottom:3px}
      .sub{font-size:10px;color:#666;margin-bottom:10px}
      .coord-header{background:#eef2f9;border:1px solid #c5d0e8;border-radius:6px;padding:8px 12px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap}
      .coord-line{font-size:11px;color:#1a3a6e}
      .coord-label{font-weight:700}
      .puesto-block{margin-bottom:22px;page-break-inside:avoid}
      .puesto-name{font-size:13px;font-weight:700;color:#1a3a6e;margin-bottom:4px;border-left:4px solid #1a3a6e;padding-left:8px}
      .puesto-coords{margin:2px 0 6px 12px;display:flex;gap:16px;flex-wrap:wrap}
      .puesto-coords .coord-line{font-size:10px;color:#444}
      .puesto-count{font-weight:400;font-size:11px;color:#555}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}
      th{background:#e8edf5;padding:4px 7px;text-align:left;border:1px solid #ccc;font-size:10px;text-transform:uppercase;color:#1a3a6e}
      td{padding:4px 7px;border:1px solid #ddd;font-size:11px}
      tr:nth-child(even) td{background:#f7f9fc}
      @media print{body{padding:8px}.puesto-block{page-break-inside:avoid}}
    </style>
  </head><body>
    <h1>🧾 Testigos por puesto — ${esc(tituloFiltro)}</h1>
    <div class="sub">Generado: ${now} | Total: ${totalTestigos} testigos en ${grupos.length} puesto${grupos.length === 1 ? '' : 's'} con testigos (de ${puestosComuna.length} en la comuna)</div>
    ${coordHeader ? `<div class="coord-header">${coordHeader}</div>` : ''}
    ${grupos.length === 0 ? '<p style="color:#888;font-style:italic">No hay testigos registrados en ningún puesto de esta comuna.</p>' : sections}
  </body></html>`;
}

async function _fetchComunaGrupos(municipioId, comunaId, zonaId) {
  const cacheKey = `${municipioId}:${comunaId}`;
  let puestosComuna = _tPuestosCache[cacheKey];
  if (!puestosComuna) {
    puestosComuna = await window.api.get(`/puestos?municipioId=${municipioId}&comunaId=${comunaId}`);
    _tPuestosCache[cacheKey] = puestosComuna;
  }
  if (!puestosComuna || !puestosComuna.length) return { puestosComuna: [], grupos: [], coords: {} };

  // Fetch testigos + coordinator data in parallel
  const [testigosResults, coordByPuesto, comunaCoord, zonaCoord] = await Promise.all([
    Promise.all(
      puestosComuna.map(p =>
        window.api.get(`/puestos/${p.id}/testigos`).then(ts => ({ puesto: p, testigos: ts || [] }))
      )
    ),
    // Puesto coordinators: fetch puestos-by-muni once and cache
    (async () => {
      if (!_tCoordByPuestoCache[municipioId]) {
        const data = await window.api.get(`/coordinador/puestos-by-muni/${municipioId}`);
        const map = new Map();
        (data || []).forEach(d => map.set(d.puestoId, d));
        _tCoordByPuestoCache[municipioId] = map;
      }
      return _tCoordByPuestoCache[municipioId];
    })(),
    window.api.get(`/coordinador/COMUNA/${comunaId}/display`).catch(() => null),
    zonaId ? window.api.get(`/coordinador/ZONA/${zonaId}/display`).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    puestosComuna,
    grupos: testigosResults.filter(g => g.testigos.length > 0),
    coords: {
      puestoCoords: coordByPuesto,
      comunaCoord: comunaCoord?.nombre ? comunaCoord : null,
      zonaCoord: zonaCoord?.nombre ? zonaCoord : null,
    },
  };
}

function _triggerHTMLDownload(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function _downloadAllComunasPDF() {
  if (!_tMunicipioId) {
    alert('Selecciona primero un municipio.');
    return;
  }

  const comunas = _tComunasCache[_tMunicipioId];
  if (!comunas || !comunas.length) {
    alert('No hay comunas cargadas para este municipio. Selecciónalo primero en el filtro.');
    return;
  }

  const muniNombre = _tMunicipiosMap[_tMunicipioId] || `Municipio ${_tMunicipioId}`;
  const safeStr = s => s.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').trim().replace(/\s+/g, '_');

  // Show progress indicator
  const progressId = 't-download-progress';
  let progEl = document.getElementById(progressId);
  if (!progEl) {
    progEl = document.createElement('div');
    progEl.id = progressId;
    progEl.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1a3a6e;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,.3)';
    document.body.appendChild(progEl);
  }

  let done = 0;
  for (const comuna of comunas) {
    progEl.textContent = `⬇️ Descargando ${done + 1}/${comunas.length}: ${comuna.name}...`;
    try {
      const { puestosComuna, grupos, coords } = await _fetchComunaGrupos(_tMunicipioId, comuna.id, comuna.zonaId);
      const titulo = `${muniNombre} — ${comuna.name}`;
      const html = _buildComunaHTML(titulo, puestosComuna, grupos, coords);
      const filename = `testigos_${safeStr(muniNombre)}_${safeStr(comuna.name)}.html`;
      _triggerHTMLDownload(html, filename);
      await new Promise(r => setTimeout(r, 400)); // small delay between downloads
    } catch (err) {
      console.error(`Error descargando ${comuna.name}:`, err);
    }
    done++;
  }

  progEl.textContent = `✅ ${done} archivos descargados`;
  setTimeout(() => progEl.remove(), 3000);
}

async function _exportPDFComunaById(comunaId, comunaNombre) {
  const muniNombre = _tMunicipioId ? (_tMunicipiosMap[_tMunicipioId] || '') : '';
  const tituloFiltro = muniNombre ? `${muniNombre} — ${comunaNombre}` : comunaNombre;
  const zonaId = (_tComunasCache[_tMunicipioId] || []).find(c => c.id === comunaId)?.zonaId || null;

  const win = window.open('', '_blank', 'width=950,height=750');
  if (!win) { alert('El navegador bloqueó la ventana emergente. Permite popups para este sitio.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cargando...</title></head><body style="font-family:Arial,sans-serif;padding:30px;color:#555">Cargando testigos de ${esc(tituloFiltro)}...</body></html>`);

  try {
    const { puestosComuna, grupos, coords } = await _fetchComunaGrupos(_tMunicipioId, comunaId, zonaId);
    const html = _buildComunaHTML(tituloFiltro, puestosComuna, grupos, coords);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  } catch (err) {
    win.document.write(`<p style="color:red">Error: ${err.message || ''}</p>`);
  }
}

// ── PDF export por comuna ──────────────────────────────────────────────────
async function _exportPDFComuna() {
  if (!_tComunaId) {
    alert('Selecciona primero una comuna en el filtro para exportar el PDF por comuna.');
    return;
  }
  const comunaNombre = _tComunasList.find(c => c.id === _tComunaId)?.name || `Comuna ${_tComunaId}`;
  _exportPDFComunaById(_tComunaId, comunaNombre);
}

// ── Excel export ────────────────────────────────────────────────────────────
async function _exportExcel() {
  // Show loading state on button
  const excelBtn = _testigosPanel?.querySelector('[data-action="t-export-excel"]');
  const origLabel = excelBtn ? excelBtn.textContent : '';
  if (excelBtn) { excelBtn.textContent = '⏳ Exportando...'; excelBtn.disabled = true; }

  // Fetch ALL testigos matching current filters
  let allData = [];
  try {
    let page = 1;
    const limit = 200;
    let total = Infinity;
    while (allData.length < total) {
      let url = `/testigos?page=${page}&limit=${limit}`;
      if (_tSearch) url += `&search=${encodeURIComponent(_tSearch)}`;
      if (_tSinPuesto) url += '&sinPuesto=true';
      if (_tPuestoId) url += `&puestoId=${_tPuestoId}`;
      else if (_tComunaId) url += `&comunaId=${_tComunaId}`;
      else if (_tMunicipioId) url += `&municipioId=${_tMunicipioId}`;
      const result = await window.api.get(url);
      const data = result.data || [];
      total = result.total || 0;
      allData = allData.concat(data);
      if (data.length < limit) break;
      page++;
    }
  } catch (err) {
    if (excelBtn) { excelBtn.textContent = origLabel; excelBtn.disabled = false; }
    alert('Error cargando datos: ' + (err.message || ''));
    return;
  }

  // Fetch coordinator + structural data when municipio is selected
  let puestoCoordMap = new Map();
  let puestoComunaMap = new Map();
  let comunaCoordMap = new Map();
  let zonaCoordMap = new Map();
  let comunaZonaMap = new Map();
  let comunaNameMap = new Map();
  let zonaNameMap = new Map();

  if (_tMunicipioId) {
    try {
      const [puestosRef, puestoCoords, zonasRef] = await Promise.all([
        window.api.get(`/puestos?municipioId=${_tMunicipioId}`),
        window.api.get(`/coordinador/puestos-by-muni/${_tMunicipioId}`),
        window.api.get('/zonas'),
      ]);
      (puestosRef || []).forEach(p => puestoComunaMap.set(p.id, p.comunaId));
      (puestoCoords || []).forEach(d => puestoCoordMap.set(d.puestoId, d));
      (zonasRef || []).forEach(z => zonaNameMap.set(z.id, z.name));

      const comunasList = _tComunasCache[_tMunicipioId] || [];
      comunasList.forEach(c => {
        comunaNameMap.set(c.id, c.name);
        if (c.zonaId) comunaZonaMap.set(c.id, c.zonaId);
      });

      const puestoIdSet = new Set(allData.filter(t => t.puesto).map(t => t.puesto.id));
      const comunaIds = new Set([...puestoIdSet].map(pId => puestoComunaMap.get(pId)).filter(Boolean));

      const [comunaCoords, zonaCoords] = await Promise.all([
        Promise.all([...comunaIds].map(cId =>
          window.api.get(`/coordinador/COMUNA/${cId}/display`).catch(() => null).then(r => ({ cId, r }))
        )),
        Promise.all([...new Set([...comunaIds].map(cId => comunaZonaMap.get(cId)).filter(Boolean))].map(zId =>
          window.api.get(`/coordinador/ZONA/${zId}/display`).catch(() => null).then(r => ({ zId, r }))
        )),
      ]);
      comunaCoords.forEach(({ cId, r }) => { if (r?.nombre) comunaCoordMap.set(cId, r); });
      zonaCoords.forEach(({ zId, r }) => { if (r?.nombre) zonaCoordMap.set(zId, r); });
    } catch (e) { /* optional */ }
  }

  // Build CSV rows
  const csvEsc = v => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers = [
    'ID', 'Nombre', 'Cédula', 'Teléfono', 'Correo', 'Estado',
    'Puesto', 'Municipio', 'Zona', 'Comuna',
    'Coord. Puesto 1', 'Tel. Coord. Puesto 1',
    'Coord. Puesto 2', 'Tel. Coord. Puesto 2',
    'Coord. Comuna', 'Tel. Coord. Comuna',
    'Coord. Zona', 'Tel. Coord. Zona',
  ];

  const csvRows = allData.map(t => {
    const pId = t.puesto?.id;
    const cId = pId ? puestoComunaMap.get(pId) : null;
    const zId = cId ? comunaZonaMap.get(cId) : null;
    const pc = pId ? puestoCoordMap.get(pId) : null;
    const cc = cId ? comunaCoordMap.get(cId) : null;
    const zc = zId ? zonaCoordMap.get(zId) : null;
    const muniName = t.puesto?.municipioId ? (_tMunicipiosMap[t.puesto.municipioId] || '') : '';
    return [
      t.id,
      t.name || '',
      t.cedula || '',
      t.phone || '',
      t.correo || '',
      t.status || '',
      t.puesto?.name || '',
      muniName,
      zId ? (zonaNameMap.get(zId) || '') : '',
      cId ? (comunaNameMap.get(cId) || '') : '',
      pc?.nombre || '',
      pc?.telefono || '',
      pc?.nombre2 || '',
      pc?.telefono2 || '',
      cc?.nombre || '',
      cc?.telefono || '',
      zc?.nombre || '',
      zc?.telefono || '',
    ].map(csvEsc).join(',');
  });

  const csv = '﻿' + [headers.map(csvEsc).join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  a.href = url;
  a.download = `testigos_AMVA_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (excelBtn) { excelBtn.textContent = origLabel; excelBtn.disabled = false; }
}

// ── PDF export ─────────────────────────────────────────────────────────────
async function _exportPDF() {
  const now = new Date().toLocaleString('es-CO');
  const subtitle = _tSearch ? ` | Búsqueda: "${esc(_tSearch)}"` : '';

  // Open window early to avoid popup blocker
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('El navegador bloqueó la ventana emergente. Permite popups para este sitio.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos</title></head><body style="font-family:Arial,sans-serif;padding:30px;color:#555">⏳ Cargando resumen completo...</body></html>`);

  // Fetch ALL testigos matching current filters
  let allData = [];
  try {
    let page = 1;
    const limit = 200;
    let total = Infinity;
    while (allData.length < total) {
      let url = `/testigos?page=${page}&limit=${limit}`;
      if (_tSearch) url += `&search=${encodeURIComponent(_tSearch)}`;
      if (_tSinPuesto) url += '&sinPuesto=true';
      if (_tPuestoId) url += `&puestoId=${_tPuestoId}`;
      else if (_tComunaId) url += `&comunaId=${_tComunaId}`;
      else if (_tMunicipioId) url += `&municipioId=${_tMunicipioId}`;
      const result = await window.api.get(url);
      const data = result.data || [];
      total = result.total || 0;
      allData = allData.concat(data);
      if (data.length < limit) break;
      page++;
    }
  } catch (err) {
    win.document.open();
    win.document.write(`<p style="color:red;font-family:Arial,sans-serif;padding:20px">Error cargando datos: ${esc(err.message || '')}</p>`);
    win.document.close();
    return;
  }

  // Build puesto → testigo count + puestoId map
  const puestoCountMap = new Map(); // puestoName → count
  const puestoIdMap = new Map();    // puestoName → puestoId
  allData.forEach(t => {
    const key = t.puesto ? t.puesto.name : '— Sin puesto asignado —';
    puestoCountMap.set(key, (puestoCountMap.get(key) || 0) + 1);
    if (t.puesto && !puestoIdMap.has(key)) puestoIdMap.set(key, t.puesto.id);
  });
  const puestosSorted = [...puestoCountMap.entries()].sort((a, b) => b[1] - a[1]);
  const sinPuestoCount = allData.filter(t => !t.puesto).length;

  // Fetch coordinator + structural data when a municipio is selected
  let puestoCoordMap = new Map();   // puestoId → {nombre,telefono,nombre2,telefono2}
  let puestoComunaMap = new Map();  // puestoId → comunaId
  let comunaCoordMap = new Map();   // comunaId → {nombre,telefono}
  let zonaCoordMap = new Map();     // zonaId → {nombre,telefono}
  let comunaZonaMap = new Map();    // comunaId → zonaId
  let comunaNameMap = new Map();    // comunaId → name
  let zonaNameMap = new Map();      // zonaId → name
  const hasCoords = !!_tMunicipioId;

  if (hasCoords) {
    try {
      const [puestosRef, puestoCoords, zonasRef] = await Promise.all([
        window.api.get(`/puestos?municipioId=${_tMunicipioId}`),
        window.api.get(`/coordinador/puestos-by-muni/${_tMunicipioId}`),
        window.api.get('/zonas'),
      ]);
      (puestosRef || []).forEach(p => puestoComunaMap.set(p.id, p.comunaId));
      (puestoCoords || []).forEach(d => puestoCoordMap.set(d.puestoId, d));
      (zonasRef || []).forEach(z => zonaNameMap.set(z.id, z.name));

      // comunaId → name and zonaId from cache
      const comunasList = _tComunasCache[_tMunicipioId] || [];
      comunasList.forEach(c => {
        comunaNameMap.set(c.id, c.name);
        if (c.zonaId) comunaZonaMap.set(c.id, c.zonaId);
      });

      // Unique comunaIds that have testigos
      const comunaIds = new Set();
      puestoIdMap.forEach(pId => { const cId = puestoComunaMap.get(pId); if (cId) comunaIds.add(cId); });

      const comunaCoords = await Promise.all(
        [...comunaIds].map(cId =>
          window.api.get(`/coordinador/COMUNA/${cId}/display`).catch(() => null).then(r => ({ cId, r }))
        )
      );
      comunaCoords.forEach(({ cId, r }) => { if (r?.nombre) comunaCoordMap.set(cId, r); });

      const zonaIds = new Set();
      comunaIds.forEach(cId => { const zId = comunaZonaMap.get(cId); if (zId) zonaIds.add(zId); });

      const zonaCoords = await Promise.all(
        [...zonaIds].map(zId =>
          window.api.get(`/coordinador/ZONA/${zId}/display`).catch(() => null).then(r => ({ zId, r }))
        )
      );
      zonaCoords.forEach(({ zId, r }) => { if (r?.nombre) zonaCoordMap.set(zId, r); });
    } catch (e) { /* coordinator data is optional */ }
  }

  // Helper to format a coordinator cell
  function _fmtCoord(c) {
    if (!c?.nombre) return '<span style="color:#bbb;font-style:italic">Sin asignar</span>';
    return `<b>${esc(c.nombre)}</b>${c.telefono ? '<br>📞 ' + esc(c.telefono) : ''}`;
  }

  // Build recuento HTML grouped by Zona → Comuna → Puestos
  let recuentoHTML = '';
  const showCoordCols = hasCoords;
  const colHeader = showCoordCols
    ? '<th>Puesto</th><th style="text-align:center;width:60px">Test.</th><th>Coord. Puesto</th><th>Coord. Comuna</th><th>Coord. Zona</th>'
    : '<th>Puesto</th><th style="text-align:center">Testigos</th>';

  if (hasCoords) {
    // Group puestos by zona → comuna
    // zonaId → comunaId → [{name, count}]
    const zonaMap = new Map(); // zonaId → Map<comunaId, [{name,cnt}]>
    const sinZona = new Map(); // comunaId → [{name,cnt}]

    puestosSorted.forEach(([nombre, cnt]) => {
      if (nombre === '— Sin puesto asignado —') return;
      const pId = puestoIdMap.get(nombre);
      const cId = pId ? puestoComunaMap.get(pId) : null;
      const zId = cId ? comunaZonaMap.get(cId) : null;

      if (zId) {
        if (!zonaMap.has(zId)) zonaMap.set(zId, new Map());
        const cMap = zonaMap.get(zId);
        if (!cMap.has(cId)) cMap.set(cId, []);
        cMap.get(cId).push({ nombre, cnt, pId });
      } else {
        const bucket = cId || 0;
        if (!sinZona.has(bucket)) sinZona.set(bucket, []);
        sinZona.get(bucket).push({ nombre, cnt, pId });
      }
    });

    // Render zona sections
    zonaMap.forEach((cMap, zId) => {
      const zName = zonaNameMap.get(zId) || `Zona ${zId}`;
      const zc = zonaCoordMap.get(zId);
      const zonaTotal = [...cMap.values()].flat().reduce((s, p) => s + p.cnt, 0);

      recuentoHTML += `
        <tr style="background:#1a3a6e;color:#fff">
          <td colspan="${showCoordCols ? 5 : 2}" style="font-size:12px;font-weight:700;padding:7px 10px;border:none">
            🗺 ${esc(zName)} — ${zonaTotal} testigos
            ${zc ? `<span style="font-weight:400;margin-left:16px;font-size:10px">Coord. Zona: ${esc(zc.nombre)}${zc.telefono ? ' · 📞 ' + esc(zc.telefono) : ''}</span>` : ''}
          </td>
        </tr>`;

      cMap.forEach((puestos, cId) => {
        const cName = comunaNameMap.get(cId) || `Comuna ${cId}`;
        const cc = comunaCoordMap.get(cId);
        const comunaTotal = puestos.reduce((s, p) => s + p.cnt, 0);

        recuentoHTML += `
          <tr style="background:#dce6f5">
            <td colspan="${showCoordCols ? 5 : 2}" style="font-size:11px;font-weight:700;padding:5px 10px;color:#1a3a6e;border-color:#b0c4de">
              📍 ${esc(cName)} — ${comunaTotal} testigos
              ${cc ? `<span style="font-weight:400;margin-left:12px;font-size:10px;color:#333">Coord. Comuna: ${esc(cc.nombre)}${cc.telefono ? ' · 📞 ' + esc(cc.telefono) : ''}</span>` : ''}
            </td>
          </tr>`;

        puestos.forEach(({ nombre, cnt, pId }) => {
          const pc = pId ? puestoCoordMap.get(pId) : null;
          const coordPuesto = pc?.nombre
            ? `<b>${esc(pc.nombre)}</b>${pc.telefono ? '<br>📞 ' + esc(pc.telefono) : ''}${pc.nombre2 ? '<br><b>' + esc(pc.nombre2) + '</b>' + (pc.telefono2 ? '<br>📞 ' + esc(pc.telefono2) : '') : ''}`
            : '<span style="color:#bbb;font-style:italic">Sin asignar</span>';
          recuentoHTML += `<tr>
            <td style="padding-left:20px">${esc(nombre)}</td>
            <td style="text-align:center;font-weight:700">${cnt}</td>
            ${showCoordCols ? `<td style="font-size:10px">${coordPuesto}</td><td style="font-size:10px">${_fmtCoord(cc)}</td><td style="font-size:10px">${_fmtCoord(zc)}</td>` : ''}
          </tr>`;
        });
      });
    });

    // Sin zona bucket
    if (sinZona.size > 0) {
      recuentoHTML += `<tr style="background:#e8e8e8"><td colspan="${showCoordCols ? 5 : 2}" style="font-weight:700;padding:5px 10px;font-size:11px">Sin zona asignada</td></tr>`;
      sinZona.forEach((puestos, cId) => {
        const cName = cId ? (comunaNameMap.get(cId) || `Comuna ${cId}`) : '';
        const cc = cId ? comunaCoordMap.get(cId) : null;
        if (cName) recuentoHTML += `<tr style="background:#f0f0f0"><td colspan="${showCoordCols ? 5 : 2}" style="font-size:11px;font-weight:600;padding:4px 10px;color:#444">${esc(cName)}</td></tr>`;
        puestos.forEach(({ nombre, cnt, pId }) => {
          const pc = pId ? puestoCoordMap.get(pId) : null;
          const coordPuesto = pc?.nombre
            ? `<b>${esc(pc.nombre)}</b>${pc.telefono ? '<br>📞 ' + esc(pc.telefono) : ''}`
            : '<span style="color:#bbb;font-style:italic">Sin asignar</span>';
          recuentoHTML += `<tr>
            <td style="padding-left:20px">${esc(nombre)}</td>
            <td style="text-align:center;font-weight:700">${cnt}</td>
            ${showCoordCols ? `<td style="font-size:10px">${coordPuesto}</td><td style="font-size:10px">${_fmtCoord(cc)}</td><td style="font-size:10px">—</td>` : ''}
          </tr>`;
        });
      });
    }

    // Sin puesto row
    if (sinPuestoCount > 0) {
      recuentoHTML += `<tr style="background:#fff3cd"><td colspan="${showCoordCols ? 5 : 2}" style="font-style:italic;color:#856404;padding:5px 10px">Sin puesto asignado: ${sinPuestoCount} testigos</td></tr>`;
    }
  } else {
    // No municipio filter: simple flat list sorted by count
    recuentoHTML = puestosSorted.map(([nombre, cnt]) =>
      `<tr><td>${esc(nombre)}</td><td style="text-align:center;font-weight:700">${cnt}</td></tr>`
    ).join('');
  }

  // Build detail rows
  const rows = allData.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${esc(t.name || '—')}</td>
      <td>${esc(t.cedula || '—')}</td>
      <td>${esc(t.phone || '—')}</td>
      <td>${esc(t.correo || '—')}</td>
      <td>${esc(t.status || '—')}</td>
      <td>${t.puesto ? esc(t.puesto.name) : 'Sin asignar'}</td>
    </tr>
  `).join('');

  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
      h1{font-size:16px;margin-bottom:4px}
      h2{font-size:13px;color:#1a3a6e;margin:20px 0 8px}
      .sub{font-size:10px;color:#666;margin-bottom:16px}
      .resumen-box{display:flex;gap:28px;flex-wrap:wrap;background:#eef2f9;border:1px solid #c5d0e8;border-radius:6px;padding:10px 14px;margin-bottom:18px}
      .resumen-stat{text-align:center}
      .resumen-stat .val{font-size:22px;font-weight:700;color:#1a3a6e}
      .resumen-stat .lbl{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.5px}
      table{width:100%;border-collapse:collapse}
      th{background:#e8edf5;padding:5px 8px;text-align:left;border:1px solid #ddd;font-size:10px;text-transform:uppercase;color:#1a3a6e}
      td{padding:5px 8px;border:1px solid #ddd;vertical-align:top}
      tr:nth-child(even) td{background:#f7f9fc}
      @media print{body{padding:10px}.resumen-box{break-inside:avoid}}
    </style>
  </head><body>
    <h1>🧾 Listado de Testigos — AMVA 2026</h1>
    <div class="sub">Generado: ${now}${subtitle} | ${allData.length} testigos</div>

    <div class="resumen-box">
      <div class="resumen-stat"><div class="val">${allData.length}</div><div class="lbl">Total testigos</div></div>
      <div class="resumen-stat"><div class="val">${puestosSorted.filter(([k]) => k !== '— Sin puesto asignado —').length}</div><div class="lbl">Puestos con testigos</div></div>
      <div class="resumen-stat"><div class="val">${sinPuestoCount}</div><div class="lbl">Sin puesto asignado</div></div>
    </div>

    <h2>Recuento por puesto</h2>
    <table style="margin-bottom:24px">
      <thead><tr>${colHeader}</tr></thead>
      <tbody>${recuentoHTML}</tbody>
    </table>

    <h2>Detalle de testigos</h2>
    <table>
      <thead><tr><th>ID</th><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th>Puesto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── Expose globally ────────────────────────────────────────────────────────
window.openTestigosPage = openTestigosPage;
window.closeTestigosPage = closeTestigosPage;

// ── Standalone page bootstrap (testigos.html) ─────────────────────────────
if (document.getElementById('page-content')) {
  window.showMustChangePasswordModal = function() {
    window.location.replace('/');
  };

  window.doLogout = function() {
    if (window.api) window.api.post('/auth/logout', {}).catch(() => {});
    firebase.auth().signOut().then(() => {
      window.CURRENT_USER = null;
      window.location.replace('/');
    }).catch(() => window.location.replace('/'));
  };

  // authReady (auth-gate.js) resuelve cuando Firebase termina de rehidratar.
  // Si no hay user → redirect inmediato sin esperar timeout.
  window.authReady.then((user) => {
    if (!user) window.location.replace('/');
  });

  window.startApp = function(me) {
    document.getElementById('auth-gate-overlay')?.remove();
    if (me.role !== 'SUPER_ADMIN' && me.role !== 'REGIONAL_COORDINATOR') {
      window.location.replace('/');
      return;
    }
    window.CURRENT_USER = me;
    const label = document.getElementById('user-label');
    if (label) label.textContent = me.displayName || me.username;

    const container = document.getElementById('page-content');
    if (!container) return;
    _testigosPanel = container;
    container.innerHTML = _buildPanelHTML();
    const closeBtn = container.querySelector('[data-action="close-testigos-page"]');
    if (closeBtn) { closeBtn.textContent = '← Dashboard'; closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--t2);font-size:12px;font-weight:600'; }
    window.closeTestigosPage = () => window.location.replace('/');
    _attachListeners();
    _loadMunicipios();
    _loadTestigos(1);
    if (typeof initProfileWidget === 'function') initProfileWidget(me);
  };
}
