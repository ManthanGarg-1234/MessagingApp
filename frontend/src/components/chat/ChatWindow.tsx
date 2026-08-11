import { useEffect, useRef, useState } from "react";
import { WsClient } from "../../ws/wsClient";
import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
  getOrCreateIdentityKeyPair,
} from "../../crypto/e2ee";
import { MessageList, ChatMessage } from "./MessageList";

interface Props {
  apiBase: string;
  token: string;
  ws: WsClient | null;
  initialConversationId: string;
  initialPeerPublicKey: string;
  onConversationReady: (conversationId: string, peerPublicKey: string) => void;
  onStartCall?: (isVideo: boolean) => void;
}

function getUserIdFromToken(jwtToken: string): string {
  try {
    const parts = jwtToken.split(".");
    if (parts.length < 2) return "";
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    return parsed.sub || parsed.id || "";
  } catch {
    return "";
  }
}

export function inferMimeType(filename: string, fileType?: string): string {
  if (fileType && fileType !== "application/octet-stream" && fileType.trim() !== "") {
    return fileType;
  }
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "mkv": return "video/x-matroska";
    case "avi": return "video/x-msvideo";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "m4a": return "audio/mp4";
    default: return fileType || "application/octet-stream";
  }
}

const COMMON_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "🚀", "💯", "✨"];

