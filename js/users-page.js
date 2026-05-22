// js/users-page.js
// Dedicated Users management page — SUPER_ADMIN and REGIONAL_COORDINATOR

// ── State ──────────────────────────────────────────────────────────────────
let _usersPage = null;
let _upPage = 1;
const _UP_LIMIT = 20;
let _upTotal = 0;
let _upData = [];

const _UP_ROLES = [
  'SUPER_ADMIN',
  'REGIONAL_COORDINATOR',
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
];

function _roleClass(role) {
  const map = {
    SUPER_ADMIN: 'up-role-super-admin',
    REGIONAL_COORDINATOR: 'up-role-regional',
    MUNICIPAL_COORDINATOR: 'up-role-municipal',
    ZONE_COORDINATOR: 'up-role-zone',
    COMUNA_COORDINATOR: 'up-role-comuna',
    PUESTO_COORDINATOR: 'up-role-puesto',
  };
  return map[role] || 'up-role';
}

function _roleLabel(role) {
  const map = {
    SUPER_ADMIN: 'Super Admin',
    REGIONAL_COORDINATOR: 'Regional',
    MUNICIPAL_COORDINATOR: 'Municipal',
    ZONE_COORDINATOR: 'Zonal',
    COMUNA_COORDINATOR: 'Comunal',
    PUESTO_COORDINATOR: 'Puesto',
  };
  return map[role] || role;
}

// ── Open / Close ───────────────────────────────────────────────────────────
function openUsersPage() {
  if (!window.CURRENT_USER || window.CURRENT_USER.role !== 'SUPER_ADMIN') return;

  if (!_usersPage) {
    _usersPage = document.createElement('div');
    _usersPage.className = 'dir-modal';
    _usersPage.id = 'users-page-panel';
    _usersPage.innerHTML = _buildUsersPageHTML();
    document.body.appendChild(_usersPage);
    _attachUsersListeners();
  }
  _usersPage.style.display = 'flex';
  _loadUsersPage(1);
}

function closeUsersPage() {
  if (_usersPage) _usersPage.style.display = 'none';
}

