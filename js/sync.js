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

/**
 * @deprecated Kept ONLY for the 3 movilidad callers (addResp/delResp/saveMovAll).
 * All other data has real API persistence. Remove this function entirely in Phase 16
 * once movilidad gets its own backend table and endpoint.
 */
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
let _statsRefreshTimer = null;

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

    // Also refresh dashboard stats (coverage % update — T88 fix)
    clearTimeout(_statsRefreshTimer);
    _statsRefreshTimer = setTimeout(async () => {
      try {
        if (window.api) {
          const stats = await window.api.getDashboardStats({ bypassCache: true });
          if (typeof updateDashboardStats === 'function') {
            updateDashboardStats(stats);
          }
        }
      } catch (err) {
        console.warn('[sync] Failed to refresh dashboard stats:', err);
      }
    }, 300);
    return;
  }

  if (event.type === 'asignacion:puesto_changed') {
    // Refresh testigo counts (cobertura update) and re-render if a commune panel is open.
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
        console.warn('[sync] Failed to refresh counts after asignacion change:', err);
      }
    }, 300);
    rerenderIfNotEditing();
    return;
  }

  if (event.type === 'prioridad:config_changed') {
    // Config change → recomputed priorities → refresh stats
    clearTimeout(_statsRefreshTimer);
    _statsRefreshTimer = setTimeout(async () => {
      try {
        if (window.api) {
          const stats = await window.api.getDashboardStats({ bypassCache: true });
          if (typeof updateDashboardStats === 'function') {
            updateDashboardStats(stats);
          }
        }
      } catch (err) {
        console.warn('[sync] Failed to refresh stats after config change:', err);
      }
    }, 300);
    return;
  }

  if (event.type === 'coordinador:adhoc_changed') {
    // Update localStorage for the changed scope so all users see the latest data.
    const scopeType = (event.scopeType || event.payload?.scopeType || '').toUpperCase();
    const scopeId   = event.scopeId   ?? event.payload?.scopeId;
    const nombre    = event.payload?.nombre    ?? null;
    const telefono  = event.payload?.telefono  ?? null;

    if (scopeId !== undefined && typeof gs !== 'undefined' && typeof saveLocalSt !== 'undefined') {
      if (scopeType === 'MUNICIPIO') {
        // Find which municipality and update its coordinator
        const affectedMuni = (typeof ALL_MUNIS !== 'undefined' ? ALL_MUNIS : [])
          .find(n => typeof _puestoIdCache !== 'undefined' && _puestoIdCache[n]?._muniId === scopeId);
        if (affectedMuni) {
          const s = gs(affectedMuni);
          s.coord = nombre || ''; s.phone = telefono || '';
          saveLocalSt();
        }
      } else if (scopeType === 'ZONA') {
        // Zones belong to MEDELLIN — reverse-lookup by ID in _zonaIdCache
        if (typeof _zonaIdCache !== 'undefined' && typeof RAW !== 'undefined') {
          const zonaNombre = Object.keys(RAW['MEDELLIN'] || {})
            .find(k => _zonaIdCache[k] === scopeId || _zonaIdCache[(k || '').toUpperCase()] === scopeId);
          if (zonaNombre) {
            const s = gs('MEDELLIN');
            if (!s.zonas) s.zonas = {};
            s.zonas[zonaNombre] = { coord: nombre || '', phone: telefono || '' };
            saveLocalSt();
          }
        }
      } else if (scopeType === 'COMUNA') {
        // Find which municipality + commune this belongs to
        if (typeof ALL_MUNIS !== 'undefined' && typeof RAW !== 'undefined' && typeof _puestoIdCache !== 'undefined') {
          for (const n of ALL_MUNIS) {
            if (!RAW[n]) continue;
            const ccIds = _puestoIdCache[n]?._ccIds;
            if (!ccIds) continue;
            const ck = Object.keys(RAW[n]).find(k => ccIds[k] === scopeId || ccIds[(k||'').toUpperCase()] === scopeId);
            if (ck) {
              const s = gs(n);
              if (!s.comunas) s.comunas = {};
              s.comunas[ck] = { coord: nombre || '', phone: telefono || '' };
              saveLocalSt();
              break;
            }
          }
        }
      } else if (scopeType === 'PUESTO') {
        // Find which municipality + puesto this belongs to
        if (typeof ALL_MUNIS !== 'undefined' && typeof RAW !== 'undefined' && typeof _puestoIdCache !== 'undefined') {
          for (const n of ALL_MUNIS) {
            if (!RAW[n]) continue;
            const cache = _puestoIdCache[n];
            if (!cache) continue;
            const pName = Object.keys(cache).find(k => !k.startsWith('_') && cache[k] === scopeId);
            if (pName) {
              // Find the puesto object in RAW to get its pk key
              for (const ck of Object.keys(RAW[n])) {
                const pObj = RAW[n][ck].find(p => p.puesto.toUpperCase() === pName.toUpperCase());
                if (pObj) {
                  const s = gs(n);
                  if (!s.puestos) s.puestos = {};
                  const key = `${pObj.dd}_${pObj.mm}_${pObj.zz}_${pObj.pp}`;
                  if (!s.puestos[key]) s.puestos[key] = {};
                  s.puestos[key].coord = nombre || '';
                  s.puestos[key].phone = telefono || '';
                  saveLocalSt();
                  break;
                }
              }
              break;
            }
          }
        }
      }
    }

    // Re-render current view and refresh municipality header
    rerenderIfNotEditing();
    if (typeof refreshCoordDisplay === 'function' && typeof CUR !== 'undefined' && CUR) {
      refreshCoordDisplay(CUR);
    }
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
