import { useState, useEffect, useRef } from "react";
import { inferMimeType } from "./ChatWindow";

export interface ChatMessage {
  id: string;
  clientMsgId?: string;
  from: "me" | "peer";
  text: string;
  media?: {
    uploadId: string;
    mimeType: string;
    dataUrl?: string;
    filename?: string;
  };
  status: "sent" | "delivered" | "read";
  timestamp?: string;
  reactions?: { userId: string; emoji: string }[];
  replyToSnippet?: string;
  deletedForEveryone?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: ChatMessage) => void;
  onDelete?: (messageId: string, mode: "everyone" | "me") => void;
  onPin?: (message: ChatMessage) => void;
  onStar?: (messageId: string) => void;
}

function downloadBlobUrl(dataUrl: string, filename: string) {
  try {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || "attachment";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  } catch (err) {
    console.error("Download failed", err);
  }
}

function viewBlobUrl(dataUrl: string) {
  try {
    const win = window.open(dataUrl, "_blank");
    if (!win) {
      window.location.href = dataUrl;
    }
  } catch {
    window.location.href = dataUrl;
  }
}

function MediaPreview({
  media,
  onOpenLightbox,
}: {
  media: NonNullable<ChatMessage["media"]>;
  onOpenLightbox: (dataUrl: string, isImage: boolean, filename: string) => void;
}) {
  if (!media.dataUrl) return null;

  const fname = (media.filename || "").toLowerCase();
  const mime = inferMimeType(fname, media.mimeType).toLowerCase();

  const isImage = mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fname);
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|mkv|mov|avi)$/i.test(fname);
  const isAudio = mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fname);
  const isPdf = mime === "application/pdf" || fname.endsWith(".pdf");

  const downloadName = media.filename || (isPdf ? "document.pdf" : isImage ? "image.png" : isVideo ? "video.mp4" : "file");

  return (
    <div className="message__media">
      {isImage && (
        <div className="message__image-container">
          <img
            src={media.dataUrl}
            alt={downloadName}
            className="message__image"
            onClick={() => onOpenLightbox(media.dataUrl!, true, downloadName)}
            style={{ cursor: "pointer" }}
            title="Click to expand lightbox"
          />
          <button
            onClick={() => downloadBlobUrl(media.dataUrl!, downloadName)}
            className="message__download-btn"
            title="Download Image"
          >
            📥 Download Image
          </button>
        </div>
      )}

      {isVideo && (
        <div className="message__video-container">
          <video
            src={media.dataUrl}
            controls
            className="message__video"
            onClick={(e) => {
              if (e.detail === 2) onOpenLightbox(media.dataUrl!, false, downloadName);
            }}
          />
          <div className="media-btn-row">
            <button
              onClick={() => onOpenLightbox(media.dataUrl!, false, downloadName)}
              className="message__view-btn"
              title="Expand Fullscreen Lightbox"
            >
              ⛶ Fullscreen
            </button>
            <button
              onClick={() => downloadBlobUrl(media.dataUrl!, downloadName)}
              className="message__download-btn"
              title="Download Video"
            >
              📥 Download
            </button>
          </div>
        </div>
      )}

      {isAudio && (
        <div className="message__audio-container">
          <audio src={media.dataUrl} controls className="message__audio" />
          <button
            onClick={() => downloadBlobUrl(media.dataUrl!, downloadName)}
            className="message__download-btn"
            title="Download Audio"
          >
            📥 Download Audio
          </button>
        </div>
      )}

      {isPdf && (
        <div className="message__pdf-card">
          <div className="message__pdf-icon">📄</div>
          <div className="message__pdf-info">
            <span className="message__pdf-title">{media.filename || "Document.pdf"}</span>
            <span className="message__pdf-tag">PDF Document</span>
          </div>
          <div className="message__pdf-actions">
            <button
              onClick={() => viewBlobUrl(media.dataUrl!)}
              className="message__view-btn"
              title="View PDF"
            >
              👁️ View
            </button>
            <button
              onClick={() => downloadBlobUrl(media.dataUrl!, downloadName)}
              className="message__download-btn"
              title="Download PDF"
            >
              📥 Download
            </button>
          </div>
        </div>
      )}

      {!isImage && !isVideo && !isAudio && !isPdf && (
        <div className="message__file-card">
          <div className="message__file-icon">📎</div>
          <span className="message__file-name">{media.filename || "Attachment"}</span>
          <button
            onClick={() => downloadBlobUrl(media.dataUrl!, downloadName)}
            className="message__download-btn"
            title="Download File"
          >
            📥 Download
          </button>
        </div>
      )}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function MessageList({ messages, onReact, onReply, onDelete, onPin, onStar }: MessageListProps) {
  const [lightbox, setLightbox] = useState<{ dataUrl: string; isImage: boolean; filename: string } | null>(null);
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function groupReactions(reactions?: { userId: string; emoji: string }[]) {
    if (!reactions || reactions.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of reactions) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    }
    return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));
  }

  return (
    <>
      <ul className="message-list">
        {messages.map((m) => {
          const reactionSummary = groupReactions(m.reactions);

          if (m.deletedForEveryone) {
            return (
              <li key={m.id} id={`msg-${m.id}`} className={`message message--${m.from} message--deleted`}>
                <span className="message__deleted-text">🚫 This message was deleted</span>
                <div className="message__meta">
                  {m.timestamp && <span className="message__time">{m.timestamp}</span>}
                </div>
              </li>
            );
          }

          return (
            <li key={m.id} id={`msg-${m.id}`} className={`message message--${m.from} message-item-hover`}>
              {/* Quick Action Hover Bar */}
              <div className="message__hover-actions">
                <div className="message__emoji-bar">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onReact?.(m.id, emoji)}
                      title={`React ${emoji}`}
                      className="emoji-quick-btn"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button onClick={() => onReply?.(m)} title="Reply" className="action-btn">
                  ↩️ Reply
                </button>
                <button
                  onClick={() => setMenuMsgId(menuMsgId === m.id ? null : m.id)}
                  title="More Options"
                  className="action-btn"
                >
                  ⋮
                </button>

                {menuMsgId === m.id && (
                  <div className="message__dropdown-menu">
                    <button
                      onClick={() => {
                        onPin?.(m);
                        setMenuMsgId(null);
                      }}
                    >
                      📌 Pin Message
                    </button>
                    <button
                      onClick={() => {
                        onStar?.(m.id);
                        setMenuMsgId(null);
                      }}
                    >
                      {m.isStarred ? "⭐ Unstar Message" : "⭐ Star Message"}
                    </button>
                    <button
                      onClick={() => {
                        onDelete?.(m.id, "me");
                        setMenuMsgId(null);
                      }}
                    >
                      🗑️ Delete for me
                    </button>
                    {m.from === "me" && (
                      <button
                        onClick={() => {
                          onDelete?.(m.id, "everyone");
                          setMenuMsgId(null);
                        }}
                      >
                        🗑️ Delete for everyone
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Quoted Snippet */}
              {m.replyToSnippet && (
                <div
                  className="message__reply-quote"
                  onClick={() => {
                    const el = document.getElementById(`msg-${m.id}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span className="reply-quote__label">Replying to:</span>
                  <span className="reply-quote__text">{m.replyToSnippet}</span>
                </div>
              )}

              {/* Media Content */}
              {m.media && (
                <MediaPreview
                  media={m.media}
                  onOpenLightbox={(dataUrl, isImage, filename) => setLightbox({ dataUrl, isImage, filename })}
                />
              )}

              {/* Text Content */}
              {m.text && <span className="message__text">{m.text}</span>}

              {/* Reaction Badges */}
              {reactionSummary.length > 0 && (
                <div className="message__reactions">
                  {reactionSummary.map(({ emoji, count }) => (
                    <button
                      key={emoji}
                      onClick={() => onReact?.(m.id, emoji)}
                      className="reaction-badge"
                      title={`${count} reactions`}
                    >
                      <span>{emoji}</span>
                      {count > 1 && <span className="reaction-count">{count}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Meta timestamp & status ticks */}
              <div className="message__meta">
                {m.isStarred && <span className="message__starred-badge" title="Starred Message">⭐</span>}
                {m.timestamp && <span className="message__time">{m.timestamp}</span>}
                {m.from === "me" && (
                  <span
                    className={`message__status message__status--${m.status}`}
                    title={m.status === "sent" ? "Sent" : m.status === "delivered" ? "Delivered" : "Read"}
                  >
                    {m.status === "sent" ? "✓" : "✓✓"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        <div ref={messagesEndRef} />
      </ul>

      {/* Fullscreen Lightbox Modal */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close-btn" onClick={() => setLightbox(null)}>
              ✕
            </button>
            {lightbox.isImage ? (
              <img src={lightbox.dataUrl} alt={lightbox.filename} className="lightbox-media" />
            ) : (
              <video src={lightbox.dataUrl} controls autoPlay className="lightbox-media" />
            )}
            <div className="lightbox-footer">
              <span className="lightbox-filename">{lightbox.filename}</span>
              <button
                onClick={() => downloadBlobUrl(lightbox.dataUrl, lightbox.filename)}
                className="lightbox-download-btn"
              >
                📥 Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
