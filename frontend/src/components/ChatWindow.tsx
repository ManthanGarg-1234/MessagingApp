import { useEffect, useRef, useState } from "react";
import { WsClient } from "../ws/wsClient";
import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
  getOrCreateIdentityKeyPair,
} from "../crypto/e2ee";
import { MessageList, ChatMessage } from "./MessageList";

interface Props {
  apiBase: string;
  token: string;
  ws: WsClient | null;
  initialConversationId: string;
  initialPeerPublicKey: string;
  onConversationReady: (conversationId: string, peerPublicKey: string) => void;
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

export function ChatWindow({
  apiBase,
  token,
  ws,
  initialConversationId,
  initialPeerPublicKey,
  onConversationReady,
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
    async function setup() {
      if (!peerPublicKey) return;
      try {
        const identity = await getOrCreateIdentityKeyPair();
        setSharedKey(deriveSharedKey(peerPublicKey, identity.secretKey));
      } catch (err) {
        console.error("Failed to derive shared key", err);
      }
    }
    setup();
  }, [peerPublicKey]);

  useEffect(() => {
    if (!apiBase || !token || !conversationId || peerPublicKey) return;
    fetch(`${API_BASE_SAFE(apiBase)}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const convo = (data.conversations || []).find((c: any) => c._id === conversationId);
        if (convo && convo.participantIds) {
          fetch(`${API_BASE_SAFE(apiBase)}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json())
            .then((meData) => {
              const myId = meData.user?.id || meData.user?._id;
              const peerId = convo.participantIds.find((id: string) => id !== myId);
              if (peerId && ws) {
                ws.queryPresence(peerId);
              }
            });
        }
      })
      .catch(() => {});
  }, [apiBase, token, conversationId, peerPublicKey, ws]);

  function API_BASE_SAFE(base: string) {
    return base || "";
  }

  async function parsePayload(ciphertext: string, nonce: string, key: Uint8Array): Promise<{ text: string; media?: ChatMessage["media"] }> {
    const raw = decryptMessage({ ciphertext, nonce }, key);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && (parsed.text !== undefined || parsed.media !== undefined)) {
        let mediaData = parsed.media;
        if (mediaData && mediaData.uploadId) {
          try {
            const res = await fetch(`${apiBase}/api/media/${mediaData.uploadId}/download`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const arrayBuf = await res.arrayBuffer();
              const inferredMime = inferMimeType(mediaData.filename || "", mediaData.mimeType);
              const blob = new Blob([arrayBuf], { type: inferredMime });
              mediaData = { ...mediaData, mimeType: inferredMime, dataUrl: URL.createObjectURL(blob) };
            }
          } catch (err) {
            console.warn("Failed to download media attachment", err);
          }
        }
        return { text: parsed.text || "", media: mediaData };
      }
    } catch {
    }
    return { text: raw };
  }

  function markPeerMessagesAsRead() {
    if (!ws || document.visibilityState !== "visible" || !document.hasFocus()) return;
    setMessages((prev) => {
      let updated = false;
      const next = prev.map((m) => {
        if (m.from === "peer" && m.status !== "read") {
          ws.updateReceipt(m.id, "read");
          updated = true;
          return { ...m, status: "read" as const };
        }
        return m;
      });
      return updated ? next : prev;
    });
  }

  useEffect(() => {
    const handleFocus = () => markPeerMessagesAsRead();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    markPeerMessagesAsRead();
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [ws, conversationId]);

  useEffect(() => {
    if (!ws) return;
    return ws.on((evt) => {
      if (evt.type === "pairing:confirmed") {
        setConversationId(evt.conversationId);
        setPeerPublicKey(evt.peerPublicKey);
        onConversationReady(evt.conversationId, evt.peerPublicKey);
      }
      if (evt.type === "typing:start" && evt.conversationId === conversationId) {
        setIsPeerTyping(true);
      }
      if (evt.type === "typing:stop" && evt.conversationId === conversationId) {
        setIsPeerTyping(false);
      }
      if (evt.type === "presence:update") {
        setPeerPresence({ online: evt.online, lastSeenAt: evt.lastSeenAt });
      }
      if (evt.type === "message:reaction" && evt.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evt.messageId || m.clientMsgId === evt.messageId ? { ...m, reactions: evt.reactions } : m
          )
        );
      }
      if (evt.type === "message:delete" && evt.messageId) {
        setMessages((prev) => {
          if (evt.mode === "everyone") {
            return prev.map((m) =>
              m.id === evt.messageId || m.clientMsgId === evt.messageId ? { ...m, deletedForEveryone: true } : m
            );
          } else {
            return prev.filter((m) => m.id !== evt.messageId && m.clientMsgId !== evt.messageId);
          }
        });
      }
      if (evt.type === "message:ack") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evt.clientMsgId || m.clientMsgId === evt.clientMsgId
              ? { ...m, id: evt.messageId || m.id, clientMsgId: evt.clientMsgId, status: "sent" }
              : m
          )
        );
      }
      if (evt.type === "receipt:update") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === evt.messageId || m.clientMsgId === evt.messageId
              ? { ...m, status: evt.status as any }
              : m
          )
        );
      }
      if (evt.type === "message:new" && sharedKey) {
        if (evt.message.conversationId && evt.message.conversationId !== conversationId) return;
        parsePayload(evt.message.ciphertext, evt.message.nonce, sharedKey).then(({ text, media }) => {
          setMessages((prev) => [
            ...prev,
            {
              id: evt.message._id,
              clientMsgId: evt.message.clientMsgId,
              from: "peer",
              text,
              media,
              reactions: evt.message.reactions,
              replyToSnippet: evt.message.replyToSnippet,
              deletedForEveryone: evt.message.deletedForEveryone,
              status: "delivered",
            },
          ]);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            if (document.visibilityState !== "visible" || !document.hasFocus()) {
              new Notification("Baatein - New Message", {
                body: text || media?.filename || "New encrypted message received",
                icon: "/favicon.ico",
              });
            }
          }

          setTimeout(() => {
            ws.updateReceipt(evt.message._id, "delivered");
            if (document.visibilityState === "visible" && document.hasFocus()) {
              ws.updateReceipt(evt.message._id, "read");
            }
          }, 900);
        });
      }
    });
  }, [ws, sharedKey, conversationId, apiBase, token, onConversationReady]);

  useEffect(() => {
    if (!apiBase || !token || !conversationId || !sharedKey) return;
    let cancelled = false;
    fetch(`${apiBase}/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        const list: ChatMessage[] = [];
        const currentUserId = myUserId || getUserIdFromToken(token);
        const isWindowFocused = document.visibilityState === "visible" && document.hasFocus();
        for (const message of data.messages || []) {
          try {
            const { text, media } = await parsePayload(message.ciphertext, message.nonce, sharedKey);
            const isMe = Boolean(currentUserId && String(message.senderId) === String(currentUserId));
            const from = isMe ? "me" : "peer";
            if (!isMe && ws) {
              if (message.status === "sent") {
                ws.updateReceipt(message._id, "delivered");
              }
              if (isWindowFocused && message.status !== "read") {
                ws.updateReceipt(message._id, "read");
              }
            }
            const status = (!isMe && isWindowFocused) ? "read" : message.status;
            list.push({
              id: message._id,
              clientMsgId: message.clientMsgId,
              from,
              text,
              media,
              reactions: message.reactions,
              replyToSnippet: message.replyToSnippet,
              deletedForEveryone: message.deletedForEveryone,
              status,
            });
          } catch {
          }
        }
        setMessages(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiBase, token, conversationId, sharedKey, myUserId, ws]);

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!ws || !conversationId) return;
    ws.setTyping(conversationId, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      ws.setTyping(conversationId, false);
    }, 2000);
  }

  function sendText() {
    if (!ws || !sharedKey || !draft.trim() || !conversationId) {
      console.warn("Cannot send message: missing WS connection, encryption key, or active conversation.");
      return;
    }
    const replySnippet = replyingTo ? replyingTo.text || replyingTo.media?.filename || "Attachment" : "";
    const payloadStr = JSON.stringify({ text: draft });
    const { ciphertext, nonce } = encryptMessage(payloadStr, sharedKey);
    const clientMsgId = crypto.randomUUID();
    ws.sendMessage(conversationId, ciphertext, nonce, clientMsgId, replySnippet);
    ws.setTyping(conversationId, false);
    setMessages((prev) => [
      ...prev,
      { id: clientMsgId, clientMsgId, from: "me", text: draft, replyToSnippet: replySnippet, status: "sent" },
    ]);
    setDraft("");
    setReplyingTo(null);
  }

  async function startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access failed", err);
      alert("Microphone access is required to record voice notes.");
    }
  }

  async function stopAudioRecording(shouldSend: boolean) {
    if (!mediaRecorderRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      setRecording(false);
      setRecordSeconds(0);
      if (!shouldSend || audioChunksRef.current.length === 0 || !ws || !sharedKey || !conversationId) {
        recorder.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      recorder.stream.getTracks().forEach((track) => track.stop());
      setUploading(true);
      try {
        const arrayBuf = await audioBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        const filename = `voice_note_${Date.now()}.webm`;
        const initRes = await fetch(`${apiBase}/api/media/init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId,
            totalSize: bytes.length,
            mimeType: "audio/webm",
          }),
        });
        const initData = await initRes.json();
        await fetch(`${apiBase}/api/media/${initData.uploadId}/chunk/0`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: `Bearer ${token}`,
          },
          body: bytes,
        });
        await fetch(`${apiBase}/api/media/${initData.uploadId}/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const wireMediaPayload = {
          uploadId: initData.uploadId,
          mimeType: "audio/webm",
          filename,
        };
        const payloadStr = JSON.stringify({ text: "", media: wireMediaPayload });
        const { ciphertext, nonce } = encryptMessage(payloadStr, sharedKey);
        const clientMsgId = crypto.randomUUID();
        ws.sendMessage(conversationId, ciphertext, nonce, clientMsgId);
        const localMediaPayload = {
          ...wireMediaPayload,
          dataUrl: URL.createObjectURL(audioBlob),
        };
        setMessages((prev) => [
          ...prev,
          {
            id: clientMsgId,
            clientMsgId,
            from: "me",
            text: "",
            media: localMediaPayload,
            status: "sent",
          },
        ]);
      } catch (err) {
        console.error("Voice note send failed", err);
      } finally {
        setUploading(false);
      }
    };
    recorder.stop();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ws || !sharedKey || !conversationId) return;
    setUploading(true);
    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const inferredMime = inferMimeType(file.name, file.type);
      const initRes = await fetch(`${apiBase}/api/media/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          totalSize: bytes.length,
          mimeType: inferredMime,
        }),
      });
      const initData = await initRes.json();
      const chunkSize = 512 * 1024;
      const totalChunks = Math.max(1, Math.ceil(bytes.length / chunkSize));
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(bytes.length, start + chunkSize);
        const chunk = bytes.slice(start, end);
        await fetch(`${apiBase}/api/media/${initData.uploadId}/chunk/${i}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: `Bearer ${token}`,
          },
          body: chunk,
        });
      }
      await fetch(`${apiBase}/api/media/${initData.uploadId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const wireMediaPayload = {
        uploadId: initData.uploadId,
        mimeType: inferredMime,
        filename: file.name,
      };
      const payloadStr = JSON.stringify({ text: file.name, media: wireMediaPayload });
      const { ciphertext, nonce } = encryptMessage(payloadStr, sharedKey);
      const clientMsgId = crypto.randomUUID();
      ws.sendMessage(conversationId, ciphertext, nonce, clientMsgId);
      const localMediaPayload = {
        ...wireMediaPayload,
        dataUrl: URL.createObjectURL(file),
      };
      setMessages((prev) => [
        ...prev,
        {
          id: clientMsgId,
          clientMsgId,
          from: "me",
          text: file.name,
          media: localMediaPayload,
          status: "sent",
        },
      ]);
    } catch (err) {
      console.error("Media upload failed", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [showStarredDrawer, setShowStarredDrawer] = useState(false);
  const [wallpaper, setWallpaper] = useState<"doodle" | "emerald" | "midnight" | "cyberpunk">("doodle");
  const [accentTheme, setAccentTheme] = useState<"emerald" | "cyan" | "purple" | "orange">("cyan");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");

  // Request Web Push Notification Permission on Mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  function toggleStar(messageId: string) {
    setStarredIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  }

  function handleExportBackup() {
    if (!backupPassword.trim()) {
      alert("Please enter a password to encrypt your backup.");
      return;
    }
    try {
      const backupData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        messages: messages.map((m) => ({
          id: m.id,
          from: m.from,
          text: m.text,
          media: m.media ? { uploadId: m.media.uploadId, filename: m.media.filename, mimeType: m.media.mimeType } : undefined,
          timestamp: m.timestamp,
        })),
      };

      const jsonStr = JSON.stringify(backupData);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `baatein-backup-${Date.now()}.baatein`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setShowBackupModal(false);
      setBackupPassword("");
    } catch (err) {
      console.error("Backup export failed", err);
    }
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.messages)) {
          const importedMessages: ChatMessage[] = parsed.messages.map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            from: m.from || "me",
            text: m.text || "",
            media: m.media,
            status: "read",
            timestamp: m.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }));
          setMessages((prev) => [...prev, ...importedMessages]);
          alert(`Successfully imported ${importedMessages.length} messages from backup!`);
        }
      } catch (err) {
        alert("Failed to parse backup file. Please select a valid .baatein backup file.");
      }
    };
    reader.readAsText(file);
    setShowBackupModal(false);
  }

  const processedMessages = messages.map((m) => ({
    ...m,
    isStarred: starredIds.includes(m.id),
    isPinned: pinnedMessage?.id === m.id,
  }));

  const filteredMessages = searchQuery.trim()
    ? processedMessages.filter(
        (m) =>
          m.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.media?.filename?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : processedMessages;

  const starredMessagesList = processedMessages.filter((m) => m.isStarred);

  const COMMON_EMOJIS = ["😀", "😂", "😍", "👍", "🔥", "🎉", "🚀", "💯", "🙏", "✨"];

  return (
    <div className={`chat-window wallpaper--${wallpaper} accent--${accentTheme}`}>
      {!conversationId ? (
        <div className="empty-state">
          <p>Pair a device first using QR or pairing code to start encrypted chat.</p>
        </div>
      ) : !sharedKey ? (
        <div className="empty-state">
          <p>Waiting for peer encryption key exchange... Please pair or re-enter pairing code.</p>
        </div>
      ) : (
        <>
          {/* Header Bar with Info, Search, Theme, Starred & Backup Actions */}
          <div className="chat-header">
            <div className="chat-header__info">
              <span className="chat-header__title">Encrypted Chat</span>
              <span className="chat-header__status">
                <span className={`status-dot ${peerPresence.online ? "status-dot--online" : ""}`} />
                {peerPresence.online
                  ? "🟢 Online"
                  : peerPresence.lastSeenAt
                  ? `Last seen ${new Date(peerPresence.lastSeenAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Offline"}
              </span>
            </div>

            <div className="chat-header__actions">
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
          {/* Pinned Banner */}
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

          {/* Starred Messages Slide-Out Drawer */}
          {showStarredDrawer && (
            <div className="drawer-overlay" onClick={() => setShowStarredDrawer(false)}>
              <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <h3>⭐ Starred Messages ({starredMessagesList.length})</h3>
                  <button onClick={() => setShowStarredDrawer(false)} className="drawer-close">✕</button>
                </div>
                <div className="drawer-content">
                  {starredMessagesList.length === 0 ? (
                    <p className="empty-starred">No starred messages yet. Use message options to star messages.</p>
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

          {/* Theme Customization Modal */}
          {showThemeModal && (
            <div className="modal-overlay" onClick={() => setShowThemeModal(false)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>🎨 Customize Wallpaper & Accent</h3>
                  <button onClick={() => setShowThemeModal(false)} className="modal-close">✕</button>
                </div>
                <div className="modal-body">
                  <h4>Background Wallpaper</h4>
                  <div className="theme-grid">
                    <button
                      className={`theme-chip ${wallpaper === "doodle" ? "theme-chip--active" : ""}`}
                      onClick={() => setWallpaper("doodle")}
                    >
                      WhatsApp Doodle
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

                  <h4 style={{ marginTop: "16px" }}>Bubble Accent Color</h4>
                  <div className="theme-grid">
                    <button
                      className={`theme-chip ${accentTheme === "emerald" ? "theme-chip--active" : ""}`}
                      onClick={() => setAccentTheme("emerald")}
                    >
                      Emerald Green
                    </button>
                    <button
                      className={`theme-chip ${accentTheme === "cyan" ? "theme-chip--active" : ""}`}
                      onClick={() => setAccentTheme("cyan")}
                    >
                      Neon Cyan
                    </button>
                    <button
                      className={`theme-chip ${accentTheme === "purple" ? "theme-chip--active" : ""}`}
                      onClick={() => setAccentTheme("purple")}
                    >
                      Royal Purple
                    </button>
                    <button
                      className={`theme-chip ${accentTheme === "orange" ? "theme-chip--active" : ""}`}
                      onClick={() => setAccentTheme("orange")}
                    >
                      Sunset Orange
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Backup Export/Import Modal */}
          {showBackupModal && (
            <div className="modal-overlay" onClick={() => setShowBackupModal(false)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>💾 Encrypted Chat Backup</h3>
                  <button onClick={() => setShowBackupModal(false)} className="modal-close">✕</button>
                </div>
                <div className="modal-body">
                  <p className="modal-description">
                    Export your encrypted chat history into a password-protected <code>.baatein</code> backup file, or restore from an existing file.
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
                        💾 Download .baatein File
                      </button>
                    </div>

                    <div className="backup-section" style={{ marginTop: "16px" }}>
                      <h4>Import Backup</h4>
                      <input
                        type="file"
                        accept=".baatein,.json"
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
