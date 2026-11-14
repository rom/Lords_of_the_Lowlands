// WebSocket connection with automatic reconnect.
export class Net {
  constructor(onMsg, onState) {
    this.onMsg = onMsg;
    this.onState = onState;
    this.ws = null;
    this.queue = [];
    this.closedByUser = false;
    this.retry = 0;
  }
  connect() {
    this.closedByUser = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.onState('open'); for (const m of this.queue) ws.send(m); this.queue = []; };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(m); };
    ws.onclose = () => {
      this.onState('closed');
      if (this.closedByUser) return;
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.connect(), 500 * this.retry);
    };
  }
  send(obj) {
    const s = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === 1) this.ws.send(s);
    else if (this.queue.length < 50) this.queue.push(s);
  }
  close() { this.closedByUser = true; if (this.ws) this.ws.close(); }
}
