/**
 * RealtimeClient — EventSource wrapper with exponential backoff reconnect.
 *
 * Usage:
 *   const client = new RealtimeClient(async () => await getFirebaseIdToken());
 *   client.onEvent(event => console.log(event));
 *   client.connect();
 */
class RealtimeClient {
  /**
   * @param {() => Promise<string>} getToken  Async function returning a fresh Firebase ID token.
   */
  constructor(getToken) {
    this._getToken = getToken;
    this._handlers = [];
    this._es = null;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._delay = 1000;
    this._active = false;

    // Constants
    this._INITIAL_DELAY = 1000;
    this._MAX_DELAY = 30000;
    this._HEARTBEAT_TIMEOUT = 60000;
  }

  /**
   * Register a handler for application events.
   * @param {(event: Object) => void} handler
   */
  onEvent(handler) {
    this._handlers.push(handler);
  }

  /** Start connecting. Safe to call multiple times (idempotent if already active). */
  connect() {
    if (this._active) return;
    this._active = true;
    this._delay = this._INITIAL_DELAY;
    this._openConnection();
  }

  /** Close the connection and stop all reconnect attempts. */
  disconnect() {
    this._active = false;
    this._clearReconnectTimer();
    this._clearHeartbeatTimer();
    if (this._es) {
      this._es.close();
      this._es = null;
    }
  }

  // ─── INTERNAL ───────────────────────────────────────────────────────────────

  async _openConnection() {
    if (!this._active) return;

    let token;
    try {
      token = await this._getToken();
    } catch (err) {
      console.warn('[RealtimeClient] Could not obtain token, will retry:', err);
      this._scheduleReconnect();
      return;
    }

    // Use absolute URL so this works on Vercel (static host) → Cloud Run (API host)
    const base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '/api').replace(/\/+$/, '');
    const url = `${base}/events?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    this._es = es;

    es.onopen = () => {
      // Successful connection — reset backoff delay.
      this._delay = this._INITIAL_DELAY;
      this._resetHeartbeatTimer();
    };

    es.onmessage = (ev) => {
      this._resetHeartbeatTimer();

      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        // Raw string data (e.g. heartbeat)
        data = ev.data;
      }

      if (data === 'heartbeat') {
        // Heartbeat received — nothing else to do.
        return;
      }

      for (const handler of this._handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error('[RealtimeClient] Handler error:', err);
        }
      }
    };

    es.onerror = () => {
      // EventSource fires onerror both on connection failure and on server close.
      es.close();
      this._es = null;
      this._clearHeartbeatTimer();
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (!this._active) return;
    this._clearReconnectTimer();

    const delay = this._delay;
    // Increase delay for next attempt, capped at MAX_DELAY.
    this._delay = Math.min(this._delay * 2, this._MAX_DELAY);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._openConnection();
    }, delay);
  }

  _resetHeartbeatTimer() {
    this._clearHeartbeatTimer();
    this._heartbeatTimer = setTimeout(() => {
      // No message for HEARTBEAT_TIMEOUT ms — treat as dead connection.
      console.warn('[RealtimeClient] Heartbeat timeout — reconnecting');
      if (this._es) {
        this._es.close();
        this._es = null;
      }
      this._scheduleReconnect();
    }, this._HEARTBEAT_TIMEOUT);
  }

  _clearHeartbeatTimer() {
    if (this._heartbeatTimer !== null) {
      clearTimeout(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

// Expose as global for non-module HTML scripts.
if (typeof window !== 'undefined') {
  window.RealtimeClient = RealtimeClient;
}
