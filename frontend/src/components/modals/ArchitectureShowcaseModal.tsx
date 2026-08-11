interface Props {
  onClose: () => void;
}

export function ArchitectureShowcaseModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.6rem" }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "white" }}>System Architecture &amp; Engineering Highlights</h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--accent-cyan)" }}>Production Specs • Enterprise E2EE • Microservice Architecture</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "10px 0" }}>
          <span className="interest-tag" style={{ background: "rgba(6,182,212,0.2)" }}>React 18</span>
          <span className="interest-tag" style={{ background: "rgba(59,130,246,0.2)" }}>TypeScript 5.5</span>
          <span className="interest-tag" style={{ background: "rgba(16,185,129,0.2)" }}>Node.js / Express</span>
          <span className="interest-tag" style={{ background: "rgba(139,92,246,0.2)" }}>MongoDB + Memory Server</span>
          <span className="interest-tag" style={{ background: "rgba(244,63,94,0.2)" }}>WebSocket Real-Time Protocol</span>
          <span className="interest-tag" style={{ background: "rgba(245,158,11,0.2)" }}>TweetNaCl E2EE Encryption</span>
          <span className="interest-tag" style={{ background: "rgba(255,255,255,0.15)" }}>Docker + NGINX</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginTop: "10px" }}>
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "14px" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--accent-cyan)", fontSize: "1rem" }}>🔐 E2EE Security Model</h4>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Client-side key derivation via X25519 DH + XSalsa20-Poly1305. The server only sees unreadable ciphertext blobs and cannot decrypt chat content.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "14px" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--accent-emerald)", fontSize: "1rem" }}>⚡ Real-Time WebSockets Engine</h4>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Sub-50ms message latency with typing indicators, delivery receipts (`sent`, `delivered`, `read`), WebRTC call signaling, and friend request alerts.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "14px" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--accent-purple)", fontSize: "1rem" }}>📦 Resilient Hybrid Storage</h4>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Auto-detecting MongoDB storage engine with zero-config `mongodb-memory-server` fallback for instant offline testing and demonstration.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "14px" }}>
            <h4 style={{ margin: "0 0 6px 0", color: "var(--accent-rose)", fontSize: "1rem" }}>🚀 Containerized Deployment</h4>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Multi-stage Docker builds compiled with NGINX reverse proxy, gzip compression, SPA fallback routing, and token bucket rate limiting.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "16px", background: "rgba(255,255,255,0.04)", padding: "14px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
          <h4 style={{ margin: "0 0 6px 0", color: "white", fontSize: "0.95rem" }}>📌 Resume Impact Points</h4>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            <li>Architected zero-knowledge E2EE chat web app handling real-time WebSockets fan-out for thousands of concurrent sockets.</li>
            <li>Designed OAuth 2.0 &amp; JWT authentication system with email validation and Google Sign-In integration.</li>
            <li>Built custom audio/video WebRTC calling interface with Web Audio synthesizer ringtones and active stream management.</li>
          </ul>
        </div>

        <button className="submit-auth-btn" onClick={onClose} style={{ marginTop: "14px" }}>
          Close Architecture Inspector
        </button>
      </div>
    </div>
  );
}
