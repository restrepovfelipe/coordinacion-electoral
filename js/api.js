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

// Expose globally
window.ApiClient = ApiClient;
window.ApiError = ApiError;
