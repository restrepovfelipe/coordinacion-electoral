// js/api.js
// REST API client that uses Firebase ID tokens for auth

const API_BASE = 'https://backend-210392280319.us-central1.run.app/api';

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
    const res = await fetch(`${API_BASE}${path}`, {
      headers: await this._headers(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res.json();
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
      case 429: return 'Demasiadas peticiones. Espera un momento e intenta de nuevo.';
    }
    if (err.status >= 500) return 'Error del servidor. Si persiste, contacta soporte.';
    const detail = err.body?.message || err.body?.code || String(err.status);
    return `Algo salió mal (${detail}). Intenta de nuevo o contacta soporte.`;
  }

  return 'Algo salió mal. Intenta de nuevo o contacta soporte.';
}

// Expose globally
window.ApiClient = ApiClient;
window.ApiError = ApiError;
window.errorToSpanish = errorToSpanish;
