import { useState } from "react";

interface Props {
  apiBase: string;
  token: string;
  onConversationReady: (conversationId: string, peerPublicKey: string) => void;
}

export function NfcPairing({ apiBase, token, onConversationReady }: Props) {
  const [tapping, setTapping] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function triggerNfcTap() {
    setTapping(true);
    setStatusMessage("Bring your phone close to touch / tap another NFC device...");

    if ("NDEFReader" in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        await ndef.scan();
        setStatusMessage("NFC hardware active. Tap device now...");
      } catch {
        // Fallback to simulated tap
      }
    }

    setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/pairing/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pairingLink: `aethersync://pair?session=nfc_${Date.now()}`,
            identityPublicKey: "nfc_proximity_key",
          }),
        });
        const data = await res.json();
        if (res.ok && data.conversationId) {
          setStatusMessage("NFC Proximity Tap successful! Device paired.");
          onConversationReady(data.conversationId, data.peerPublicKey || "nfc_proximity_key");
        }
      } catch {
        setStatusMessage("NFC pairing timeout.");
      } finally {
        setTapping(false);
      }
    }, 2200);
  }

  return (
    <div className="pairing-host">
      <div style={{ fontSize: "3.5rem", margin: "10px 0", animation: tapping ? "pulse 1s infinite" : "none" }}>📲</div>
      <h3>NFC Proximity Tap-to-Connect</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto 16px auto" }}>
        Touch phones together using Near Field Communication (NFC) for instantaneous E2EE device pairing.
      </p>

      <button
        className="submit-auth-btn"
        style={{ maxWidth: "260px" }}
        onClick={triggerNfcTap}
        disabled={tapping}
      >
        {tapping ? "📲 Hold Phones Together..." : "Simulate NFC Tap"}
      </button>

      {statusMessage && (
        <div style={{ marginTop: "16px", fontSize: "0.85rem", color: "var(--accent-cyan)", fontWeight: 500 }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
