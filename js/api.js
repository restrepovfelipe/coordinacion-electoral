// js/api.js
// REST API client that uses Firebase ID tokens for auth

const API_BASE = 'https://backend-210392280319.us-central1.run.app/api';

// ─── Reference-data cache (localStorage, stale-while-revalidate) ──────────────
const _CACHE_PREFIX = 'ref_cache:';
// Paths eligible for caching (prefix match, query params allowed)
const _REF_PATHS = ['/subregiones', '/municipios', '/comunas', '/zonas', '/puestos'];

function _isRefPath(path) {
  return _REF_PATHS.some(p => path === p || path.startsWith(p + '?'));
}

function _cacheKey(path) {
  const uid = (typeof auth !== 'undefined' && auth.currentUser?.uid) || 'anon';
  return `${_CACHE_PREFIX}${uid}:${path}`;
}

function clearReferenceCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(_CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

class ApiClient {
  constructor(getToken) {
    this._getToken = getToken; // async () => string
  }

  async _headers() {
    const token = await this._getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  async get(path) {
    if (_isRefPath(path)) return this._cachedGet(path);

    const res = await fetch(`${API_BASE}${path}`, {
      headers: await this._headers(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res.json();
  }

  // Stale-while-revalidate: return cached data immediately, refresh in background.
  async _cachedGet(path) {
    const key = _cacheKey(path);
    let cached = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) cached = JSON.parse(raw);
    } catch {
      localStorage.removeItem(key);
    }

    if (cached) {
      // Return stale data immediately; revalidate quietly in the background.
      this._revalidate(path, key, cached.etag).catch(() => {});
      return cached.data;
    }

    // No cached data — block on the first fetch.
    return this._fetchAndCache(path, key, null);
  }

  async _revalidate(path, key, etag) {
    await this._fetchAndCache(path, key, etag);
  }

  async _fetchAndCache(path, key, etag) {
    const headers = await this._headers();
    if (etag) headers['If-None-Match'] = etag;

    const res = await fetch(`${API_BASE}${path}`, { headers });

    if (res.status === 304) {
      // Server confirmed data unchanged — nothing to update.
      return JSON.parse(localStorage.getItem(key) || 'null')?.data ?? null;
    }

    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));

    const data = await res.json();
    const newEtag = res.headers.get('ETag');
    if (newEtag) {
      try {
        localStorage.setItem(key, JSON.stringify({ etag: newEtag, data }));
      } catch {
        // localStorage full — skip caching, data is still returned
      }
    }
    return data;
  }

  async post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res.status === 204 ? null : res.json();
  }

  async patch(path, body, etag) {
    const headers = await this._headers();
    if (etag) headers['If-Match'] = etag;
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    if (res.status === 412) throw new ApiError(412, { code: 'STALE_ENTITY' });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res.status === 204 ? null : res.json();
  }

  async delete(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: await this._headers(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return null;
  }
}

class ApiError extends Error {
  constructor(status, body) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Map any thrown error to a user-facing Spanish string.
// Handles Firebase Auth client errors (err.code), API errors (ApiError), and network failures.
function errorToSpanish(err) {
  if (!err) return 'Algo salió mal. Intenta de nuevo.';

  // Firebase Auth client SDK error codes
  if (err.code) {
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Usuario o contraseña incorrectos.';
      case 'auth/user-disabled':
        return 'Tu cuenta está inactiva. Contacta al administrador.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
      case 'auth/network-request-failed':
        return 'Sin conexión a internet. Revisa tu red e intenta de nuevo.';
      case 'auth/requires-recent-login':
        return 'Tu sesión expiró. Por favor inicia sesión de nuevo.';
      default:
        return `Algo salió mal (${err.code}). Intenta de nuevo o contacta soporte.`;
    }
  }

  // Network failure — no response at all
  if (err instanceof TypeError) {
    return 'Sin conexión a internet. Revisa tu red e intenta de nuevo.';
  }

  // API response errors
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401: return 'Sesión expirada. Por favor inicia sesión de nuevo.';
      case 403: return 'No tienes permiso para esta acción.';
      case 409: return err.body?.message || 'El recurso ya existe. Verifica los datos e intenta de nuevo.';
      case 412:
        if (err.body?.code === 'PASSWORD_CHANGE_REQUIRED')
          return 'Debes cambiar tu contraseña antes de continuar.';
        return 'Conflicto de versión. Recarga la página e intenta de nuevo.';
      case 429: return 'Demasiadas peticiones. Espera un momento e intenta de nuevo.';
    }
    if (err.status >= 500) return err.body?.message || 'Error del servidor. Si persiste, contacta soporte.';
    if (err.status >= 400) return err.body?.message || `Error ${err.status}. Verifica los datos e intenta de nuevo.`;
    const detail = err.body?.message || err.body?.code || String(err.status);
    return `Algo salió mal (${detail}). Intenta de nuevo o contacta soporte.`;
  }

  return 'Algo salió mal. Intenta de nuevo o contacta soporte.';
}

// Expose globally
window.ApiClient = ApiClient;
window.ApiError = ApiError;
window.errorToSpanish = errorToSpanish;
window.API_BASE = API_BASE;
window.clearReferenceCache = clearReferenceCache;