// ── Build HTML ─────────────────────────────────────────────────────────────
function _buildUsersPageHTML() {
  const isRegional = window.CURRENT_USER?.role === 'REGIONAL_COORDINATOR';
  const assignableRoles = isRegional
    ? _UP_ROLES.filter(r => r !== 'SUPER_ADMIN')
    : _UP_ROLES;
  const roleOptions = assignableRoles.map(r =>
    `<option value="${r}">${_roleLabel(r)}</option>`
  ).join('');
  return `
    <div class="dir-box t-page-box" style="position:relative;max-width:1100px">
      <div class="dir-hd" style="position:sticky;top:0;background:var(--card);z-index:2;padding-bottom:14px;border-bottom:1px solid var(--b1);margin-bottom:0">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>👥 Gestión de Usuarios</h2>
          <span class="t-counter" id="up-counter">—</span>
        </div>
        <button class="dir-close" data-action="close-users-page">Cerrar ✕</button>
      </div>

      <div style="padding:16px 0">
        <div class="up-card" style="padding:0;overflow:hidden">
          <div class="t-table-wrap" id="up-table-wrap">
            <p style="color:var(--t3);font-size:12px;padding:20px 24px">Cargando...</p>
          </div>
        </div>
        <div class="t-pagination" id="up-pagination" style="justify-content:center;gap:8px;margin-top:12px"></div>
      </div>

      <div class="up-create-section">
        <div class="up-card">
          <h4>Crear nuevo usuario</h4>
          <div class="up-create-form">
            <div class="up-form-field">
              <label for="up-new-username">Usuario</label>
              <input id="up-new-username" placeholder="nombre.apellido" type="text" autocomplete="off">
            </div>
            <div class="up-form-field">
              <label for="up-new-displayname">Nombre completo</label>
              <input id="up-new-displayname" placeholder="Nombre completo" type="text">
            </div>
            <div class="up-form-field">
              <label for="up-new-phone">Teléfono <span style="color:var(--t3);font-weight:400">(opcional)</span></label>
              <input id="up-new-phone" placeholder="300 000 0000" type="text">
            </div>
            <div class="up-form-field">
              <label for="up-new-password">Contraseña inicial</label>
              <input id="up-new-password" placeholder="Mínimo 8 caracteres" type="password">
            </div>
            <div class="up-form-field">
              <label for="up-new-role">Rol</label>
              <select id="up-new-role" data-action="up-role-changed">
                ${roleOptions}
              </select>
            </div>
            <div id="up-cascade-wrap" style="display:none">
              <div id="up-cascade-row1" style="display:none">
                <div class="up-form-field">
                  <label>Municipio</label>
                  <select id="up-cascade-municipio" data-action="up-municipio-changed">
                    <option value="">— Municipio —</option>
                  </select>
                </div>
              </div>
              <div id="up-cascade-row2" style="display:none">
                <div class="up-form-field">
                  <label id="up-cascade-child-label">Ámbito</label>
                  <select id="up-cascade-child">
                    <option value="">— Seleccionar —</option>
                  </select>
                </div>
              </div>
            </div>
            <div id="up-create-err" class="t-err"></div>
            <button class="t-btn-primary" data-action="up-create-user" style="margin-top:4px">Crear usuario</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Load & Render ──────────────────────────────────────────────────────────
async function _loadUsersPage(page) {
  const wrap = document.getElementById('up-table-wrap');
  if (wrap) wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 24px">Cargando...</p>';

  try {
    const result = await window.api.get(`/users?page=${page}&limit=${_UP_LIMIT}`);
    _upData = result.data || [];
    _upTotal = result.total || 0;
    _upPage = result.page || page;
    _renderUsersTable();
    _renderUsersPagination();
    const badge = document.getElementById('up-counter');
    if (badge) badge.textContent = `${_upTotal} usuarios`;
  } catch (err) {
    console.error('_loadUsersPage failed:', err);
    if (wrap) wrap.innerHTML = `<p style="color:var(--red);font-size:12px;padding:20px 24px">${esc(errorToSpanish(err))}</p>`;
  }
}

function _renderUsersTable() {
  const wrap = document.getElementById('up-table-wrap');
  if (!wrap) return;

  if (!_upData.length) {
    wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 24px">No se encontraron usuarios.</p>';
    return;
  }

  const rows = _upData.map(u => {
    const activeBadge = u.active
      ? '<span class="up-active">Activo</span>'
      : '<span class="up-inactive">Inactivo</span>';
    const roleBadge = `<span class="${_roleClass(u.role)}">${_roleLabel(u.role)}</span>`;

    const deactivateBtn = u.active
      ? `<button class="t-btn-cancel" data-action="deactivate-user" data-id="${u.id}" style="font-size:11px;padding:3px 10px;color:var(--orange)">Desactivar</button>`
      : `<button class="t-btn-cancel" data-action="activate-user" data-id="${u.id}" style="font-size:11px;padding:3px 10px;color:var(--green)">Activar</button>`;

    const canDelete = !u.active && window.CURRENT_USER?.role === 'SUPER_ADMIN';
    const deleteBtn = canDelete
      ? `<button class="t-btn-cancel" data-action="delete-user" data-id="${u.id}" data-username="${esc(u.username)}" style="font-size:11px;padding:3px 10px;color:var(--red)">Eliminar</button>`
      : '';

    return `<tr>
      <td style="color:var(--t3)">${u.id}</td>
      <td style="font-weight:500">${esc(u.username || '—')}</td>
      <td>${esc(u.displayName || '—')}</td>
      <td>${roleBadge}</td>
      <td>${activeBadge}</td>
      <td style="white-space:nowrap;display:flex;gap:5px;flex-wrap:wrap">
        <button class="tbtn" data-action="edit-user" data-id="${u.id}" style="font-size:11px;padding:3px 10px">Editar</button>
        ${deactivateBtn}
        ${deleteBtn}
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="up-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Usuario</th>
          <th>Nombre</th>
          <th>Rol</th>
          <th>Activo</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function _renderUsersPagination() {
  const el = document.getElementById('up-pagination');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(_upTotal / _UP_LIMIT));
  el.innerHTML = `
    <button class="up-page-btn" data-action="up-prev" ${_upPage <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="up-page-info">Página ${_upPage} de ${totalPages}</span>
    <button class="up-page-btn" data-action="up-next" ${_upPage >= totalPages ? 'disabled' : ''}>Siguiente ›</button>
  `;
}

