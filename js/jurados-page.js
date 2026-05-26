// js/jurados-page.js
// Jurados management page — read-only, any authenticated user

let _jPage = null;
let _jData = [];
let _jTotal = 0;
let _jSearch = '';
let _jMunicipioId = null;
let _jSearchTimer = null;
let _jMunicipiosMap = {};

const _J_MUNIS_KEY = 'cache:jurados-municipios';
const _J_MUNIS_TTL = 5 * 60 * 1000;

function openJuradosPage() {
  if (!_jPage) {
    _jPage = document.createElement('div');
    _jPage.className = 'dir-modal';
    _jPage.id = 'jurados-page-panel';
    _jPage.innerHTML = _buildJuradosHTML();
    document.body.appendChild(_jPage);
    _attachJuradosListeners();
    _loadJuradosMunicipios();
  }
  _jPage.style.display = 'flex';
  _loadJurados();
}

function closeJuradosPage() {
  if (_jPage) _jPage.style.display = 'none';
}

function _buildJuradosHTML() {
  return `
    <div class="dir-box t-page-box" style="position:relative">
      <div class="dir-hd">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>⚖️ Jurados de Votación</h2>
          <span class="t-counter" id="j-counter">—</span>
        </div>
        <div class="dir-hd-btns">
          <button class="dir-pdf" data-jaction="j-export-pdf">📄 Exportar PDF</button>
          <button class="dir-close" data-jaction="close-jurados-page">Cerrar ✕</button>
        </div>
      </div>

      <div class="t-filter-bar">
        <input type="text" id="j-search" placeholder="Buscar nombre, cédula, teléfono o municipio..." style="flex:1;min-width:200px">
        <select id="j-municipio-sel">
          <option value="">Todos los municipios</option>
        </select>
        <button class="t-btn-cancel" data-jaction="j-clear-filters">Limpiar filtros</button>
      </div>

      <div class="t-table-wrap" id="j-table-wrap">
        <p style="color:var(--t3);font-size:12px;padding:20px 0">Cargando...</p>
      </div>

      <div style="padding:8px 0;font-size:11px;color:var(--t3);text-align:center">
        Vista de solo lectura · Los jurados no se cuentan como testigos ni afectan cobertura
      </div>
    </div>
  `;
}

async function _loadJurados() {
  const wrap = document.getElementById('j-table-wrap');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;padding:40px 0"><div class="spinner"></div></div>';

  let url = '/jurados?';
  if (_jSearch) url += `search=${encodeURIComponent(_jSearch)}&`;
  if (_jMunicipioId) url += `municipioId=${_jMunicipioId}&`;

  try {
    const result = await window.api.get(url);
    _jData  = result.data  || [];
    _jTotal = result.total || 0;
    _renderJuradosTable();
    const badge = document.getElementById('j-counter');
    if (badge) badge.textContent = `${_jTotal.toLocaleString('es-CO')} jurados`;
  } catch (err) {
    console.error('_loadJurados failed:', err);
    if (wrap) wrap.innerHTML = `<p style="color:var(--red);font-size:12px;padding:20px 0">${esc(errorToSpanish(err))}</p>`;
  }
}

