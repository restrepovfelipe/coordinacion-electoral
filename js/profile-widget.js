// js/profile-widget.js — bottom-left user profile widget for all authenticated pages

const ROLE_LABELS = {
  SUPER_ADMIN:           'Super Admin',
  REGIONAL_COORDINATOR:  'Coord. Regional',
  MUNICIPAL_COORDINATOR: 'Coord. Municipal',
  ZONE_COORDINATOR:      'Coord. de Zona',
  COMUNA_COORDINATOR:    'Coord. de Comuna',
  PUESTO_COORDINATOR:    'Coord. de Puesto',
};

function _profileInit(user) {
  const placeholder = document.getElementById('profile-widget');
  if (!placeholder) return;

  const label = ROLE_LABELS[user.role] ?? user.role;

  placeholder.innerHTML = `
    <div class="profile-widget-card" id="profile-widget-btn" title="Mi perfil">
      <div class="profile-widget-name">${_esc(user.displayName)}</div>
      <div class="profile-widget-role">${_esc(label)}</div>
    </div>
    <div class="profile-modal-overlay hidden" id="profile-modal-overlay">
      <div class="profile-modal">
        <div class="profile-modal-header">
          <span>Mi Perfil</span>
          <button class="profile-modal-close" id="profile-modal-close">✕</button>
        </div>
        <div class="profile-modal-body">
          <label class="profile-label">Nombre</label>
          <input class="profile-input" id="profile-display-name" type="text" value="${_esc(user.displayName)}" maxlength="80">
          <label class="profile-label">Teléfono</label>
          <input class="profile-input" id="profile-phone" type="tel" value="${_esc(user.phone ?? '')}" maxlength="20" placeholder="Opcional">
          <label class="profile-label">Nueva contraseña</label>
          <input class="profile-input" id="profile-new-password" type="password" placeholder="Dejar vacío para no cambiar" minlength="8" maxlength="64">
          <div class="profile-modal-error hidden" id="profile-modal-error"></div>
        </div>
        <div class="profile-modal-footer">
          <button class="profile-btn-save" id="profile-btn-save">Guardar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('profile-widget-btn').addEventListener('click', () => {
    document.getElementById('profile-modal-overlay').classList.remove('hidden');
  });
  document.getElementById('profile-modal-close').addEventListener('click', _closeProfileModal);
  document.getElementById('profile-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('profile-modal-overlay')) _closeProfileModal();
  });
  document.getElementById('profile-btn-save').addEventListener('click', _saveProfile);
}

function _closeProfileModal() {
  document.getElementById('profile-modal-overlay')?.classList.add('hidden');
  const errEl = document.getElementById('profile-modal-error');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
}

async function _saveProfile() {
  const displayName = document.getElementById('profile-display-name').value.trim();
  const phone       = document.getElementById('profile-phone').value.trim();
  const newPassword = document.getElementById('profile-new-password').value;
  const errEl       = document.getElementById('profile-modal-error');
  const btn         = document.getElementById('profile-btn-save');

  if (!displayName) {
    errEl.textContent = 'El nombre no puede estar vacío';
    errEl.classList.remove('hidden');
    return;
  }
  if (newPassword && newPassword.length < 8) {
    errEl.textContent = 'La contraseña debe tener al menos 8 caracteres';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const payload = { displayName, phone: phone || null };
  if (newPassword) payload.newPassword = newPassword;

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const updated = await window.api.patch('/users/me', payload);
    window.CURRENT_USER = { ...window.CURRENT_USER, ...updated };
    // Update widget label
    const nameEl = document.querySelector('.profile-widget-name');
    if (nameEl) nameEl.textContent = updated.displayName;
    _closeProfileModal();
    _showToast('Perfil actualizado');
  } catch (err) {
    errEl.textContent = err?.message ?? 'Error al guardar';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

function _showToast(msg) {
  const t = document.createElement('div');
  t.className = 'profile-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Called by auth.js after startApp()
window.initProfileWidget = _profileInit;