// ── Edit modal cascade state ────────────────────────────────────────────────
let _edCascadeState = { scopeType: null, needsMunicipio: false };

async function _onEdRoleChanged(role, overlay) {
  const wrap = overlay.querySelector('#ed-cascade-wrap');
  const row1 = overlay.querySelector('#ed-cascade-row1');
  const row2 = overlay.querySelector('#ed-cascade-row2');
  const muniSel = overlay.querySelector('#ed-cascade-municipio');
  const childSel = overlay.querySelector('#ed-cascade-child');
  const notice = overlay.querySelector('#ed-role-notice');
  _edCascadeState = { scopeType: null, needsMunicipio: false };

  if (notice) {
    notice.textContent = 'Cambiar el rol limpiará el alcance actual. Selecciona un nuevo ámbito.';
    notice.style.display = 'block';
  }

  if (!role || !wrap) return;

  try {
    const res = await window.api.get(`/admin/cascade-options?role=${encodeURIComponent(role)}`);
    _edCascadeState.scopeType = res.scopeType;
    _edCascadeState.needsMunicipio = res.needsMunicipio;

    if (!res.scopeType) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'block';

    if (res.needsMunicipio) {
      muniSel.innerHTML = '<option value="">— Municipio —</option>' +
        res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      row1.style.display = 'block';
      row2.style.display = 'none';
      childSel.innerHTML = '<option value="">— Seleccionar —</option>';
    } else {
      row1.style.display = 'none';
      childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
        res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      row2.style.display = 'block';
    }
  } catch (_) {
    if (wrap) wrap.style.display = 'none';
  }
}

