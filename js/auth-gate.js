// js/auth-gate.js
// Promesa que resuelve cuando Firebase termina de rehidratar auth.currentUser
// desde IndexedDB. Debe cargarse DESPUÉS de firebase-init.js.
window.authReady = new Promise((resolve) => {
  const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
    unsubscribe();
    resolve(user); // null si no hay sesión, objeto user si hay
  });
});
