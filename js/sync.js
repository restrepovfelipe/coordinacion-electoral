// ─── SYNC BADGE ───
function setSyncBadge(state, text) {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  if (!badge) return;
  badge.className = 'sync-badge ' + (state || '');
  label.textContent = text || '';
}

// ─── DEBOUNCED WRITE (no-op: state lives in localStorage only) ───
const _muniWriteTimers = {};
function writeDebounced(n, ms) {
  // No remote write — state is persisted to localStorage by saveLocalSt() in app.js.
  // Kept for API compatibility.
}

// ─── WRITE MUNICIPALITY (no-op: kept for API compatibility) ───
async function writeMuni(n) {
  // No remote write — state is persisted to localStorage only.
}

// ─── INITIAL LOAD STUB ───
// Returns empty array (no migration needed — state comes from localStorage).
async function loadFromFirestore() {
  return [];
}

// ─── PUSH STUB (no-op: kept for API compatibility) ───
async function pushAllToFirestore(munis) {
  // No Firestore — nothing to push.
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

// ─── REALTIME EVENT HANDLER ───
let _countsRefreshTimer = null;

function handleRealtimeEvent(event) {
  // event shape: { type, puestoId?, municipioId?, scopeType?, scopeId?, payload }
  if (event.type === 'testigo:count_changed') {
    // Debounce 300ms: multiple rapid events (e.g. bulk-assign) collapse into one refetch.
    clearTimeout(_countsRefreshTimer);
    _countsRefreshTimer = setTimeout(async () => {
      try {
        if (window.api) {
          const counts = await window.api.getTestigoCounts({ bypassCache: true });
          if (typeof updateDashboardTestigoCounts === 'function') {
            updateDashboardTestigoCounts(counts);
          }
        }
      } catch (err) {
        console.warn('[sync] Failed to refresh testigo counts:', err);
      }
    }, 300);
    return;
  }
  // Re-render the current municipality view if it is open.
  rerenderIfNotEditing();
}

// ─── SSE LISTENER ───
let _realtimeClient = null;

function startListener() {
  if (!window.RealtimeClient) {
    console.warn('[sync] RealtimeClient not loaded');
    return;
  }

  _realtimeClient = new RealtimeClient(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken(false);
  });

  _realtimeClient.onEvent((event) => {
    handleRealtimeEvent(event);
  });

  // Update badge on connection state via onerror / reconnect lifecycle.
  // RealtimeClient does not expose onConnect/onDisconnect callbacks, so we
  // patch the internal EventSource open/error hooks after connect().
  _realtimeClient.connect();

  // Wrap _openConnection to hook into open/error for badge updates.
  const _origOpen = _realtimeClient._openConnection.bind(_realtimeClient);
  _realtimeClient._openConnection = async function () {
    setSyncBadge('syncing', '🔄 Conectando...');
    await _origOpen();
    // Patch the EventSource once it is created.
    const _patchEs = () => {
      if (!_realtimeClient._es) return;
      const es = _realtimeClient._es;
      const _origOnOpen = es.onopen;
      es.onopen = (ev) => {
        setSyncBadge('synced', '✓ Conectado');
        setTimeout(() => setSyncBadge('', 'Sin cambios'), 3000);
        if (_origOnOpen) _origOnOpen.call(es, ev);
      };
      const _origOnError = es.onerror;
      es.onerror = (ev) => {
        setSyncBadge('error', '⚠ Error sync');
        if (_origOnError) _origOnError.call(es, ev);
      };
    };
    // EventSource is assigned synchronously after await inside _openConnection,
    // so schedule the patch on the next microtask.
    Promise.resolve().then(_patchEs);
  };

  setSyncBadge('syncing', '🔄 Conectando...');
}

function stopListener() {
  if (_realtimeClient) {
    _realtimeClient.disconnect();
    _realtimeClient = null;
  }
  setSyncBadge('', 'Sin cambios');
}
