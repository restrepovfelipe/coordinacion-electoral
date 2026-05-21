// js/users-page.js
// Dedicated Users management page — SUPER_ADMIN only

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
  const roleOptions = _UP_ROLES.map(r => `<option value="${r}">${r}</option>`).join('');
  return `
    <div class="dir-box t-page-box" style="position:relative;max-width:1100px">
      <div class="dir-hd">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>👥 Gestión de Usuarios</h2>
          <span class="t-counter" id="up-counter">—</span>
        </div>
        <button class="dir-close" data-action="close-users-page">Cerrar ✕</button>
      </div>

      <div class="t-table-wrap" id="up-table-wrap">
        <p style="color:var(--t3);font-size:12px;padding:20px 0">Cargando...</p>
      </div>

      <div class="t-pagination" id="up-pagination"></div>

      <hr style="border:none;border-top:1px solid var(--b1);margin:18px 0">

      <div class="up-create-section">
        <h4>Crear nuevo usuario</h4>
        <div class="up-create-grid">
          <input id="up-new-username" placeholder="nombre.apellido" type="text">
          <input id="up-new-displayname" placeholder="Nombre completo" type="text">
          <input id="up-new-phone" placeholder="Teléfono (opcional)" type="text">
          <input id="up-new-password" placeholder="Contraseña inicial (mín. 8 chars)" type="password">
          <select id="up-new-role">
            ${roleOptions}
          </select>
        </div>
        <div id="up-create-err" class="t-err"></div>
        <button class="t-btn-primary" data-action="up-create-user">Crear usuario</button>
      </div>
    </div>
  `;
}

// ── Load & Render ──────────────────────────────────────────────────────────
async function _loadUsersPage(page) {
  const wrap = document.getElementById('up-table-wrap');
  if (wrap) wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 0">Cargando...</p>';

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
    if (wrap) wrap.innerHTML = `<p style="color:var(--red);font-size:12px;padding:20px 0">${esc(errorToSpanish(err))}</p>`;
  }
}

