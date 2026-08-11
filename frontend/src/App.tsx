import { useEffect, useState } from "react";
import { WsClient } from "./ws/wsClient";

import { QRPairingHost, QRPairingScanner } from "./components/pairing/QRPairing";
import { SoundPairing } from "./components/pairing/SoundPairing";
import { WifiDiscovery } from "./components/pairing/WifiDiscovery";
import { NfcPairing } from "./components/pairing/NfcPairing";

import { ChatWindow } from "./components/chat/ChatWindow";
import { Login } from "./components/auth/Login";
import { ConnectPeople } from "./components/people/ConnectPeople";
import { UserProfileModal } from "./components/people/UserProfileModal";

import { CallOverlay } from "./components/modals/CallOverlay";
import { ToastContainer, showToast } from "./components/modals/ToastContainer";
import { EncryptionAuditorModal } from "./components/modals/EncryptionAuditorModal";
import { ArchitectureShowcaseModal } from "./components/modals/ArchitectureShowcaseModal";

const API_BASE = ""; // dev-server proxies /api to :4000
const WS_URL =
  location.hostname === "localhost" && location.port === "3000"
    ? "ws://localhost:4000/ws"
    : `${location.protocol === "https:" ? "wss://" : "ws://"}${location.host}/ws`;

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("aethersync_token") || localStorage.getItem("baatein_token"),
  );
  const [user, setUser] = useState<any>(null);
  const [ws, setWs] = useState<WsClient | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => localStorage.getItem("aethersync_active_conversation") || "",
  );
  const [peerPublicKey, setPeerPublicKey] = useState<string>(
    () => localStorage.getItem("aethersync_peer_public_key") || "",
  );
  const [view, setView] = useState<"chat" | "connect" | "pairing_hub">("chat");
  const [pairingMode, setPairingMode] = useState<"qr" | "code" | "sound" | "wifi" | "nfc">("qr");

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEncryptionModal, setShowEncryptionModal] = useState(false);
  const [showArchModal, setShowArchModal] = useState(false);
  const [theme, setTheme] = useState<"default" | "cyberpunk" | "emerald">("default");
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Audio / Video Calling State
  const [callState, setCallState] = useState<{
    active: boolean;
    type: "incoming" | "outgoing" | "connected";
    isVideo: boolean;
    peerId: string;
    peerName: string;
    callId: string;
  }>({
    active: false,
    type: "outgoing",
    isVideo: false,
    peerId: "",
    peerName: "",
    callId: "",
  });

  // Fetch session user profile
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          handleLogout();
        } else {
          return res.json();
        }
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          showToast("AetherSync Active", `Welcome ${data.user.displayName || data.user.username}`, "success");
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
          localStorage.setItem("aethersync_active_conversation", firstConversation._id);
        }
      })
      .catch(() => {});
  }, [token, activeConversationId]);

  function handleConversationReady(conversationId: string, key: string) {
    if (conversationId) {
      setActiveConversationId(conversationId);
      localStorage.setItem("aethersync_active_conversation", conversationId);
    }
    if (key) {
      setPeerPublicKey(key);
      localStorage.setItem("aethersync_peer_public_key", key);
    }
    setView("chat");
    showToast("Session Paired", "Encrypted AetherSync channel created!", "success");
  }

  function handleStartCall(isVideo: boolean) {
    setCallState({
      active: true,
      type: "outgoing",
      isVideo,
      peerId: "active_peer",
      peerName: "Chat Peer",
      callId: `call_${Date.now()}`,
    });

    showToast("Outgoing Call", `Ringing peer for ${isVideo ? "Video" : "Voice"} call...`, "call");

    setTimeout(() => {
      setCallState((prev) => (prev.active ? { ...prev, type: "connected" } : prev));
      showToast("Call Connected", "Live Encrypted Stream Active", "success");
    }, 2500);
  }

  function handleLogout() {
    localStorage.removeItem("aethersync_token");
    localStorage.removeItem("baatein_token");
    localStorage.removeItem("aethersync_active_conversation");
    localStorage.removeItem("aethersync_peer_public_key");
    setToken(null);
    setUser(null);
    setActiveConversationId("");
    setPeerPublicKey("");
    setWs(null);
    showToast("Logged Out", "Session safely terminated.", "info");
  }

  function cycleTheme() {
    const themes: ("default" | "cyberpunk" | "emerald")[] = ["default", "cyberpunk", "emerald"];
    const nextIdx = (themes.indexOf(theme) + 1) % themes.length;
    const nextTheme = themes[nextIdx];
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }

  if (!token) {
    return (
      <>
        <ToastContainer />
        <Login
          apiBase={API_BASE}
          onLoggedIn={(t, loggedInUser) => {
            localStorage.setItem("aethersync_token", t);
            setToken(t);
            if (loggedInUser) setUser(loggedInUser);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <ToastContainer />
      <header>
        <div className="brand-container">
          <span className="brand-logo">⚡</span>
          <h1>AetherSync</h1>
        </div>

        <nav>
          <button
            className={`nav-btn ${view === "chat" ? "active" : ""}`}
            onClick={() => setView("chat")}
          >
            💬 Chats
          </button>
          <button
            className={`nav-btn ${view === "connect" ? "active" : ""}`}
            onClick={() => setView("connect")}
          >
            👥 Discover &amp; Friends
            {pendingRequestsCount > 0 && <span className="nav-badge">{pendingRequestsCount}</span>}
          </button>
          <button
            className={`nav-btn ${view === "pairing_hub" ? "active" : ""}`}
            onClick={() => setView("pairing_hub")}
          >
            🔗 Pair Devices
          </button>

          <button className="nav-btn" onClick={() => setShowEncryptionModal(true)} title="Inspect E2EE Keys">
            🔐 Keys
          </button>

          <button className="nav-btn" onClick={() => setShowArchModal(true)} title="System Architecture & Resume Highlights">
            ⚡ Architecture
          </button>

          <button className="nav-btn" onClick={cycleTheme} title="Switch Theme">
            🎨 {theme === "default" ? "Deep Space" : theme === "cyberpunk" ? "Cyberpunk" : "Emerald"}
          </button>

          {user && (
            <div
              className="user-profile-chip"
              onClick={() => setShowProfileModal(true)}
              title="Edit Profile"
            >
              <div className="avatar-circle">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.displayName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  (user.displayName || user.username || "U").charAt(0).toUpperCase()
                )}
              </div>
              <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{user.displayName || user.username}</span>
            </div>
          )}

          <button onClick={handleLogout} className="nav-btn logout-btn">
            🚪 Logout
          </button>
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
            onStartCall={handleStartCall}
          />
        )}
        {view === "connect" && (
          <ConnectPeople
            apiBase={API_BASE}
            token={token}
            onOpenDirectChat={(_targetUserId, peerInfo) => {
              if (peerInfo?.identityPublicKey) {
                setPeerPublicKey(peerInfo.identityPublicKey);
              }
              setView("chat");
            }}
            onRefreshContactsCount={(count) => setPendingRequestsCount(count)}
          />
        )}
        {view === "pairing_hub" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "20px" }}>
            <div className="connect-nav-tabs" style={{ maxWidth: "680px", margin: "0 auto 20px auto" }}>
              <button
                className={`connect-nav-tab ${pairingMode === "qr" ? "active" : ""}`}
                onClick={() => setPairingMode("qr")}
              >
                📱 QR Code
              </button>
              <button
                className={`connect-nav-tab ${pairingMode === "code" ? "active" : ""}`}
                onClick={() => setPairingMode("code")}
              >
                🔑 Code / Link
              </button>
              <button
                className={`connect-nav-tab ${pairingMode === "sound" ? "active" : ""}`}
                onClick={() => setPairingMode("sound")}
              >
                🔊 Sound Wave
              </button>
              <button
                className={`connect-nav-tab ${pairingMode === "wifi" ? "active" : ""}`}
                onClick={() => setPairingMode("wifi")}
              >
                📡 Wi-Fi Subnet
              </button>
              <button
                className={`connect-nav-tab ${pairingMode === "nfc" ? "active" : ""}`}
                onClick={() => setPairingMode("nfc")}
              >
                📲 NFC Tap
              </button>
            </div>

            {pairingMode === "qr" && (
              <QRPairingHost
                apiBase={API_BASE}
                token={token}
                onConversationReady={handleConversationReady}
              />
            )}
            {pairingMode === "code" && (
              <QRPairingScanner
                apiBase={API_BASE}
                token={token}
                onConversationReady={handleConversationReady}
              />
            )}
            {pairingMode === "sound" && (
              <SoundPairing
                apiBase={API_BASE}
                token={token}
                onConversationReady={handleConversationReady}
              />
            )}
            {pairingMode === "wifi" && (
              <WifiDiscovery
                apiBase={API_BASE}
                token={token}
                onConversationReady={handleConversationReady}
              />
            )}
            {pairingMode === "nfc" && (
              <NfcPairing
                apiBase={API_BASE}
                token={token}
                onConversationReady={handleConversationReady}
              />
            )}
          </div>
        )}
      </main>

      {/* Call Overlay Modal */}
      <CallOverlay
        callState={callState}
        onAcceptCall={() => setCallState((prev) => ({ ...prev, type: "connected" }))}
        onRejectCall={() => setCallState((prev) => ({ ...prev, active: false }))}
        onEndCall={() => setCallState((prev) => ({ ...prev, active: false }))}
      />

      {/* User Profile Modal */}
      {showProfileModal && (
        <UserProfileModal
          apiBase={API_BASE}
          token={token}
          user={user}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={(updatedUser) => setUser(updatedUser)}
        />
      )}

      {/* E2EE Key Auditor Modal */}
      {showEncryptionModal && (
        <EncryptionAuditorModal
          onClose={() => setShowEncryptionModal(false)}
          peerPublicKey={peerPublicKey}
        />
      )}

      {/* System Architecture Modal */}
      {showArchModal && (
        <ArchitectureShowcaseModal
          onClose={() => setShowArchModal(false)}
        />
      )}
    </div>
  );
}
