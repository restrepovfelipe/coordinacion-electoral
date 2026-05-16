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

// ─── FIELD-LEVEL WRITE (eliminates full-doc overwrite collisions) ───
let _pendingWrites = 0;
let _syncBadgeTimer = null;

async function writeField(path, value) {
  _pendingWrites++;
  setSyncBadge('syncing', '🔄 Guardando...');
  try {
    const update = {};
    update[path] = value;
    await db.collection(FS_COL).doc(FS_DOC).update(update);
    _pendingWrites--;
    if (_pendingWrites <= 0) {
      _pendingWrites = 0;
      setSyncBadge('synced', '✓ Sincronizado');
      clearTimeout(_syncBadgeTimer);
      _syncBadgeTimer = setTimeout(() => setSyncBadge('', 'Sin cambios'), 3000);
    }
  } catch (e) {
    _pendingWrites = Math.max(0, _pendingWrites - 1);
    console.error('Firestore write error:', e);
    setSyncBadge('error', '⚠ Error al guardar');
  }
}

// ─── DEBOUNCED WRITE for text inputs ───
const _debounceTimers = {};
function writeFieldDebounced(path, value, ms = 400) {
  setSyncBadge('syncing', '🔄 Guardando...');
  clearTimeout(_debounceTimers[path]);
  _debounceTimers[path] = setTimeout(() => writeField(path, value), ms);
}

// ─── BATCH WRITE for multiple fields atomically ───
async function writeFields(updates) {
  _pendingWrites++;
  setSyncBadge('syncing', '🔄 Guardando...');
  try {
    await db.collection(FS_COL).doc(FS_DOC).update(updates);
    _pendingWrites--;
    if (_pendingWrites <= 0) {
      _pendingWrites = 0;
      setSyncBadge('synced', '✓ Sincronizado');
      clearTimeout(_syncBadgeTimer);
      _syncBadgeTimer = setTimeout(() => setSyncBadge('', 'Sin cambios'), 3000);
    }
  } catch (e) {
    _pendingWrites = Math.max(0, _pendingWrites - 1);
    console.error('Firestore write error:', e);
    setSyncBadge('error', '⚠ Error al guardar');
  }
}

// ─── REALTIME LISTENER ───
let _unsubscribeSnapshot = null;
let _lastSnapshotData = null;

function startListener() {
  _unsubscribeSnapshot = db.collection(FS_COL).doc(FS_DOC).onSnapshot(doc => {
    if (!doc.exists) return;
    const remote = doc.data();
    _lastSnapshotData = remote;
    ST = deepMerge(ST, remote);
    saveLocalSt();
    rerenderIfNotEditing();
  }, err => {
    console.error('Snapshot error', err);
    setSyncBadge('error', '⚠ Error sync');
  });
}

// Re-render active view while preserving focused input
function rerenderIfNotEditing() {
  const active = document.activeElement;
  const activeId = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') ? active.id : null;
  const activeValue = activeId ? active.value : null;

  // Re-render the current municipality view if one is selected
  if (typeof CUR !== 'undefined' && CUR) {
    const otTodos = document.getElementById('ot-todos');
    if (otTodos && otTodos.classList.contains('on')) {
      renderAllPuestos(CUR);
    } else {
      renderCCs(CUR);
    }
    buildSB();
  }

  // Restore focus and value to the active element if it was re-mounted
  if (activeId) {
    const restored = document.getElementById(activeId);
    if (restored && restored !== active) {
      restored.value = activeValue;
      restored.focus();
    }
  }
}

// ─── INITIAL LOAD (one-shot, before listener starts) ───
async function loadFromFirestore() {
  try {
    const doc = await db.collection(FS_COL).doc(FS_DOC).get();
    if (doc.exists) {
      const remote = doc.data();
      ST = deepMerge(ST, remote);
      saveLocalSt();
      return true;
    }
    return false;
  } catch (e) {
    console.error('Firestore load error:', e);
    return false;
  }
}
