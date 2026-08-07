import { useEffect, useState } from "react";
import { WsClient } from "./ws/wsClient";
import { QRPairingHost, QRPairingScanner } from "./pairing/QRPairing";
import { ChatWindow } from "./components/ChatWindow";
import { Login } from "./components/Login";

const API_BASE = ""; // dev-server proxies /api to :4000
const WS_URL =
  location.hostname === "localhost" && location.port === "3000"
    ? "ws://localhost:4000/ws"
    : `${location.protocol === "https:" ? "wss://" : "ws://"}${location.host}/ws`;

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("baatein_token"),
  );
  const [ws, setWs] = useState<WsClient | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => localStorage.getItem("baatein_active_conversation") || "",
  );
  const [peerPublicKey, setPeerPublicKey] = useState<string>(
    () => localStorage.getItem("baatein_peer_public_key") || "",
  );
  const [view, setView] = useState<"chat" | "pair-host" | "pair-scan">("chat");

  // Validate session token on mount/change
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          handleLogout();
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const client = new WsClient(WS_URL, () => token);
    client.connect();
    setWs(client);
    return () => client.close();
  }, [token]);

  useEffect(() => {
    if (!token || activeConversationId) return;

    fetch(`${API_BASE}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const firstConversation = data.conversations?.[0];
        if (firstConversation?._id) {
          setActiveConversationId(firstConversation._id);
          localStorage.setItem(
            "baatein_active_conversation",
            firstConversation._id,
          );
        }
      })
      .catch(() => {
        // Ignore conversation bootstrap errors; chat can still be started by pairing.
      });
  }, [token, activeConversationId]);

  function handleConversationReady(conversationId: string, key: string) {
    if (conversationId) {
      setActiveConversationId(conversationId);
      localStorage.setItem("baatein_active_conversation", conversationId);
    }
    if (key) {
      setPeerPublicKey(key);
      localStorage.setItem("baatein_peer_public_key", key);
    }
    setView("chat");
  }

  function handleLogout() {
    localStorage.removeItem("baatein_token");
    localStorage.removeItem("baatein_active_conversation");
    localStorage.removeItem("baatein_peer_public_key");
    setToken(null);
    setActiveConversationId("");
    setPeerPublicKey("");
    setWs(null);
  }

  if (!token) {
    return (
      <Login
        apiBase={API_BASE}
        onLoggedIn={(t) => {
          localStorage.setItem("baatein_token", t);
          setToken(t);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Baatein</h1>
        <nav>
          <button onClick={() => setView("chat")}>Chats</button>
          <button onClick={() => setView("pair-host")}>Pair new device</button>
          <button onClick={() => setView("pair-scan")}>Join via code</button>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </nav>
      </header>

      <main>
        {view === "chat" && (
          <ChatWindow
            apiBase={API_BASE}
            token={token}
            ws={ws}
            initialConversationId={activeConversationId}
            initialPeerPublicKey={peerPublicKey}
            onConversationReady={handleConversationReady}
          />
        )}
        {view === "pair-host" && (
          <QRPairingHost
            apiBase={API_BASE}
            token={token}
            onConversationReady={handleConversationReady}
          />
        )}
        {view === "pair-scan" && (
          <QRPairingScanner
            apiBase={API_BASE}
            token={token}
            onConversationReady={handleConversationReady}
          />
        )}
      </main>
    </div>
  );
}

