// js/users-admin.js
// User management panel — SUPER_ADMIN only

const ROLES = [
  'SUPER_ADMIN',
  'REGIONAL_COORDINATOR',
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
];

let _usersPanel = null;
let _currentPage = 1;
const _PAGE_SIZE = 20;

async function openUsersAdmin() {
  // Only accessible to SUPER_ADMIN
  if (!window.CURRENT_USER || CURRENT_USER.role !== 'SUPER_ADMIN') return;

  // Create or show panel
  if (!_usersPanel) {
    _usersPanel = document.createElement('div');
    _usersPanel.id = 'users-admin-panel';
    _usersPanel.className = 'modal-overlay'; // use existing modal styles
    _usersPanel.innerHTML = buildUsersPanelHTML();
    document.body.appendChild(_usersPanel);
    attachUsersAdminListeners();
  }
  _usersPanel.classList.remove('hidden');
  await loadUsersPage(1);
}

function closeUsersAdmin() {
  _usersPanel?.classList.add('hidden');
}

function buildUsersPanelHTML() {
  return `
    <div class="modal-box" style="max-width:800px">
      <div class="modal-header">
        <h3>Gestión de Usuarios</h3>
        <button data-action="close-users-admin" class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <div id="users-list-container">
          <div id="users-table"></div>
          <div id="users-pagination"></div>
        </div>
        <hr>
        <h4>Crear usuario</h4>
        <div id="create-user-form">
          <input id="new-username" placeholder="Usuario (nombre.apellido)" type="text">
          <input id="new-displayname" placeholder="Nombre completo" type="text">
          <input id="new-phone" placeholder="Teléfono (opcional)" type="text">
          <select id="new-role">
            ${ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <button data-action="create-user">Crear usuario</button>
          <div id="create-user-error" class="error-msg"></div>
        </div>
      </div>
    </div>
  `;
}

async function loadUsersPage(page) {
  _currentPage = page;
  const container = document.getElementById('users-table');
  if (!container) return;

  try {
    container.textContent = 'Cargando...';
    const result = await api.get(`/users?page=${page}&limit=${_PAGE_SIZE}`);
    container.innerHTML = buildUsersTable(result.data);
    renderPagination(result.total, page);
  } catch (err) {
    container.textContent = `Error cargando usuarios (${err.status})`;
  }
}

function buildUsersTable(users) {
  if (!users.length) return '<p>Sin usuarios.</p>';
  return `
    <table class="users-table">
      <thead>
        <tr>
          <th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escHtml(u.username)}</td>
            <td>${escHtml(u.displayName)}</td>
            <td>${escHtml(u.role)}</td>
            <td>${u.active ? '✓' : '✗'}</td>
            <td>
              <button data-action="deactivate-user" data-user-id="${u.id}" data-username="${escHtml(u.username)}" ${!u.active ? 'disabled' : ''}>Desactivar</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPagination(total, page) {
  const totalPages = Math.ceil(total / _PAGE_SIZE);
  const el = document.getElementById('users-pagination');
  if (!el) return;
  el.innerHTML = `
    <button data-action="users-prev-page" ${page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span>Página ${page} de ${totalPages}</span>
    <button data-action="users-next-page" data-total-pages="${totalPages}" ${page >= totalPages ? 'disabled' : ''}>Siguiente ›</button>
  `;
}

function attachUsersAdminListeners() {
  _usersPanel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close-users-admin') {
      closeUsersAdmin();
    } else if (action === 'create-user') {
      await handleCreateUser();
    } else if (action === 'deactivate-user') {
      const userId = Number(btn.dataset.userId);
      const username = btn.dataset.username;
      if (confirm(`¿Desactivar usuario "${username}"?`)) {
        try {
          await api.delete(`/users/${userId}`);
          await loadUsersPage(_currentPage);
        } catch (err) {
          alert(`Error desactivando usuario: ${err.status}`);
        }
      }
    } else if (action === 'users-prev-page') {
      await loadUsersPage(_currentPage - 1);
    } else if (action === 'users-next-page') {
      await loadUsersPage(_currentPage + 1);
    }
  });
}

async function handleCreateUser() {
  const username = document.getElementById('new-username')?.value?.trim();
  const displayName = document.getElementById('new-displayname')?.value?.trim();
  const phone = document.getElementById('new-phone')?.value?.trim() || undefined;
  const role = document.getElementById('new-role')?.value;
  const errorEl = document.getElementById('create-user-error');

  if (!username || !displayName || !role) {
    if (errorEl) errorEl.textContent = 'Usuario, nombre y rol son requeridos';
    return;
  }

  try {
    await api.post('/users', { username, displayName, phone, role });
    // Clear form
    ['new-username', 'new-displayname', 'new-phone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (errorEl) errorEl.textContent = '';
    await loadUsersPage(1);
  } catch (err) {
    if (errorEl) errorEl.textContent = `Error: ${err.body?.message || err.status}`;
  }
}

// Simple HTML escape to prevent XSS in table cells
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Expose globally
window.openUsersAdmin = openUsersAdmin;
window.closeUsersAdmin = closeUsersAdmin;
