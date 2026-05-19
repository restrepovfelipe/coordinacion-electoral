const USERS = {
  'coordinador1': { pass: 'Cord1.2026*', nombre: 'Coordinador 1' },
  'coordinador2': { pass: 'Cord2.2026*', nombre: 'Coordinador 2' },
  'coordinador3': { pass: 'Cord3.2026*', nombre: 'Coordinador 3' },
  'coordinador4': { pass: 'Cord4.2026*', nombre: 'Coordinador 4' }
};

let CURRENT_USER = null;

// Sign in anonymously so Firestore rules (request.auth != null) are satisfied.
// This runs before the login screen is shown.
async function initAnonymousAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        resolve();
      } else {
        try {
          await auth.signInAnonymously();
          resolve();
        } catch (e) {
          console.error('Anonymous auth failed:', e);
          document.getElementById('login-screen').innerHTML =
            '<div style="color:#f05060;padding:40px;text-align:center;font-family:sans-serif">' +
            '<h2>Error de configuración Firebase</h2>' +
            '<p>Habilita Anonymous Auth en Firebase Console → Authentication → Sign-in method.</p>' +
            '<p style="font-size:12px;opacity:.7">' + e.message + '</p></div>';
          resolve(); // don't block forever
        }
      }
    });
  });
}

async function doLogin() {
  const u = document.getElementById('l-user').value.trim().toLowerCase();
  const p = document.getElementById('l-pass').value;
  const err = document.getElementById('l-err');
  const syncMsg = document.getElementById('l-sync');
  if (USERS[u] && USERS[u].pass === p) {
    err.classList.remove('show');
    syncMsg.classList.add('show');
    CURRENT_USER = u;
    await startApp();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('user-label').textContent = USERS[u].nombre;
    sessionStorage.setItem('amva_user', u);
    syncMsg.classList.remove('show');
  } else {
    err.classList.add('show');
    document.getElementById('l-pass').value = '';
    document.getElementById('l-pass').focus();
  }
}

function doLogout() {
  _unsubscribers.forEach(unsub => typeof unsub === 'function' && unsub());
  _unsubscribers = [];
  sessionStorage.removeItem('amva_user');
  CURRENT_USER = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('l-err').classList.remove('show');
}

// Auto-login from session
(async function () {
  await initAnonymousAuth();
  const u = sessionStorage.getItem('amva_user');
  if (u && USERS[u]) {
    CURRENT_USER = u;
    document.getElementById('user-label').textContent = USERS[u].nombre;
    document.getElementById('login-screen').style.display = 'none';
    await startApp();
  }
})();
