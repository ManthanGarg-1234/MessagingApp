import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getOrCreateIdentityKeyPair } from "../../crypto/e2ee";

interface PairingInitResponse {
  code: string;
  expiresAt: string;
  deepLink: string;
}

interface HostProps {
  apiBase: string;
  token: string;
  onConversationReady?: (conversationId: string, peerPublicKey: string) => void;
}

export function QRPairingHost({ apiBase, token, onConversationReady }: HostProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<PairingInitResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "confirmed" | "expired">("idle");
  const [confirmedData, setConfirmedData] = useState<{ conversationId: string; peerPublicKey: string } | null>(null);

  useEffect(() => {
    async function init() {
      setError(null);
      setQrDataUrl(null);
      const identity = await getOrCreateIdentityKeyPair();

      const res = await fetch(`${apiBase}/api/pairing/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publicKey: identity.publicKey }),
      });
      const data = (await res.json()) as Partial<PairingInitResponse> & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to create pairing session");
      }

      if (!data.code) {
        throw new Error("Pairing response did not include a code");
      }

      const sessionData: PairingInitResponse = {
        code: data.code,
        expiresAt: data.expiresAt || new Date().toISOString(),
        deepLink: data.deepLink || `aethersync://pair/${data.code}`,
      };

      setSession(sessionData);
      setStatus("pending");

      const dataUrl = await QRCode.toDataURL(sessionData.deepLink, {
        width: 240,
        margin: 1,
      });
      setQrDataUrl(dataUrl);
    }
    init().catch((err) => {
      console.error("Pairing init failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create pairing session");
      setStatus("idle");
    });
  }, [apiBase, token]);

  useEffect(() => {
    if (!session || status !== "pending") return;
    const interval = setInterval(async () => {
      const res = await fetch(`${apiBase}/api/pairing/${session.code}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "confirmed" && data.conversationId) {
        setStatus("confirmed");
        setConfirmedData({
          conversationId: data.conversationId,
          peerPublicKey: data.peerPublicKey || "",
        });
        clearInterval(interval);
        if (onConversationReady) {
          onConversationReady(data.conversationId, data.peerPublicKey || "");
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [session, status, apiBase, token, onConversationReady]);

  return (
    <div className="pairing-host">
      <h2>Pair a new device</h2>
      <div className="pairing-qr-frame">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Pairing QR code" width={240} height={240} />
        ) : (
          <canvas ref={canvasRef} width={240} height={240} />
        )}
      </div>
      {session && <p className="pairing-link">{session.deepLink}</p>}
      {error && <p className="error">{error}</p>}
      <p>Status: <strong>{status}</strong></p>
      {status === "confirmed" && confirmedData && (
        <button
          onClick={() =>
            onConversationReady?.(
              confirmedData.conversationId,
              confirmedData.peerPublicKey,
            )
          }
        >
          Open Chat
        </button>
      )}
    </div>
  );
}

interface ScannerProps {
  apiBase: string;
  token: string;
  onConversationReady?: (conversationId: string, peerPublicKey: string) => void;
}

export function QRPairingScanner({ apiBase, token, onConversationReady }: ScannerProps) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);

  function normalizePairingCode(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || trimmed;
    } catch {
      const match = trimmed.match(/aethersync:\/\/pair\/([^\s/?#]+)/i) || trimmed.match(/baatein:\/\/pair\/([^\s/?#]+)/i);
      return match ? match[1] : trimmed;
    }
  }

  async function confirmPairing(pairingCode: string) {
    const normalizedCode = normalizePairingCode(pairingCode);
    if (!normalizedCode) {
      setResult("Enter a pairing code or deep link.");
      return;
    }

    const identity = await getOrCreateIdentityKeyPair();
    const res = await fetch(`${apiBase}/api/pairing/${normalizedCode}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ publicKey: identity.publicKey }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      setResult(errorText || "Pairing failed or expired.");
      return;
    }

    const data = await res.json();
    setResult("Device paired successfully!");
    if (onConversationReady) {
      onConversationReady(data.conversationId, data.peerPublicKey);
    }
  }

  return (
    <div className="pairing-scanner">
      <h2>Join via pairing code</h2>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste pairing code or deep link"
      />
      <button onClick={() => confirmPairing(code)}>Confirm pairing</button>
      {result && <p>{result}</p>}
    </div>
  );
}
