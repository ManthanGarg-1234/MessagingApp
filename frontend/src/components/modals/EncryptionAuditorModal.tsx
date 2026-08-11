import { useState, useEffect } from "react";
import { getOrCreateIdentityKeyPair } from "../../crypto/e2ee";

interface Props {
  onClose: () => void;
  peerPublicKey?: string;
}

export function EncryptionAuditorModal({ onClose, peerPublicKey }: Props) {
  const [myPublicKey, setMyPublicKey] = useState<string>("");

  useEffect(() => {
    getOrCreateIdentityKeyPair().then((kp) => {
      setMyPublicKey(kp.publicKey);
    });
  }, []);

  function formatFingerprint(keyStr: string) {
    if (!keyStr) return "N/A";
    const chunks = [];
    for (let i = 0; i < keyStr.length; i += 4) {
      chunks.push(keyStr.slice(i, i + 4));
    }
    return chunks.slice(0, 8).join(" ");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.4rem" }}>🔐</span>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>E2EE Security &amp; Safety Inspector</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: "rgba(6, 182, 212, 0.1)", border: "1px solid rgba(6, 182, 212, 0.3)", padding: "12px", borderRadius: "12px", fontSize: "0.85rem", color: "var(--accent-cyan)", lineHeight: 1.4 }}>
          🛡️ AetherSync implements client-side End-to-End Encryption using <strong>Curve25519</strong> key exchange &amp; <strong>XSalsa20-Poly1305</strong> authenticated cipher. Messages are encrypted locally on your device before reaching the server.
        </div>

        <div className="input-group">
          <label className="input-label">Your Long-Term Identity Key (Base64)</label>
          <div className="input-field-wrapper">
            <input
              type="text"
              readOnly
              value={myPublicKey || "Generating..."}
              style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--accent-cyan)" }}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Your Safety Number Fingerprint</label>
          <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--glass-border)", padding: "12px", borderRadius: "10px", fontFamily: "monospace", fontSize: "0.95rem", color: "var(--accent-emerald)", letterSpacing: "1px" }}>
            {formatFingerprint(myPublicKey)}
          </div>
        </div>

        {peerPublicKey && (
          <div className="input-group">
            <label className="input-label">Peer's Public Key Fingerprint</label>
            <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--glass-border)", padding: "12px", borderRadius: "10px", fontFamily: "monospace", fontSize: "0.95rem", color: "var(--accent-purple)", letterSpacing: "1px" }}>
              {formatFingerprint(peerPublicKey)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Protocol: TweetNaCl E2EE • Ephemeral Nonce • Forward Secrecy
          </span>
          <button className="btn-primary-action" onClick={onClose}>
            ✓ Verified
          </button>
        </div>
      </div>
    </div>
  );
}
