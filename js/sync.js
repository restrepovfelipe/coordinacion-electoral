// ─── SYNC BADGE ───
function setSyncBadge(state, text) {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  if (!badge) return;
  badge.className = 'sync-badge ' + (state || '');
  label.textContent = text || '';
}

// ─── DEEP MERGE (b wins over a) ───
function deepMerge(a, b) {
  const result = Object.assign({}, a);
  for (const key of Object.keys(b)) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) &&
        a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) {
      result[key] = deepMerge(a[key], b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

// ─── WRITE COUNTER ───
let _pendingWrites = 0;
let _syncBadgeTimer = null;

function _writeDone() {
  _pendingWrites = Math.max(0, _pendingWrites - 1);
  if (_pendingWrites === 0) {
    setSyncBadge('synced', '✓ Sincronizado');
    clearTimeout(_syncBadgeTimer);
    _syncBadgeTimer = setTimeout(() => setSyncBadge('', 'Sin cambios'), 3000);
  }
}

// ─── WRITE FULL MUNICIPALITY TO ITS OWN DOC ───
// Writes gs(n) as a clean nested object to estado/{n}.
// No dot-notation paths — avoids the Firebase set() literal-key bug.
async function writeMuni(n) {
  _pendingWrites++;
  setSyncBadge('syncing', '🔄 Guardando...');
  try {
    const data = JSON.parse(JSON.stringify(gs(n)));
    await db.collection(FS_COL).doc(n).set(data);
    _writeDone();
  } catch (e) {
    _pendingWrites = Math.max(0, _pendingWrites - 1);
    console.error('Firestore write error [' + n + ']:', e);
    setSyncBadge('error', '⚠ Error al guardar');
  }
}

// ─── DEBOUNCED WRITE (for keystroke inputs) ───
const _muniWriteTimers = {};
function writeDebounced(n, ms) {
  setSyncBadge('syncing', '🔄 Guardando...');
  clearTimeout(_muniWriteTimers[n]);
  _muniWriteTimers[n] = setTimeout(() => writeMuni(n), ms || 600);
}

// ─── REALTIME LISTENERS (one per municipality) ───
let _unsubscribers = [];

function startListener() {
  AMVA.filter(n => RAW[n]).forEach(n => {
    const unsub = db.collection(FS_COL).doc(n).onSnapshot(doc => {
      if (!doc.exists) return;
      const remote = doc.data();
      if (!ST[n]) ST[n] = {};
      ST[n] = deepMerge(ST[n], remote);
      saveLocalSt();
      rerenderIfNotEditing();
    }, err => {
      console.error('Snapshot error [' + n + ']:', err);
      setSyncBadge('error', '⚠ Error sync');
    });
    _unsubscribers.push(unsub);
  });
}

// ─── INITIAL LOAD ───
async function loadFromFirestore() {
  try {
    const munis = AMVA.filter(n => RAW[n]);
    const docs = await Promise.all(munis.map(n => db.collection(FS_COL).doc(n).get()));
    let loaded = false;
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      const n = munis[i];
      if (!ST[n]) ST[n] = {};
      ST[n] = deepMerge(ST[n], doc.data());
      loaded = true;
    });
    if (loaded) saveLocalSt();
    return loaded;
  } catch (e) {
    console.error('Firestore load error:', e);
    return false;
  }
}

// ─── RE-RENDER WITHOUT LOSING FOCUS ───
function rerenderIfNotEditing() {
  const active = document.activeElement;
  const activeId = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') ? active.id : null;
  const activeValue = activeId ? active.value : null;
  if (typeof CUR !== 'undefined' && CUR) {
    const otTodos = document.getElementById('ot-todos');
    if (otTodos && otTodos.classList.contains('on')) {
      renderAllPuestos(CUR);
    } else {
      renderCCs(CUR);
    }
    buildSB();
  }
  if (activeId) {
    const restored = document.getElementById(activeId);
    if (restored && restored !== active) {
      restored.value = activeValue;
      restored.focus();
    }
  }
}