async function _onEdMunicipioChanged(municipioId, role, overlay) {
  const row2 = overlay.querySelector('#ed-cascade-row2');
  const childSel = overlay.querySelector('#ed-cascade-child');

  if (!municipioId || !_edCascadeState.scopeType) {
    if (row2) row2.style.display = 'none';
    return;
  }

  try {
    const res = await window.api.get(
      `/admin/cascade-options?role=${encodeURIComponent(role)}&municipioId=${municipioId}`
    );
    childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
      res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    if (row2) row2.style.display = 'block';
  } catch (_) {
    if (row2) row2.style.display = 'none';
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────
async function _openEditModal(userId) {
  const existing = _usersPage.querySelector('.t-edit-overlay');
  if (existing) existing.remove();

  let user;
  try {
    user = await window.api.get(`/users/${userId}`);
  } catch (err) {
    alert(errorToSpanish(err));
    return;
  }

  const isSuperAdmin = window.CURRENT_USER?.role === 'SUPER_ADMIN';
  const assignableRoles = isSuperAdmin
    ? _UP_ROLES
    : _UP_ROLES.filter(r => r !== 'SUPER_ADMIN');
  const roleOptions = assignableRoles.map(r =>
    `<option value="${r}" ${user.role === r ? 'selected' : ''}>${_roleLabel(r)}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 't-edit-overlay';
  overlay.innerHTML = `
    <div class="t-edit-box" style="max-width:520px;width:95%">
      <h4>Editar usuario #${user.id} — ${esc(user.username)}</h4>

      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Nombre completo</label>
      <input type="text" id="up-ed-displayname" value="${esc(user.displayName || '')}" placeholder="Nombre completo">

      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Teléfono</label>
      <input type="text" id="up-ed-phone" value="${esc(user.phone || '')}" placeholder="300 000 0000">

      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Rol</label>
      <select id="up-ed-role">${roleOptions}</select>

      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Nueva contraseña</label>
      <input type="password" id="up-ed-password" placeholder="Dejar en blanco para no cambiar">

      <label style="font-size:11px;color:var(--t3);margin-bottom:6px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="up-ed-mustchange" ${user.mustChangePassword ? 'checked' : ''}>
        Forzar cambio de contraseña en próximo login
      </label>

      <hr style="border:none;border-top:1px solid var(--b1);margin:10px 0">

      <div id="ed-role-notice" class="up-role-notice" style="display:none"></div>

      <div id="ed-cascade-wrap" style="display:none">
        <div id="ed-cascade-row1" style="display:none">
          <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Municipio</label>
          <select id="ed-cascade-municipio">
            <option value="">— Municipio —</option>
          </select>
        </div>
        <div id="ed-cascade-row2" style="display:none">
          <label id="ed-cascade-child-label" style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Ámbito</label>
          <select id="ed-cascade-child">
            <option value="">— Seleccionar —</option>
          </select>
        </div>
      </div>

      <div class="t-err" id="up-ed-err"></div>
      <div class="t-edit-btns" style="margin-top:14px">
        <button class="t-btn-cancel" data-action="close-edit-modal">Cancelar</button>
        <button class="t-btn-primary" data-action="save-edit-user">Guardar</button>
      </div>
    </div>
  `;
  _usersPage.appendChild(overlay);

  // Pre-fill cascade based on user's current role and scope
  _edCascadeState = { scopeType: null, needsMunicipio: false };
  const userScope = (user.scopes || [])[0] || null;
  const scopeId = userScope?.scopeId || null;

  if (user.role) {
    try {
      const url = scopeId
        ? `/admin/cascade-options?role=${encodeURIComponent(user.role)}&scopeId=${scopeId}`
        : `/admin/cascade-options?role=${encodeURIComponent(user.role)}`;
      const res = await window.api.get(url);
      _edCascadeState.scopeType = res.scopeType;
      _edCascadeState.needsMunicipio = res.needsMunicipio;

      const wrap = overlay.querySelector('#ed-cascade-wrap');
      const row1 = overlay.querySelector('#ed-cascade-row1');
      const row2 = overlay.querySelector('#ed-cascade-row2');
      const muniSel = overlay.querySelector('#ed-cascade-municipio');
      const childSel = overlay.querySelector('#ed-cascade-child');

      if (res.scopeType) {
        wrap.style.display = 'block';
        if (res.needsMunicipio) {
          muniSel.innerHTML = '<option value="">— Municipio —</option>' +
            res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
          row1.style.display = 'block';

          if (res.preselect?.municipioId) {
            muniSel.value = String(res.preselect.municipioId);
            // Load children for the preselected municipio
            const res2 = await window.api.get(
              `/admin/cascade-options?role=${encodeURIComponent(user.role)}&municipioId=${res.preselect.municipioId}`
            );
            childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
              res2.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
            row2.style.display = 'block';
            if (res.preselect?.childId) {
              childSel.value = String(res.preselect.childId);
            }
          }
        } else {
          row1.style.display = 'none';
          childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
            res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
          row2.style.display = 'block';
          if (res.preselect?.childId) {
            childSel.value = String(res.preselect.childId);
          }
        }
      }
    } catch (_) {}
  }

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  // Cascade change handlers inside the overlay
  overlay.addEventListener('change', async e => {
    if (e.target.id === 'up-ed-role') {
      await _onEdRoleChanged(e.target.value, overlay);
    } else if (e.target.id === 'ed-cascade-municipio') {
      const role = overlay.querySelector('#up-ed-role').value;
      await _onEdMunicipioChanged(e.target.value, role, overlay);
    }
  });

  overlay.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close-edit-modal') {
      overlay.remove();

    } else if (action === 'save-edit-user') {
      const saveBtn = btn;
      const errEl = overlay.querySelector('#up-ed-err');
      const displayName = overlay.querySelector('#up-ed-displayname').value.trim();
      const phone = overlay.querySelector('#up-ed-phone').value.trim();
      const role = overlay.querySelector('#up-ed-role').value;
      const newPassword = overlay.querySelector('#up-ed-password').value;
      const mustChangePassword = overlay.querySelector('#up-ed-mustchange').checked;

      if (!displayName) {
        if (errEl) errEl.textContent = 'El nombre es requerido.';
        return;
      }
      if (newPassword && newPassword.length < 8) {
        if (errEl) errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        return;
      }

      // Collect scope from cascade
      let scope;
      if (_edCascadeState.scopeType === null) {
        scope = null; // SUPER/REGIONAL: clear all scopes
      } else {
        const childSel = overlay.querySelector('#ed-cascade-child');
        const childId = childSel ? Number(childSel.value) : 0;
        if (!childId) {
          if (errEl) errEl.textContent = 'Selecciona el ámbito geográfico.';
          return;
        }
        scope = { type: _edCascadeState.scopeType, id: childId };
      }

      const body = { displayName, role, mustChangePassword, scope };
      if (phone) body.phone = phone;
      if (newPassword) body.newPassword = newPassword;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      if (errEl) errEl.textContent = '';

      try {
        await window.api.patch(`/users/${userId}`, body);
        overlay.remove();
        await _loadUsersPage(_upPage);
      } catch (err) {
        if (errEl) errEl.textContent = errorToSpanish(err);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
      }
    }
  });
}

// ── Hard delete confirmation ───────────────────────────────────────────────
function _confirmDelete(userId, username) {
  const existing = _usersPage.querySelector('.t-picker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 't-picker-overlay';
  overlay.innerHTML = `
    <div class="t-picker-box">
      <h4>⚠ Eliminar usuario permanentemente</h4>
      <p style="font-size:12px;color:var(--t2);margin-bottom:12px">Esta acción es irreversible. Escribe el nombre de usuario para confirmar:</p>
      <input type="text" id="up-del-confirm" placeholder="${esc(username)}" autocomplete="off">
      <div class="t-err" id="up-del-err"></div>
      <div class="t-picker-btns">
        <button class="t-btn-cancel" id="up-del-cancel">Cancelar</button>
        <button class="t-btn-cancel" id="up-del-confirm-btn" disabled style="color:var(--red);border-color:var(--red)">Eliminar permanentemente</button>
      </div>
    </div>
  `;
  _usersPage.appendChild(overlay);

  const input = overlay.querySelector('#up-del-confirm');
  const confirmBtn = overlay.querySelector('#up-del-confirm-btn');
  const errEl = overlay.querySelector('#up-del-err');

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value !== username;
  });

  overlay.querySelector('#up-del-cancel').addEventListener('click', () => overlay.remove());

  confirmBtn.addEventListener('click', async () => {
    if (input.value !== username) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Eliminando...';
    errEl.textContent = '';
    try {
      await window.api.delete(`/users/${userId}`);
      overlay.remove();
      await _loadUsersPage(_upPage > 1 && _upData.length === 1 ? _upPage - 1 : _upPage);
    } catch (err) {
      errEl.textContent = errorToSpanish(err);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Eliminar permanentemente';
    }
  });
}

// ── Create cascade state & helpers ─────────────────────────────────────────
let _cascadeState = { scopeType: null, needsMunicipio: false, municipioId: null };

async function _onRoleChanged(role) {
  const wrap = document.getElementById('up-cascade-wrap');
  const row1 = document.getElementById('up-cascade-row1');
  const row2 = document.getElementById('up-cascade-row2');
  const muniSel = document.getElementById('up-cascade-municipio');
  const childSel = document.getElementById('up-cascade-child');
  const childLabel = document.getElementById('up-cascade-child-label');
  _cascadeState = { scopeType: null, needsMunicipio: false, municipioId: null };

  if (!role || !wrap) return;

  try {
    const res = await window.api.get(`/admin/cascade-options?role=${encodeURIComponent(role)}`);
    _cascadeState.scopeType = res.scopeType;
    _cascadeState.needsMunicipio = res.needsMunicipio;

    if (!res.scopeType) {
      wrap.style.display = 'none';
      row1.style.display = 'none';
      row2.style.display = 'none';
      return;
    }

    if (childLabel) {
      const labelMap = { MUNICIPIO: 'Municipio', ZONA: 'Zona', COMUNA: 'Comuna', PUESTO: 'Puesto de votación' };
      childLabel.textContent = labelMap[res.scopeType] || 'Ámbito';
    }

    wrap.style.display = 'block';

    if (res.needsMunicipio) {
      muniSel.innerHTML = '<option value="">— Municipio —</option>' +
        res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      row1.style.display = 'block';
      row2.style.display = 'none';
      childSel.innerHTML = '<option value="">— Seleccionar —</option>';
    } else {
      row1.style.display = 'none';
      childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
        res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      row2.style.display = 'block';
    }
  } catch (_) {
    if (wrap) wrap.style.display = 'none';
  }
}

async function _onMunicipioChanged(municipioId) {
  _cascadeState.municipioId = municipioId ? Number(municipioId) : null;
  const row2 = document.getElementById('up-cascade-row2');
  const childSel = document.getElementById('up-cascade-child');
  const role = document.getElementById('up-new-role')?.value;

  if (!municipioId || !_cascadeState.scopeType) {
    if (row2) row2.style.display = 'none';
    return;
  }

  try {
    const res = await window.api.get(
      `/admin/cascade-options?role=${encodeURIComponent(role)}&municipioId=${municipioId}`
    );
    childSel.innerHTML = '<option value="">— Seleccionar —</option>' +
      res.items.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    if (row2) row2.style.display = 'block';
  } catch (_) {
    if (row2) row2.style.display = 'none';
  }
}

// ── Create user ────────────────────────────────────────────────────────────
async function _handleCreateUser() {
  const username = document.getElementById('up-new-username')?.value?.trim();
  const displayName = document.getElementById('up-new-displayname')?.value?.trim();
  const phone = document.getElementById('up-new-phone')?.value?.trim();
  const password = document.getElementById('up-new-password')?.value;
  const role = document.getElementById('up-new-role')?.value;
  const errEl = document.getElementById('up-create-err');

  if (!username) { if (errEl) errEl.textContent = 'El nombre de usuario es requerido.'; return; }
  if (!displayName) { if (errEl) errEl.textContent = 'El nombre completo es requerido.'; return; }
  if (!password || password.length < 8) { if (errEl) errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
  if (!role) { if (errEl) errEl.textContent = 'El rol es requerido.'; return; }

  // Validate scope selection if needed
  let scopeId = null;
  if (_cascadeState.scopeType) {
    const childSel = document.getElementById('up-cascade-child');
    const muniSel = document.getElementById('up-cascade-municipio');
    if (_cascadeState.needsMunicipio) {
      if (!_cascadeState.municipioId) {
        if (errEl) errEl.textContent = 'Selecciona un municipio primero.';
        return;
      }
      scopeId = childSel ? Number(childSel.value) : null;
      if (!scopeId) { if (errEl) errEl.textContent = `Selecciona el ${_cascadeState.scopeType.toLowerCase()}.`; return; }
    } else {
      scopeId = childSel ? Number(childSel.value) : null;
      if (!scopeId) { if (errEl) errEl.textContent = 'Selecciona el ámbito geográfico.'; return; }
    }
  }

  const createBtn = _usersPage.querySelector('[data-action="up-create-user"]');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creando...'; }
  if (errEl) errEl.textContent = '';

  try {
    const newUser = await window.api.post('/users', { username, displayName, phone: phone || undefined, role });
    await window.api.patch(`/users/${newUser.id}`, { newPassword: password });
    if (_cascadeState.scopeType && scopeId) {
      await window.api.post(`/users/${newUser.id}/scopes`, {
        scopeType: _cascadeState.scopeType,
        scopeId,
      });
    }
    ['up-new-username', 'up-new-displayname', 'up-new-phone', 'up-new-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (errEl) errEl.textContent = '';
    _cascadeState = { scopeType: null, needsMunicipio: false, municipioId: null };
    const wrap = document.getElementById('up-cascade-wrap');
    if (wrap) wrap.style.display = 'none';
    await _loadUsersPage(1);
  } catch (err) {
    if (errEl) errEl.textContent = errorToSpanish(err);
  } finally {
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Crear usuario'; }
  }
}

// ── Event listeners ────────────────────────────────────────────────────────
function _attachUsersListeners() {
  if (!_usersPage) return;

  // Close on backdrop click
  _usersPage.addEventListener('click', e => {
    if (e.target === _usersPage) closeUsersPage();
  });

  // Delegated clicks
  _usersPage.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close-users-page') {
      closeUsersPage();

    } else if (action === 'up-prev') {
      if (_upPage > 1) _loadUsersPage(_upPage - 1);

    } else if (action === 'up-next') {
      const totalPages = Math.ceil(_upTotal / _UP_LIMIT);
      if (_upPage < totalPages) _loadUsersPage(_upPage + 1);

    } else if (action === 'edit-user') {
      const userId = parseInt(btn.dataset.id, 10);
      if (!userId || userId < 1) {
        console.error('[users-page] edit-user: id inválido', btn.dataset.id, btn.outerHTML);
        return;
      }
      _openEditModal(userId);

    } else if (action === 'deactivate-user') {
      const userId = Number(btn.dataset.id);
      if (!confirm('¿Desactivar este usuario?')) return;
      btn.disabled = true;
      try {
        await window.api.patch(`/users/${userId}`, { active: false });
        await _loadUsersPage(_upPage);
      } catch (err) {
        alert(errorToSpanish(err));
        btn.disabled = false;
      }

    } else if (action === 'activate-user') {
      const userId = Number(btn.dataset.id);
      btn.disabled = true;
      try {
        await window.api.patch(`/users/${userId}`, { active: true });
        await _loadUsersPage(_upPage);
      } catch (err) {
        alert(errorToSpanish(err));
        btn.disabled = false;
      }

    } else if (action === 'delete-user') {
      _confirmDelete(Number(btn.dataset.id), btn.dataset.username);

    } else if (action === 'up-create-user') {
      await _handleCreateUser();
    }
  });

  // Role change → cascade (create form only; edit modal has its own listener)
  _usersPage.addEventListener('change', async e => {
    const target = e.target;
    if (target.dataset.action === 'up-role-changed') {
      await _onRoleChanged(target.value);
    } else if (target.dataset.action === 'up-municipio-changed') {
      await _onMunicipioChanged(target.value);
    }
  });
}

// ── Expose globally ────────────────────────────────────────────────────────
window.openUsersPage = openUsersPage;
window.closeUsersPage = closeUsersPage;

// ── Standalone page bootstrap (usuarios.html) ─────────────────────────────
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

  const _uAuthTimeout = setTimeout(() => {
    if (!window.CURRENT_USER) window.location.replace('/');
  }, 4000);

  window.startApp = function(me) {
    clearTimeout(_uAuthTimeout);
    if (me.role !== 'SUPER_ADMIN' && me.role !== 'REGIONAL_COORDINATOR') {
      window.location.replace('/');
      return;
    }
    window.CURRENT_USER = me;
    const label = document.getElementById('user-label');
    if (label) label.textContent = me.displayName || me.username;

    const container = document.getElementById('page-content');
    if (!container) return;
    _usersPage = container;
    container.innerHTML = _buildUsersPageHTML();
    const closeBtn = container.querySelector('[data-action="close-users-page"]');
    if (closeBtn) { closeBtn.textContent = '← Dashboard'; closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--t2);font-size:12px;font-weight:600'; }
    window.closeUsersPage = () => window.location.replace('/');
    _attachUsersListeners();
    _loadUsersPage(1);
    if (typeof initProfileWidget === 'function') initProfileWidget(me);
  };
}
