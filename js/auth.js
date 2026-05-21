// js/auth.js
// CIP email/password auth using Firebase Auth SDK
// api.js and firebase-init.js must be loaded before this file

let CURRENT_USER = null;

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken(/* forceRefresh= */ false);
}

// Create the API client (api.js must be loaded first)
const api = new ApiClient(getIdToken);

function doLogin() {
  const username = document.getElementById('inp-user')
    ? document.getElementById('inp-user').value.trim()
    : document.getElementById('l-user').value.trim();
  const password = document.getElementById('inp-pass')
    ? document.getElementById('inp-pass').value
    : document.getElementById('l-pass').value;
  const errorEl = document.getElementById('login-error')
    || document.getElementById('l-err');

  if (!username || !password) {
    errorEl.textContent = 'Ingresa usuario y contraseña';
    return;
  }

  // CIP uses email format: username@defensores.local
  const email = username.includes('@') ? username : `${username}@defensores.local`;

  auth.signInWithEmailAndPassword(email, password)
    .then(async (cred) => {
      // Get user profile from backend
      const me = await api.get('/auth/me');
      CURRENT_USER = me;

      // Check if password change required
      if (me.mustChangePassword) {
        showMustChangePasswordModal();
        return;
      }

      if (errorEl) errorEl.textContent = '';
      if (me.role === 'SUPER_ADMIN') {
        document.getElementById('btn-users-admin')?.classList.remove('hidden');
      }
      startApp(me);
    })
    .catch((err) => {
      console.error('Login failed:', err.code || err.status);
      if (err.status === 412 || (err.body && err.body.code === 'PASSWORD_CHANGE_REQUIRED')) {
        showMustChangePasswordModal();
        return;
      }
      if (errorEl) errorEl.textContent = 'Usuario o contraseña incorrectos';
    });
}

function showMustChangePasswordModal() {
  document.getElementById('login-screen').style.display = 'none';
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.remove('hidden');
}

function handlePasswordChangeSubmit() {
  const newPwd = document.getElementById('new-password-input')?.value;
  const confirmPwd = document.getElementById('confirm-password-input')?.value;
  const errorEl = document.getElementById('change-password-error');

  if (!newPwd || newPwd.length < 8) {
    if (errorEl) errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres';
    return;
  }
  if (newPwd !== confirmPwd) {
    if (errorEl) errorEl.textContent = 'Las contraseñas no coinciden';
    return;
  }

  doChangePassword(newPwd).catch(err => {
    if (errorEl) errorEl.textContent = 'Error cambiando contraseña. Intenta de nuevo.';
  });
}
window.handlePasswordChangeSubmit = handlePasswordChangeSubmit;

// Inactivity timeout: 30 minutes
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour in ms
let _inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    // Force logout on inactivity
    doLogout();
  }, INACTIVITY_TIMEOUT);
}

function initInactivityDetection() {
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer(); // start timer
}

async function doChangePassword(newPassword) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await user.updatePassword(newPassword);
    await api.post('/auth/password-changed', {});
    const modal = document.getElementById('modal-change-password');
    if (modal) modal.classList.add('hidden');
    const me = await api.get('/auth/me');
    CURRENT_USER = me;
    if (me.role === 'SUPER_ADMIN') {
      document.getElementById('btn-users-admin')?.classList.remove('hidden');
    }
    startApp(me);
  } catch (err) {
    console.error('Password change failed:', err.code || err.status);
    throw err;
  }
}

function doLogout() {
  api.post('/auth/logout', {}).catch(() => {}); // best-effort
  auth.signOut().then(() => {
    CURRENT_USER = null;
    location.reload();
  });
}

// Auto-restore session if Firebase has a cached user
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const me = await api.get('/auth/me');
      CURRENT_USER = me;
      if (me.mustChangePassword) {
        showMustChangePasswordModal();
        return;
      }
      if (me.role === 'SUPER_ADMIN') {
        document.getElementById('btn-users-admin')?.classList.remove('hidden');
      }
      startApp(me);
    } catch (err) {
      // Token invalid or user deactivated — sign out silently
      auth.signOut();
    }
  }
});