function _renderUsersTable() {
  const wrap = document.getElementById('up-table-wrap');
  if (!wrap) return;

  if (!_upData.length) {
    wrap.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:20px 0">No se encontraron usuarios.</p>';
    return;
  }

  const rows = _upData.map(u => {
    const activeBadge = u.active
      ? '<span class="up-active">Activo</span>'
      : '<span class="up-inactive">Inactivo</span>';
    const roleBadge = `<span class="up-role">${esc(u.role)}</span>`;

    const deactivateBtn = u.active
      ? `<button class="t-btn-cancel" data-action="deactivate-user" data-id="${u.id}" style="font-size:11px;padding:3px 10px;color:var(--orange)">Desactivar</button>`
      : `<button class="t-btn-cancel" data-action="activate-user" data-id="${u.id}" style="font-size:11px;padding:3px 10px;color:var(--green)">Activar</button>`;

    const deleteBtn = !u.active
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
    <button class="t-btn-cancel" data-action="up-prev" ${_upPage <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span>Página ${_upPage} de ${totalPages}</span>
    <button class="t-btn-cancel" data-action="up-next" ${_upPage >= totalPages ? 'disabled' : ''}>Siguiente ›</button>
  `;
}

// ── Edit modal ─────────────────────────────────────────────────────────────
async function _openEditModal(userId) {
  // Remove any existing edit overlay
  const existing = _usersPage.querySelector('.t-edit-overlay');
  if (existing) existing.remove();

  // Fetch fresh user data
  let user;
  try {
    user = await window.api.get(`/users/${userId}`);
  } catch (err) {
    alert(errorToSpanish(err));
    return;
  }

  const roleOptions = _UP_ROLES.map(r =>
    `<option value="${r}" ${user.role === r ? 'selected' : ''}>${r}</option>`
  ).join('');

  const scopeTags = (user.scopes || []).map(s =>
    `<span class="up-scope-tag">${esc(s.scopeType)}:${esc(String(s.scopeId))} <button data-action="remove-scope" data-scope-id="${s.id}" title="Eliminar scope">×</button></span>`
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

      <label style="font-size:11px;color:var(--t3);margin-bottom:3px;display:block">Nueva contraseña (dejar en blanco para no cambiar, mín. 8 chars)</label>
      <input type="password" id="up-ed-password" placeholder="Nueva contraseña...">

      <label style="font-size:11px;color:var(--t3);margin-bottom:6px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="up-ed-mustchange" ${user.mustChangePassword ? 'checked' : ''}>
        Forzar cambio de contraseña en próximo login
      </label>

      <hr style="border:none;border-top:1px solid var(--b1);margin:10px 0">
      <p style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:8px">Gestionar scopes</p>

      <div class="up-scope-list" id="up-ed-scope-list">${scopeTags || '<span style="color:var(--t3);font-size:11px">Sin scopes asignados</span>'}</div>

      <div class="up-scope-add">
        <select id="up-scope-type">
          <option value="SUBREGION">SUBREGION</option>
          <option value="MUNICIPIO">MUNICIPIO</option>
          <option value="ZONA">ZONA</option>
          <option value="COMUNA">COMUNA</option>
          <option value="PUESTO">PUESTO</option>
        </select>
        <input type="number" id="up-scope-id" min="1" placeholder="ID scope" style="width:90px">
        <button class="t-btn-cancel" data-action="add-scope">Agregar</button>
      </div>

      <div class="t-err" id="up-ed-err"></div>
      <div class="t-edit-btns" style="margin-top:14px">
        <button class="t-btn-cancel" data-action="close-edit-modal">Cancelar</button>
        <button class="t-btn-primary" data-action="save-edit-user">Guardar</button>
      </div>
    </div>
  `;
  _usersPage.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  // Delegated events inside overlay
  overlay.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close-edit-modal') {
      overlay.remove();

    } else if (action === 'remove-scope') {
      const scopeId = Number(btn.dataset.scopeId);
      btn.disabled = true;
      try {
        await window.api.delete(`/users/${userId}/scopes/${scopeId}`);
        // Remove the tag from DOM
        const tag = btn.closest('.up-scope-tag');
        if (tag) tag.remove();
        const list = document.getElementById('up-ed-scope-list');
        if (list && !list.querySelector('.up-scope-tag')) {
          list.innerHTML = '<span style="color:var(--t3);font-size:11px">Sin scopes asignados</span>';
        }
      } catch (err) {
        const errEl = document.getElementById('up-ed-err');
        if (errEl) errEl.textContent = errorToSpanish(err);
        btn.disabled = false;
      }

    } else if (action === 'add-scope') {
      const scopeType = document.getElementById('up-scope-type').value;
      const scopeIdVal = Number(document.getElementById('up-scope-id').value);
      const errEl = document.getElementById('up-ed-err');
      if (!scopeIdVal || scopeIdVal < 1) {
        if (errEl) errEl.textContent = 'ID de scope inválido.';
        return;
      }
      btn.disabled = true;
      if (errEl) errEl.textContent = '';
      try {
        const newScope = await window.api.post(`/users/${userId}/scopes`, { scopeType, scopeId: scopeIdVal });
        // Add new tag to list
        const list = document.getElementById('up-ed-scope-list');
        if (list) {
          const placeholder = list.querySelector('span:not(.up-scope-tag)');
          if (placeholder) placeholder.remove();
          const tag = document.createElement('span');
          tag.className = 'up-scope-tag';
          tag.innerHTML = `${esc(newScope.scopeType)}:${esc(String(newScope.scopeId))} <button data-action="remove-scope" data-scope-id="${newScope.id}" title="Eliminar scope">×</button>`;
          list.appendChild(tag);
        }
        document.getElementById('up-scope-id').value = '';
      } catch (err) {
        if (errEl) errEl.textContent = errorToSpanish(err);
      }
      btn.disabled = false;

    } else if (action === 'save-edit-user') {
      const saveBtn = btn;
      const errEl = document.getElementById('up-ed-err');
      const displayName = document.getElementById('up-ed-displayname').value.trim();
      const phone = document.getElementById('up-ed-phone').value.trim();
      const role = document.getElementById('up-ed-role').value;
      const newPassword = document.getElementById('up-ed-password').value;
      const mustChangePassword = document.getElementById('up-ed-mustchange').checked;

      if (!displayName) {
        if (errEl) errEl.textContent = 'El nombre es requerido.';
        return;
      }
      if (newPassword && newPassword.length < 8) {
        if (errEl) errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        return;
      }

      const body = { displayName, role, mustChangePassword };
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

// ── Create user ────────────────────────────────────────────────────────────
async function _handleCreateUser() {
  const username = document.getElementById('up-new-username')?.value?.trim();
  const displayName = document.getElementById('up-new-displayname')?.value?.trim();
  const phone = document.getElementById('up-new-phone')?.value?.trim();
  const password = document.getElementById('up-new-password')?.value;
  const role = document.getElementById('up-new-role')?.value;
  const errEl = document.getElementById('up-create-err');

  if (!username) {
    if (errEl) errEl.textContent = 'El nombre de usuario es requerido.';
    return;
  }
  if (!displayName) {
    if (errEl) errEl.textContent = 'El nombre completo es requerido.';
    return;
  }
  if (!password || password.length < 8) {
    if (errEl) errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
    return;
  }
  if (!role) {
    if (errEl) errEl.textContent = 'El rol es requerido.';
    return;
  }

  const createBtn = _usersPage.querySelector('[data-action="up-create-user"]');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creando...'; }
  if (errEl) errEl.textContent = '';

  try {
    const newUser = await window.api.post('/users', {
      username,
      displayName,
      phone: phone || undefined,
      role,
    });
    // Set admin-chosen password immediately after creation
    await window.api.patch(`/users/${newUser.id}`, { newPassword: password });

    // Clear form
    ['up-new-username', 'up-new-displayname', 'up-new-phone', 'up-new-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (errEl) errEl.textContent = '';

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
      _openEditModal(Number(btn.dataset.id));

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
}

// ── Expose globally ────────────────────────────────────────────────────────
window.openUsersPage = openUsersPage;
window.closeUsersPage = closeUsersPage;
