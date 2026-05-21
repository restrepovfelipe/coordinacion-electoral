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

  // CIP uses email format: username@cmd.local
  const email = username.includes('@') ? username : `${username}@cmd.local`;

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
  // TODO (T40): Add #modal-change-password to index.html
  // The modal must collect: current password, new password, confirm new password
  // On submit: call doChangePassword(newPassword)
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.remove('hidden');
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
      startApp(me);
    } catch (err) {
      // Token invalid or user deactivated — sign out silently
      auth.signOut();
    }
  }
});
