/**
 * WebSocket client wrapper: handles auth handshake, auto-reconnect with
 * backoff, IndexedDB outbox queueing for offline resilience, and event subscriptions.
 */

type ServerEvent =
  | { type: "auth:ok"; userId: string }
  | { type: "auth:error" }
  | { type: "message:new"; message: any }
  | { type: "message:ack"; clientMsgId: string; status: string; messageId: string }
  | { type: "receipt:update"; messageId: string; status: string }
  | { type: "message:reaction"; messageId: string; conversationId: string; reactions: { userId: string; emoji: string }[] }
  | { type: "message:delete"; messageId: string; conversationId: string; mode: "everyone" | "me" }
  | { type: "presence:update"; userId: string; online: boolean; lastSeenAt?: string }
  | { type: "typing:start" | "typing:stop"; conversationId: string; userId: string }
  | { type: "pairing:confirmed"; conversationId: string; peerUserId: string; peerPublicKey: string }
  | { type: "error"; error: string };

type Listener = (event: ServerEvent) => void;

const OUTBOX_DB_NAME = "baatein-outbox-db";
const OUTBOX_STORE = "outbox";

function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToOutbox(id: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).put({ id, payload, createdAt: Date.now() });
  } catch (err) {
    console.warn("IndexedDB outbox save failed", err);
  }
}

async function loadOutbox(): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  try {
    const db = await openOutboxDb();
    return new Promise((resolve) => {
      const tx = db.transaction(OUTBOX_STORE, "readonly");
      const req = tx.objectStore(OUTBOX_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function removeFromOutbox(id: string): Promise<void> {
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(id);
  } catch {
    // ignore
  }
}

export class WsClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private readonly url: string;
  private readonly getToken: () => string | null;

  constructor(url: string, getToken: () => string | null) {
    this.url = url;
    this.getToken = getToken;
  }

  connect(): void {
    this.socket = new WebSocket(this.url);

    this.socket.onopen = async () => {
      this.reconnectAttempts = 0;
      const token = this.getToken();
      if (token) this.send({ type: "auth", token });
      await this.flushOutbox();
    };

    this.socket.onmessage = async (evt) => {
      try {
        const data: ServerEvent = JSON.parse(evt.data);
        if (data.type === "message:ack" && data.clientMsgId) {
          await removeFromOutbox(data.clientMsgId);
        }
        this.listeners.forEach((l) => l(data));
      } catch {
        // ignore malformed frames
      }
    };

    this.socket.onclose = () => this.scheduleReconnect();
    this.socket.onerror = () => this.socket?.close();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts += 1;
    setTimeout(() => this.connect(), delay);
  }

  private async flushOutbox(): Promise<void> {
    const items = await loadOutbox();
    for (const item of items) {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(item.payload));
      }
    }
  }

  send(payload: Record<string, unknown>): void {
    const data = JSON.stringify(payload);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      const id = (payload.clientMsgId as string) || crypto.randomUUID();
      saveToOutbox(id, payload);
    }
  }

  sendMessage(
    conversationId: string,
    ciphertext: string,
    nonce: string,
    clientMsgId: string,
    replyToSnippet: string = ""
  ): void {
    const payload = { type: "message:send", conversationId, ciphertext, nonce, clientMsgId, replyToSnippet };
    this.send(payload);
  }

  updateReceipt(messageId: string, status: "delivered" | "read"): void {
    this.send({ type: "receipt:update", messageId, status });
  }

  sendReaction(messageId: string, conversationId: string, emoji: string): void {
    this.send({ type: "message:reaction", messageId, conversationId, emoji });
  }

  deleteMessage(messageId: string, conversationId: string, mode: "everyone" | "me"): void {
    this.send({ type: "message:delete", messageId, conversationId, mode });
  }

  queryPresence(targetUserId: string): void {
    this.send({ type: "presence:query", targetUserId });
  }

  setTyping(conversationId: string, typing: boolean): void {
    this.send({ type: typing ? "typing:start" : "typing:stop", conversationId });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.socket?.close();
  }
}