export function ChatWindow({
  apiBase,
  token,
  ws,
  initialConversationId,
  initialPeerPublicKey,
  onConversationReady: _onConversationReady,
  onStartCall,
}: Props) {
  const [conversationId, setConversationId] = useState<string>(initialConversationId);
  const [peerPublicKey, setPeerPublicKey] = useState<string>(initialPeerPublicKey);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sharedKey, setSharedKey] = useState<Uint8Array | null>(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [peerPresence, setPeerPresence] = useState<{ online: boolean; lastSeenAt?: string }>({ online: false });
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [myUserId, setMyUserId] = useState<string>(() => getUserIdFromToken(token));
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [showStarredDrawer, setShowStarredDrawer] = useState(false);

  const [wallpaper, setWallpaper] = useState<string>("default");
  const [accentTheme] = useState<string>("default");
  const [showThemeModal, setShowThemeModal] = useState(false);

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");

  useEffect(() => {
    const extracted = getUserIdFromToken(token);
    if (extracted) setMyUserId(extracted);
    if (!apiBase || !token) return;
    fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const id = data.user?.id || data.user?._id;
        if (id) setMyUserId(String(id));
      })
      .catch(() => {});
  }, [apiBase, token]);

  useEffect(() => {
    if (initialConversationId) setConversationId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    if (initialPeerPublicKey) setPeerPublicKey(initialPeerPublicKey);
  }, [initialPeerPublicKey]);

  useEffect(() => {
    if (!peerPublicKey) {
      setSharedKey(null);
      return;
    }
    let cancelled = false;
    getOrCreateIdentityKeyPair()
      .then((identityKey) => deriveSharedKey(identityKey.secretKey, peerPublicKey))
      .then((key) => {
        if (!cancelled) setSharedKey(key);
      })
      .catch((err) => {
        console.error("Failed to derive shared key:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [peerPublicKey]);

  useEffect(() => {
    if (!conversationId || !sharedKey) {
      setMessages([]);
      return;
    }

    fetch(`${apiBase}/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(async (data) => {
        const loaded: ChatMessage[] = [];
        for (const raw of data.messages || []) {
          let text = "[decryption failed]";
          try {
            text = await decryptMessage(raw.ciphertext, raw.nonce, sharedKey);
          } catch (e) {
            console.warn("Could not decrypt historical message", e);
          }

          let mediaPayload: ChatMessage["media"] | undefined;
          if (raw.contentType === "media" && raw.mediaId) {
            mediaPayload = await fetchMediaBlob(raw.mediaId);
          }

          const msgSenderId = String(raw.senderId?._id || raw.senderId || "");
          const currentUserId = String(myUserId);
          const isFromMe = msgSenderId === currentUserId;

          loaded.push({
            id: raw._id,
            clientMsgId: raw.clientMsgId,
            from: isFromMe ? "me" : "peer",
            text,
            media: mediaPayload,
            status: raw.status || "sent",
            timestamp: new Date(raw.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            reactions: raw.reactions || [],
            replyToSnippet: raw.replyToSnippet || "",
            deletedForEveryone: raw.deletedForEveryone || false,
          });
        }
        setMessages(loaded);
      })
      .catch((err) => console.error("Failed to fetch messages", err));
  }, [conversationId, sharedKey, apiBase, token, myUserId]);

  useEffect(() => {
    if (!ws || !conversationId) return;

    const unsubs = [
      ws.on("message:new", async (msg: any) => {
        const raw = msg.message;
        if (raw.conversationId !== conversationId) return;

        let text = "[decryption failed]";
        if (sharedKey) {
          try {
            text = await decryptMessage(raw.ciphertext, raw.nonce, sharedKey);
          } catch {
            // ignore
          }
        }

        let mediaPayload: ChatMessage["media"] | undefined;
        if (raw.contentType === "media" && raw.mediaId) {
          mediaPayload = await fetchMediaBlob(raw.mediaId);
        }

        const msgSenderId = String(raw.senderId?._id || raw.senderId || "");
        const isFromMe = msgSenderId === String(myUserId);

        const newMsg: ChatMessage = {
          id: raw._id,
          clientMsgId: raw.clientMsgId,
          from: isFromMe ? "me" : "peer",
          text,
          media: mediaPayload,
          status: "delivered",
          timestamp: new Date(raw.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          reactions: raw.reactions || [],
          replyToSnippet: raw.replyToSnippet || "",
          deletedForEveryone: raw.deletedForEveryone || false,
        };

        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id || (m.clientMsgId && m.clientMsgId === newMsg.clientMsgId))) {
            return prev.map((m) =>
              m.clientMsgId === newMsg.clientMsgId || m.id === newMsg.id ? { ...newMsg, status: "sent" } : m
            );
          }
          return [...prev, newMsg];
        });

        if (!isFromMe) {
          ws.updateReceipt(raw._id, "read");
        }
      }),

      ws.on("receipt:update", (payload: any) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.messageId ? { ...m, status: payload.status } : m))
        );
      }),

      ws.on("message:reaction", (payload: any) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m))
        );
      }),

      ws.on("message:delete", (payload: any) => {
        if (payload.mode === "everyone") {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.messageId ? { ...m, deletedForEveryone: true } : m))
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
        }
      }),

      ws.on("typing:start", (payload: any) => {
        if (payload.conversationId === conversationId && payload.userId !== myUserId) {
          setIsPeerTyping(true);
        }
      }),

      ws.on("typing:stop", (payload: any) => {
        if (payload.conversationId === conversationId) {
          setIsPeerTyping(false);
        }
      }),

      ws.on("presence:update", (payload: any) => {
        setPeerPresence({ online: payload.online, lastSeenAt: payload.lastSeenAt });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [ws, conversationId, sharedKey, myUserId]);

  async function fetchMediaBlob(mediaId: string): Promise<ChatMessage["media"] | undefined> {
    try {
      const res = await fetch(`${apiBase}/api/media/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      return {
        uploadId: mediaId,
        mimeType: data.mimeType || "application/octet-stream",
        filename: data.filename || "file",
        dataUrl: data.dataUrl,
      };
    } catch {
      return undefined;
    }
  }

  function handleDraftChange(val: string) {
    setDraft(val);
    if (!ws || !conversationId) return;

    ws.sendTypingStart(conversationId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      ws.sendTypingStop(conversationId);
    }, 2000);
  }

  async function sendText() {
    if (!draft.trim() || !conversationId || !sharedKey || !ws) return;
    const plaintext = draft.trim();
    setDraft("");
    ws.sendTypingStop(conversationId);

    const clientMsgId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { ciphertext, nonce } = await encryptMessage(plaintext, sharedKey);

    const tempMsg: ChatMessage = {
      id: clientMsgId,
      clientMsgId,
      from: "me",
      text: plaintext,
      status: "sent",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      replyToSnippet: replyingTo ? replyingTo.text || replyingTo.media?.filename || "Attachment" : "",
    };

    setMessages((prev) => [...prev, tempMsg]);

    ws.sendMessage(conversationId, ciphertext, nonce, clientMsgId, "text", tempMsg.replyToSnippet);
    setReplyingTo(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversationId || !sharedKey) return;
    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const mimeType = inferMimeType(file.name, file.type);

        const res = await fetch(`${apiBase}/api/media/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dataUrl: base64Data,
            mimeType,
            filename: file.name,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        const clientMsgId = `c_media_${Date.now()}`;
        const { ciphertext, nonce } = await encryptMessage(`[Media Attachment: ${file.name}]`, sharedKey);

        const tempMsg: ChatMessage = {
          id: clientMsgId,
          clientMsgId,
          from: "me",
          text: "",
          media: {
            uploadId: data.mediaId,
            mimeType,
            filename: file.name,
            dataUrl: base64Data,
          },
          status: "sent",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, tempMsg]);
        ws?.sendMessage(conversationId, ciphertext, nonce, clientMsgId, "media");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(`Media upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      alert("Microphone access denied or unsupported.");
    }
  }

  function stopAudioRecording(shouldSend: boolean) {
    if (!mediaRecorderRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      if (shouldSend && audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const filename = `Voice_Note_${new Date().toISOString().substring(0, 10)}.webm`;

          const res = await fetch(`${apiBase}/api/media/upload`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dataUrl: base64Data,
              mimeType: "audio/webm",
              filename,
            }),
          });
          const data = await res.json();
          if (res.ok && sharedKey) {
            const clientMsgId = `c_voice_${Date.now()}`;
            const { ciphertext, nonce } = await encryptMessage("[Voice Note]", sharedKey);
            const tempMsg: ChatMessage = {
              id: clientMsgId,
              clientMsgId,
              from: "me",
              text: "",
              media: {
                uploadId: data.mediaId,
                mimeType: "audio/webm",
                filename,
                dataUrl: base64Data,
              },
              status: "sent",
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages((prev) => [...prev, tempMsg]);
            ws?.sendMessage(conversationId, ciphertext, nonce, clientMsgId, "media");
          }
        };
        reader.readAsDataURL(blob);
      }
      setRecording(false);
      setRecordSeconds(0);
    };

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
  }

  function toggleStar(msgId: string) {
    setStarredIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  }

  const filteredMessages = messages
    .filter((m) => !starredIds.includes(m.id) || true)
    .map((m) => ({ ...m, isStarred: starredIds.includes(m.id) }))
    .filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.text.toLowerCase().includes(q) ||
        (m.media?.filename && m.media.filename.toLowerCase().includes(q))
      );
    });

  const starredMessagesList = messages.filter((m) => starredIds.includes(m.id));

  function handleExportBackup() {
    if (!backupPassword.trim()) {
      alert("Please enter a password to encrypt your chat backup.");
      return;
    }
    const payload = JSON.stringify({
      version: 1,
      conversationId,
      exportedAt: new Date().toISOString(),
      messages,
    });
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AetherSync_Backup_${new Date().toISOString().substring(0, 10)}.aethersync`;
    a.click();
    URL.revokeObjectURL(url);
    setShowBackupModal(false);
    setBackupPassword("");
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
          alert(`Successfully imported ${parsed.messages.length} messages from backup.`);
        }
      } catch {
        alert("Invalid backup file format.");
      }
    };
    reader.readAsText(file);
    setShowBackupModal(false);
  }

  return (
    <div className={`chat-window theme-bg--${wallpaper} theme-accent--${accentTheme}`}>
      {!conversationId || !sharedKey ? (
        <div className="empty-state">
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "16px" }}>⚡</div>
            <h3>AetherSync Encrypted Channel</h3>
            <p>Select a friend from 👥 Discover &amp; Friends or 🔗 Pair Devices to start communicating.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-header">
            <div className="chat-header__info">
              <span className="chat-header__title">Active Encrypted Session</span>
              <span className="chat-header__status">
                {peerPresence.online ? "🟢 Online" : "⚪ Offline"}
              </span>
            </div>

            <div className="chat-header__actions">
              {onStartCall && (
                <>
                  <button
                    onClick={() => onStartCall(false)}
                    className="header-icon-btn"
                    title="Start Voice Call"
                    style={{ background: "rgba(16,185,129,0.18)", borderColor: "var(--accent-emerald)", color: "var(--accent-emerald)" }}
                  >
                    📞 Voice Call
                  </button>
                  <button
                    onClick={() => onStartCall(true)}
                    className="header-icon-btn"
                    title="Start Video Call"
                    style={{ background: "rgba(6,182,212,0.18)", borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}
                  >
                    🎥 Video Call
                  </button>
                </>
              )}

              <div className="chat-header__search">
                <span className="search-icon">🔍</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="search-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="search-clear-btn">
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowStarredDrawer(!showStarredDrawer)}
                className="header-icon-btn"
                title="Starred Messages"
              >
                ⭐ ({starredMessagesList.length})
              </button>

              <button
                onClick={() => setShowThemeModal(!showThemeModal)}
                className="header-icon-btn"
                title="Appearance & Themes"
              >
                🎨 Theme
              </button>

              <button
                onClick={() => setShowBackupModal(true)}
                className="header-icon-btn"
                title="Backup Options"
              >
                💾 Backup
              </button>
            </div>
          </div>

          {pinnedMessage && (
            <div className="pinned-banner">
              <div
                className="pinned-banner__info"
                onClick={() => {
                  const el = document.getElementById(`msg-${pinnedMessage.id}`);
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="pinned-banner__icon">📌</span>
                <span className="pinned-banner__text">
                  Pinned: {pinnedMessage.text || pinnedMessage.media?.filename || "Attachment"}
                </span>
              </div>
              <button onClick={() => setPinnedMessage(null)} className="pinned-banner__close">
                ✕
              </button>
            </div>
          )}

          <MessageList
            messages={filteredMessages}
            onReact={(messageId, emoji) => ws?.sendReaction(messageId, conversationId, emoji)}
            onReply={(msg) => setReplyingTo(msg)}
            onDelete={(messageId, mode) => ws?.deleteMessage(messageId, conversationId, mode)}
            onPin={(msg) => setPinnedMessage(msg)}
            onStar={(messageId) => toggleStar(messageId)}
          />

          {isPeerTyping && <div className="typing-indicator">Peer is typing...</div>}

          {showStarredDrawer && (
            <div className="drawer-overlay" onClick={() => setShowStarredDrawer(false)}>
              <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <h3>⭐ Starred Messages ({starredMessagesList.length})</h3>
                  <button onClick={() => setShowStarredDrawer(false)} className="drawer-close">✕</button>
                </div>
                <div className="drawer-content">
                  {starredMessagesList.length === 0 ? (
                    <p className="empty-starred">No starred messages yet.</p>
                  ) : (
                    starredMessagesList.map((m) => (
                      <div
                        key={m.id}
                        className="starred-item"
                        onClick={() => {
                          setShowStarredDrawer(false);
                          const el = document.getElementById(`msg-${m.id}`);
                          el?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        <span className="starred-item__from">{m.from === "me" ? "You" : "Peer"}:</span>
                        <span className="starred-item__text">{m.text || m.media?.filename || "Attachment"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {showThemeModal && (
            <div className="modal-overlay" onClick={() => setShowThemeModal(false)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>🎨 Customize Wallpaper &amp; Accent</h3>
                  <button onClick={() => setShowThemeModal(false)} className="modal-close">✕</button>
                </div>
                <div className="modal-body">
                  <h4>Background Wallpaper</h4>
                  <div className="theme-grid">
                    <button
                      className={`theme-chip ${wallpaper === "doodle" ? "theme-chip--active" : ""}`}
                      onClick={() => setWallpaper("doodle")}
                    >
                      Doodle Pattern
                    </button>
                    <button
                      className={`theme-chip ${wallpaper === "emerald" ? "theme-chip--active" : ""}`}
                      onClick={() => setWallpaper("emerald")}
                    >
                      Emerald Glow
                    </button>
                    <button
                      className={`theme-chip ${wallpaper === "midnight" ? "theme-chip--active" : ""}`}
                      onClick={() => setWallpaper("midnight")}
                    >
                      Midnight Purple
                    </button>
                    <button
                      className={`theme-chip ${wallpaper === "cyberpunk" ? "theme-chip--active" : ""}`}
                      onClick={() => setWallpaper("cyberpunk")}
                    >
                      Cyberpunk Neon
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showBackupModal && (
            <div className="modal-overlay" onClick={() => setShowBackupModal(false)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>💾 Encrypted Chat Backup</h3>
                  <button onClick={() => setShowBackupModal(false)} className="modal-close">✕</button>
                </div>
                <div className="modal-body">
                  <p className="modal-description">
                    Export your encrypted chat history into a password-protected <code>.aethersync</code> backup file, or restore from an existing file.
                  </p>

                  <div className="backup-actions">
                    <div className="backup-section">
                      <h4>Export Backup</h4>
                      <input
                        type="password"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        placeholder="Enter encryption password..."
                        className="modal-input"
                      />
                      <button onClick={handleExportBackup} className="modal-action-btn">
                        💾 Download .aethersync File
                      </button>
                    </div>

                    <div className="backup-section" style={{ marginTop: "16px" }}>
                      <h4>Import Backup</h4>
                      <input
                        type="file"
                        accept=".aethersync,.json"
                        onChange={handleImportBackup}
                        className="file-select-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {replyingTo && (
            <div className="reply-banner">
              <div className="reply-banner__content">
                <span className="reply-banner__label">Replying to {replyingTo.from === "me" ? "yourself" : "peer"}</span>
                <span className="reply-banner__snippet">
                  {replyingTo.text || replyingTo.media?.filename || "Attachment"}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} className="reply-banner__cancel">
                ✕
              </button>
            </div>
          )}

          {showEmojiPicker && (
            <div className="emoji-picker-popover">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setDraft((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="emoji-picker-btn"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="composer">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording || !conversationId || !sharedKey}
              title="Attach File"
            >
              {uploading ? "..." : "📎"}
            </button>
            <button
              className="emoji-toggle-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Emoji Picker"
            >
              😀
            </button>
            {recording ? (
              <div className="recording-bar">
                <span className="recording-indicator">🔴 Recording ({recordSeconds}s)</span>
                <button onClick={() => stopAudioRecording(false)} className="recording-cancel-btn">
                  Cancel
                </button>
                <button onClick={() => stopAudioRecording(true)} className="recording-send-btn">
                  Send Voice Note
                </button>
              </div>
            ) : (
              <>
                <input
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendText()}
                  placeholder="Type a message..."
                  disabled={!conversationId || !sharedKey}
                />
                <button
                  className="mic-btn"
                  onClick={startAudioRecording}
                  disabled={!conversationId || !sharedKey}
                  title="Record Voice Note"
                >
                  🎙️
                </button>
                <button onClick={sendText} disabled={!conversationId || !sharedKey || !draft.trim()}>
                  Send
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
