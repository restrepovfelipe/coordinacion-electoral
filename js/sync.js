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
    const data = Object.assign(JSON.parse(JSON.stringify(gs(n))), { _v: 2 });
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

// hasPendingWrites=true means this snapshot is an echo of our own in-flight write.
// Skip re-render in that case to avoid flicker; only re-render on server-confirmed changes.
function startListener() {
  ALL_MUNIS.filter(n => RAW[n]).forEach(n => {
    const unsub = db.collection(FS_COL).doc(n).onSnapshot({ includeMetadataChanges: true }, doc => {
      if (!doc.exists) return;
      if (doc.metadata.hasPendingWrites) return;
      const remote = Object.assign({}, doc.data());
      delete remote._v;
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
// Returns array of municipality names that need to be pushed to Firestore
// (missing or from old architecture — no _v:2 stamp).
async function loadFromFirestore() {
  try {
    const munis = ALL_MUNIS.filter(n => RAW[n]);
    const docs = await Promise.all(munis.map(n => db.collection(FS_COL).doc(n).get()));
    const needsMigration = [];
    docs.forEach((doc, i) => {
      const n = munis[i];
      if (doc.exists && doc.data()._v === 2) {
        if (!ST[n]) ST[n] = {};
        const remote = doc.data();
        delete remote._v;
        ST[n] = deepMerge(ST[n], remote);
      } else {
        needsMigration.push(n);
      }
    });
    saveLocalSt();
    return needsMigration;
  } catch (e) {
    console.error('Firestore load error:', e);
    return ALL_MUNIS.filter(n => RAW[n]); // on error push everything
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