function _renderJuradosTable() {
  const wrap = document.getElementById('j-table-wrap');
  if (!wrap) return;

  if (!_jData.length) {
    wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 0">No se encontraron jurados.</p>';
    return;
  }

  const rows = _jData.map(j => {
    const puesto = j.puesto ? esc(j.puesto.name) : `<span style="color:var(--t3)">${esc(j.puestoNombreCsv || 'Sin asignar')}</span>`;
    const muni   = j.puesto && j.puesto.municipioId
      ? esc(_jMunicipiosMap[j.puesto.municipioId] || j.municipio)
      : esc(j.municipio || '—');
    const phone  = j.telefono
      ? `<a class="wa-btn" href="https://wa.me/57${esc(j.telefono.replace(/\D/g,''))}" target="_blank" title="WhatsApp">💬</a> ${esc(j.telefono)}`
      : '—';
    return `<tr>
      <td style="font-weight:500">${esc(j.nombre || '—')}</td>
      <td>${esc(j.cedula || '—')}</td>
      <td style="white-space:nowrap">${phone}</td>
      <td>${esc(j.correo || '—')}</td>
      <td>${muni}</td>
      <td>${puesto}</td>
      <td><span class="t-status t-status-${esc(j.estado)}">${esc(j.estado || '—')}</span></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="t-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Cédula</th>
          <th>Teléfono</th>
          <th>Correo</th>
          <th>Municipio</th>
          <th>Puesto</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${_jTotal > _jData.length ? `<p style="font-size:11px;color:var(--t3);padding:8px 0;text-align:center">Mostrando ${_jData.length} de ${_jTotal.toLocaleString('es-CO')} — usá los filtros para acotar</p>` : ''}
  `;
}

function _attachJuradosListeners() {
  if (!_jPage) return;

  _jPage.addEventListener('click', e => {
    if (e.target === _jPage) closeJuradosPage();
  });

  _jPage.addEventListener('click', e => {
    const btn = e.target.closest('[data-jaction]');
    if (!btn) return;
    const action = btn.dataset.jaction;
    if (action === 'close-jurados-page') {
      closeJuradosPage();
    } else if (action === 'j-clear-filters') {
      _jSearch = ''; _jMunicipioId = null;
      const s = document.getElementById('j-search');
      const m = document.getElementById('j-municipio-sel');
      if (s) s.value = '';
      if (m) m.value = '';
      _loadJurados();
    } else if (action === 'j-export-pdf') {
      _exportJuradosPDF();
    }
  });

  _jPage.addEventListener('change', e => {
    if (e.target.id === 'j-municipio-sel') {
      _jMunicipioId = e.target.value ? Number(e.target.value) : null;
      _loadJurados();
    }
  });

  _jPage.addEventListener('input', e => {
    if (e.target.id === 'j-search') {
      clearTimeout(_jSearchTimer);
      _jSearchTimer = setTimeout(() => {
        _jSearch = e.target.value.trim();
        _loadJurados();
      }, 300);
    }
  });
}

function _getMunisFromJCache() {
  try {
    const raw = sessionStorage.getItem(_J_MUNIS_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > _J_MUNIS_TTL) { sessionStorage.removeItem(_J_MUNIS_KEY); return null; }
    return data;
  } catch { return null; }
}

async function _loadJuradosMunicipios() {
  try {
    const cached = _getMunisFromJCache();
    const munis  = cached || await window.api.get('/municipios');
    if (!cached) {
      try { sessionStorage.setItem(_J_MUNIS_KEY, JSON.stringify({ ts: Date.now(), data: munis })); } catch {}
    }
    const sel = document.getElementById('j-municipio-sel');
    munis.forEach(m => {
      _jMunicipiosMap[m.id] = m.name;
      if (sel) {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.name;
        sel.appendChild(opt);
      }
    });
  } catch (err) { console.error('_loadJuradosMunicipios failed:', err); }
}

function _exportJuradosPDF() {
  const now = new Date().toLocaleString('es-CO');
  const rows = _jData.map(j => `
    <tr>
      <td>${esc(j.nombre || '—')}</td>
      <td>${esc(j.cedula || '—')}</td>
      <td>${esc(j.telefono || '—')}</td>
      <td>${esc(j.correo || '—')}</td>
      <td>${esc(j.municipio || '—')}</td>
      <td>${j.puesto ? esc(j.puesto.name) : esc(j.puestoNombreCsv || 'Sin asignar')}</td>
      <td>${esc(j.estado || '—')}</td>
    </tr>
  `).join('');

  const win = window.open('', '_blank', 'width=1000,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Jurados</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11px}
      h1{font-size:15px;margin-bottom:4px}
      .sub{font-size:10px;color:#666;margin-bottom:14px}
      table{width:100%;border-collapse:collapse}
      th{background:#f0f0f0;padding:4px 7px;text-align:left;border:1px solid #ddd;font-size:9px;text-transform:uppercase}
      td{padding:4px 7px;border:1px solid #ddd}
      tr:nth-child(even) td{background:#f9f9f9}
      .note{font-size:9px;color:#888;margin-top:10px}
      @media print{body{padding:8px}}
    </style>
  </head><body>
    <h1>⚖️ Listado de Jurados de Votación — Defensores de la Patria 2026</h1>
    <div class="sub">Generado: ${now} | ${_jData.length} registros mostrados de ${_jTotal.toLocaleString('es-CO')}</div>
    <table>
      <thead><tr><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Correo</th><th>Municipio</th><th>Puesto</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">Vista de solo lectura · Los jurados no afectan cálculos de cobertura</p>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

window.openJuradosPage  = openJuradosPage;
window.closeJuradosPage = closeJuradosPage;

// Standalone jurados.html bootstrap
if (document.getElementById('j-page-content')) {
  window.showMustChangePasswordModal = function() { window.location.replace('/'); };

  window.doLogout = function() {
    if (window.api) window.api.post('/auth/logout', {}).catch(() => {});
    firebase.auth().signOut().then(() => {
      window.CURRENT_USER = null;
      window.location.replace('/');
    }).catch(() => window.location.replace('/'));
  };

  window.authReady.then((user) => {
    if (!user) window.location.replace('/');
  });

  window.startApp = function(me) {
    document.getElementById('auth-gate-overlay')?.remove();
    window.CURRENT_USER = me;
    const label = document.getElementById('user-label');
    if (label) label.textContent = me.displayName || me.username;

    const container = document.getElementById('j-page-content');
    if (!container) return;
    _jPage = container;
    container.innerHTML = _buildJuradosHTML();
    const closeBtn = container.querySelector('[data-jaction="close-jurados-page"]');
    if (closeBtn) {
      closeBtn.textContent = '← Dashboard';
      closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--t2);font-size:12px;font-weight:600';
    }
    window.closeJuradosPage = () => window.location.replace('/');
    _attachJuradosListeners();
    _loadJuradosMunicipios();
    _loadJurados();
    if (typeof initProfileWidget === 'function') initProfileWidget(me);
  };
}
