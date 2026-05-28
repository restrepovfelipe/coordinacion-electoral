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
let _tPuestosCache = {}; // municipioId -> [{id, name}]

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
          <button class="dir-pdf" data-action="t-export-pdf">📄 Exportar PDF</button>
          <button class="dir-close" data-action="close-testigos-page">Cerrar ✕</button>
        </div>
      </div>

      <div class="t-filter-bar">
        <input type="text" id="t-search" placeholder="Buscar nombre, cédula o teléfono..." style="flex:1;min-width:200px">
        <label>
          <input type="checkbox" id="t-sin-puesto-cb">
          Sin puesto
        </label>
        <select id="t-municipio-sel">
          <option value="">Todos los municipios</option>
        </select>
        <select id="t-puesto-sel" disabled style="opacity:0.55">
          <option value="">Todos los puestos</option>
        </select>
        <button class="t-btn-cancel" data-action="t-clear-filters">Limpiar filtros</button>
      </div>

      <div class="t-bulk-bar hidden" id="t-bulk-bar">
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

    return `<tr>
      <td><input type="checkbox" class="t-row-cb" data-id="${t.id}" ${checked}></td>
      <td style="color:var(--t3)">${t.id}</td>
      <td style="font-weight:500">${esc(t.name || '—')}</td>
      <td>${esc(t.cedula || '—')}</td>
      <td style="white-space:nowrap">${phone}</td>
      <td>${statusBadge}</td>
      <td>${puesto}</td>
      <td>${municipioName}</td>
      <td><button class="tbtn" data-action="edit-testigo" data-id="${t.id}" style="font-size:11px;padding:3px 10px">Editar</button></td>
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
      _tSearch = '';
      _tSinPuesto = false;
      _tMunicipioId = null;
      _tPuestoId = null;
      const searchEl = document.getElementById('t-search');
      const cbEl = document.getElementById('t-sin-puesto-cb');
      const selEl = document.getElementById('t-municipio-sel');
      const puestoSel = document.getElementById('t-puesto-sel');
      if (searchEl) searchEl.value = '';
      if (cbEl) cbEl.checked = false;
      if (selEl) selEl.value = '';
      if (puestoSel) { puestoSel.innerHTML = '<option value="">Todos los puestos</option>'; puestoSel.disabled = true; puestoSel.style.opacity = '0.55'; }
      _loadTestigos(1);
    } else if (action === 't-deselect-all') {
      _tSelectedIds.clear();
      _updateBulkBar();
      _renderTable();
    } else if (action === 'bulk-assign-btn') {
      _openPuestoPicker();
    } else if (action === 'edit-testigo') {
      _openEditModal(Number(btn.dataset.id));
    } else if (action === 't-export-pdf') {
      _exportPDF();
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

    if (e.target.id === 't-municipio-sel') {
      _tMunicipioId = e.target.value ? Number(e.target.value) : null;
      _tPuestoId = null; // reset puesto when municipio changes
      const puestoSel = document.getElementById('t-puesto-sel');
      if (puestoSel) { puestoSel.innerHTML = '<option value="">Todos los puestos</option>'; puestoSel.disabled = true; puestoSel.style.opacity = '0.55'; }
      if (_tMunicipioId) _loadPuestosForFilter(_tMunicipioId);
      _loadTestigos(1);
      return;
    }

    if (e.target.id === 't-puesto-sel') {
      _tPuestoId = e.target.value ? Number(e.target.value) : null;
      _loadTestigos(1);
      return;
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
    const sel = document.getElementById('t-municipio-sel');
    munis.forEach(m => {
      _tMunicipiosMap[m.id] = m.name;
      if (sel) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
      }
    });
  } catch (err) {
    console.error('_loadMunicipios failed:', err);
  }
}

// ── Load puestos into filter select ───────────────────────────────────────
async function _loadPuestosForFilter(municipioId) {
  const puestoSel = document.getElementById('t-puesto-sel');
  if (!puestoSel) return;
  puestoSel.innerHTML = '<option value="">Cargando...</option>';
  puestoSel.disabled = true;
  puestoSel.style.opacity = '0.55';
  try {
    const puestos = _tPuestosCache[municipioId] || await window.api.get(`/puestos?municipioId=${municipioId}`);
    _tPuestosCache[municipioId] = puestos;
    puestoSel.innerHTML = '<option value="">Todos los puestos</option>';
    puestos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      puestoSel.appendChild(opt);
    });
    puestoSel.disabled = false;
    puestoSel.style.opacity = '1';
  } catch (err) {
    console.error('_loadPuestosForFilter failed:', err);
    puestoSel.innerHTML = '<option value="">Error cargando puestos</option>';
  }
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

// ── PDF export ─────────────────────────────────────────────────────────────
function _exportPDF() {
  const now = new Date().toLocaleString('es-CO');
  const rows = _tAllData.map(t => `
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

  const totalPages = Math.ceil(_tTotal / _T_LIMIT);
  const subtitle = _tSearch ? ` | Búsqueda: "${esc(_tSearch)}"` : '';

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Testigos</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
      h1{font-size:16px;margin-bottom:4px}
      .sub{font-size:10px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#f0f0f0;padding:5px 8px;text-align:left;border:1px solid #ddd;font-size:10px;text-transform:uppercase}
      td{padding:5px 8px;border:1px solid #ddd}
      tr:nth-child(even) td{background:#f9f9f9}
      @media print{body{padding:10px}}
    </style>
  </head><body>
    <h1>🧾 Listado de Testigos — AMVA 2026</h1>
    <div class="sub">Generado: ${now}${subtitle} | Página ${_tPage} de ${totalPages} (${_tAllData.length} registros mostrados de ${_tTotal})</div>
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
