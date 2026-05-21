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

// ─── Login form error helpers ─────────────────────────────────────────────────
// #l-err has CSS class login-err (display:none by default; .show makes it visible)
function _showLoginError(msg) {
  const el = document.getElementById('login-error') || document.getElementById('l-err');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function _clearLoginError() {
  const el = document.getElementById('login-error') || document.getElementById('l-err');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}

// ─── doLogin ──────────────────────────────────────────────────────────────────
function doLogin() {
  const username = document.getElementById('inp-user')
    ? document.getElementById('inp-user').value.trim()
    : document.getElementById('l-user').value.trim();
  const password = document.getElementById('inp-pass')
    ? document.getElementById('inp-pass').value
    : document.getElementById('l-pass').value;

  if (!username || !password) {
    _showLoginError('Ingresa usuario y contraseña');
    return;
  }

  // CIP uses email format: username@defensores.local
  const email = username.includes('@') ? username : `${username}@defensores.local`;

  auth.signInWithEmailAndPassword(email, password)
    .then(async () => {
      const me = await api.get('/auth/me');
      CURRENT_USER = me;

      if (me.mustChangePassword) {
        showMustChangePasswordModal();
        return;
      }

      _clearLoginError();
      if (me.role === 'SUPER_ADMIN') {
        document.getElementById('btn-users-admin')?.classList.remove('hidden');
      }
      startApp(me);
    })
    .catch((err) => {
      console.error('Login failed:', err.code ?? err.status, err);
      _showLoginError(errorToSpanish(err));
    });
}

// ─── Password-change modal ────────────────────────────────────────────────────
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
  if (errorEl) errorEl.textContent = '';
  doChangePassword(newPwd);
}
window.handlePasswordChangeSubmit = handlePasswordChangeSubmit;

// ─── doChangePassword ─────────────────────────────────────────────────────────
// Correct flow:
//   1. Backend changes password in Firebase Auth via Admin SDK (no recent-auth required)
//   2. Backend marks mustChangePassword=false in Postgres
//   3. Frontend signs out + re-signs in with NEW password to get fresh token
//   4. onAuthStateChanged fires and calls startApp()
async function doChangePassword(newPassword) {
  const errorEl = document.getElementById('change-password-error');
  const modal   = document.getElementById('modal-change-password');
  const username = CURRENT_USER?.username;

  if (!username) {
    if (errorEl) errorEl.textContent = 'Sesión no válida. Recarga la página.';
    return;
  }

  if (errorEl) errorEl.textContent = '';

  try {
    await api.post('/auth/password-changed', { newPassword });
  } catch (err) {
    console.error('Password change API call failed:', err.code ?? err.status, err);
    if (errorEl) errorEl.textContent = errorToSpanish(err);
    return;
  }

  // Close modal before re-login sequence
  if (modal) modal.classList.add('hidden');

  try {
    // Sign out old session, then re-authenticate with new password.
    // onAuthStateChanged will fire after signInWithEmailAndPassword succeeds
    // and will call startApp() once /auth/me returns mustChangePassword=false.
    await auth.signOut();
    await auth.signInWithEmailAndPassword(`${username}@defensores.local`, newPassword);
  } catch (err) {
    // Re-login failed — restore login screen so the user can try manually
    console.error('Re-login after password change failed:', err.code, err);
    document.getElementById('login-screen').style.display = '';
    if (modal) {
      modal.classList.remove('hidden');
      if (errorEl) errorEl.textContent = 'Contraseña cambiada. Error al reautenticar: ingresa nuevamente.';
    }
  }
}

// ─── Inactivity timeout ───────────────────────────────────────────────────────
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour
let _inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => { doLogout(); }, INACTIVITY_TIMEOUT);
}

function initInactivityDetection() {
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function doLogout() {
  api.post('/auth/logout', {}).catch(() => {});
  auth.signOut().then(() => {
    CURRENT_USER = null;
    location.reload();
  });
}

// ─── Session restore ──────────────────────────────────────────────────────────
// Fires on page load if Firebase has a cached credential.
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
      if (err instanceof TypeError) {
        // Network unreachable — do NOT sign out; user may be momentarily offline
        console.error('Session restore failed (network):', err.message);
        if (typeof setSyncBadge === 'function') setSyncBadge('error', '⚠ Sin conexión');
        return;
      }
      // Invalid token, deactivated account, or backend error — clear session
      console.error('Session restore failed:', err.status ?? err.code, err);
      auth.signOut();
    }
  }
});
