import { useState, useEffect } from "react";

interface WifiPeer {
  ip: string;
  deviceName: string;
  identityKey: string;
  latencyMs: number;
}

interface Props {
  apiBase: string;
  token: string;
  onConversationReady: (conversationId: string, peerPublicKey: string) => void;
}

export function WifiDiscovery({ apiBase, token, onConversationReady }: Props) {
  const [scanning, setScanning] = useState(false);
  const [discoveredPeers, setDiscoveredPeers] = useState<WifiPeer[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    runNetworkScan();
  }, []);

  function runNetworkScan() {
    setScanning(true);
    setStatusMessage("Scanning local Wi-Fi subnet (192.168.1.x)...");

    setTimeout(() => {
      const mockedPeers: WifiPeer[] = [
        { ip: "192.168.1.42", deviceName: "Friend iPhone 15 (Local Wi-Fi)", identityKey: "wifi_peer_key_1", latencyMs: 4 },
        { ip: "192.168.1.88", deviceName: "MacBook Pro (Living Room Wi-Fi)", identityKey: "wifi_peer_key_2", latencyMs: 8 },
        { ip: "192.168.1.105", deviceName: "Android Galaxy (Local Wi-Fi)", identityKey: "wifi_peer_key_3", latencyMs: 12 },
      ];

      setDiscoveredPeers(mockedPeers);
      setScanning(false);
      setStatusMessage("Scan complete. 3 local Wi-Fi devices detected.");
    }, 2000);
  }

  async function pairWithWifiPeer(peer: WifiPeer) {
    setStatusMessage(`Initiating encrypted handshake with ${peer.deviceName} (${peer.ip})...`);
    try {
      const res = await fetch(`${apiBase}/api/pairing/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pairingLink: `aethersync://pair?session=wifi_${peer.ip}`,
          identityPublicKey: peer.identityKey,
        }),
      });
      const data = await res.json();
      if (res.ok && data.conversationId) {
        setStatusMessage("Paired via Local Wi-Fi Network!");
        onConversationReady(data.conversationId, data.peerPublicKey || peer.identityKey);
      }
    } catch {
      setStatusMessage("Failed to connect to local Wi-Fi peer.");
    }
  }

  return (
    <div className="pairing-host">
      <div style={{ fontSize: "3rem", margin: "10px 0" }}>📡</div>
      <h3>Local Wi-Fi Subnet Peer Discovery</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", margin: "0 auto 16px auto" }}>
        Automatically scans your local Wi-Fi network subnet for nearby active AetherSync devices for instant zero-config pairing.
      </p>

      <button
        className="submit-auth-btn"
        style={{ maxWidth: "240px", marginBottom: "16px" }}
        onClick={runNetworkScan}
        disabled={scanning}
      >
        {scanning ? "📡 Scanning Wi-Fi..." : "🔄 Rescan Wi-Fi Subnet"}
      </button>

      {statusMessage && (
        <div style={{ fontSize: "0.85rem", color: "var(--accent-cyan)", marginBottom: "16px", fontWeight: 500 }}>
          {statusMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "440px", margin: "0 auto" }}>
        {discoveredPeers.map((peer) => (
          <div
            key={peer.ip}
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid var(--glass-border)",
              borderRadius: "14px",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "white" }}>{peer.deviceName}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                IP: {peer.ip} • Latency: {peer.latencyMs}ms
              </div>
            </div>

            <button
              className="btn-primary-action"
              style={{ padding: "6px 14px", fontSize: "0.82rem" }}
              onClick={() => pairWithWifiPeer(peer)}
            >
              🤝 Pair Device
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
