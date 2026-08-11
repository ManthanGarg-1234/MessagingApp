import { useState, useEffect } from "react";

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar?: string;
  bio?: string;
  customStatus?: string;
  presence?: { online: boolean };
  interests?: string[];
  connectionState?: "none" | "friends" | "incoming_request" | "outgoing_request";
}

interface FriendRequest {
  requestId: string;
  fromUser: UserProfile;
  createdAt: string;
}

interface ChannelItem {
  _id: string;
  name: string;
  description: string;
  topic: string;
  icon: string;
  members: string[];
}

interface Props {
  apiBase: string;
  token: string;
  onOpenDirectChat: (targetUserId: string, targetPeerInfo?: any) => void;
  onRefreshContactsCount?: (count: number) => void;
}

export function ConnectPeople({ apiBase, token, onOpenDirectChat, onRefreshContactsCount }: Props) {
  const [activeTab, setActiveTab] = useState<"search" | "friends" | "requests" | "channels">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchContacts();
    fetchChannels();
  }, []);

  async function fetchContacts() {
    try {
      const res = await fetch(`${apiBase}/api/users/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setFriends(data.friends || []);
        setPendingRequests(data.pendingRequests || []);
        if (onRefreshContactsCount) {
          onRefreshContactsCount(data.pendingRequests?.length || 0);
        }
      }
    } catch {
      // ignore
    }
  }

  async function fetchChannels() {
    try {
      const res = await fetch(`${apiBase}/api/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels || []);
      }
    } catch {
      // ignore
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function sendFriendRequest(targetUserId: string) {
    try {
      const res = await fetch(`${apiBase}/api/users/friend-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage("Friend request sent!");
        setTimeout(() => setActionMessage(null), 3000);
        setSearchResults((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, connectionState: "outgoing_request" } : u))
        );
      } else {
        setActionMessage(data.error || "Failed to send friend request");
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch {
      setActionMessage("Error sending request");
      setTimeout(() => setActionMessage(null), 3000);
    }
  }

  async function respondFriendRequest(fromUserId: string, action: "accept" | "decline") {
    try {
      const res = await fetch(`${apiBase}/api/users/friend-response`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fromUserId, action }),
      });
      if (res.ok) {
        setActionMessage(action === "accept" ? "Friend request accepted!" : "Request declined");
        setTimeout(() => setActionMessage(null), 3000);
        fetchContacts();
      }
    } catch {
      // ignore
    }
  }

  async function startDirectChatWithUser(user: UserProfile) {
    try {
      const res = await fetch(`${apiBase}/api/users/direct-chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetUserId: user.id }),
      });
      const data = await res.json();
      if (res.ok && data.conversationId) {
        onOpenDirectChat(user.id, data.peer);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="connect-container">
      <div className="connect-header">
        <div className="connect-header-title">
          <h2>Connect &amp; Discover</h2>
          <p>Find new friends, start direct encrypted chats, or join interest hubs</p>
        </div>

        <div className="connect-nav-tabs">
          <button
            className={`connect-nav-tab ${activeTab === "search" ? "active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            🔍 Discover People
          </button>
          <button
            className={`connect-nav-tab ${activeTab === "friends" ? "active" : ""}`}
            onClick={() => { setActiveTab("friends"); fetchContacts(); }}
          >
            👥 Friends ({friends.length})
          </button>
          <button
            className={`connect-nav-tab ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => { setActiveTab("requests"); fetchContacts(); }}
          >
            📬 Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </button>
          <button
            className={`connect-nav-tab ${activeTab === "channels" ? "active" : ""}`}
            onClick={() => { setActiveTab("channels"); fetchChannels(); }}
          >
            🌐 Public Hubs
          </button>
        </div>
      </div>

      {actionMessage && <div className="auth-error-msg" style={{ background: "rgba(6,182,212,0.15)", borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}>{actionMessage}</div>}

      {/* DISCOVER SEARCH TAB */}
      {activeTab === "search" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <form className="search-box-large" onSubmit={handleSearch}>
            <span className="search-icon-inside">🔍</span>
            <input
              type="text"
              placeholder="Search by username, email, display name, or interest (e.g. React, Music, Gaming)..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); }}
            />
          </form>

          {loading && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Searching users...</p>}

          {searchResults.length === 0 && searchQuery.trim() !== "" && !loading && (
            <p style={{ color: "var(--text-muted)", textAlign: "center" }}>No users found matching "{searchQuery}"</p>
          )}

          {searchResults.length === 0 && searchQuery.trim() === "" && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🤝</div>
              <h3 style={{ color: "white", margin: "0 0 8px 0" }}>Start Searching to Connect</h3>
              <p style={{ margin: 0 }}>Type a name or keyword above to find people on AetherSync.</p>
            </div>
          )}

          <div className="user-grid">
            {searchResults.map((user) => (
              <div key={user.id} className="user-card">
                <div className="user-card-top">
                  <div className="user-card-avatar">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.displayName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      user.displayName.charAt(0).toUpperCase()
                    )}
                    <span className={`presence-dot ${user.presence?.online ? "online" : "offline"}`} />
                  </div>
                  <div className="user-card-info">
                    <h3>{user.displayName}</h3>
                    <div className="user-card-username">@{user.username}</div>
                    <div className="user-card-status">⚡ {user.customStatus || "Online"}</div>
                  </div>
                </div>

                <p className="user-card-bio">{user.bio || "No bio provided yet."}</p>

                {user.interests && user.interests.length > 0 && (
                  <div className="user-card-interests">
                    {user.interests.map((tag, idx) => (
                      <span key={idx} className="interest-tag">#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="user-card-actions">
                  {user.connectionState === "friends" ? (
                    <button className="btn-primary-action" onClick={() => startDirectChatWithUser(user)}>
                      💬 Message
                    </button>
                  ) : user.connectionState === "outgoing_request" ? (
                    <button className="btn-secondary-action" disabled style={{ opacity: 0.7 }}>
                      ⏳ Request Sent
                    </button>
                  ) : user.connectionState === "incoming_request" ? (
                    <button className="btn-primary-action" onClick={() => respondFriendRequest(user.id, "accept")}>
                      ✓ Accept Request
                    </button>
                  ) : (
                    <>
                      <button className="btn-primary-action" onClick={() => sendFriendRequest(user.id)}>
                        ➕ Add Friend
                      </button>
                      <button className="btn-secondary-action" onClick={() => startDirectChatWithUser(user)}>
                        💬 Chat
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FRIENDS LIST TAB */}
      {activeTab === "friends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {friends.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>👥</div>
              <h3 style={{ color: "white", margin: "0 0 8px 0" }}>No Friends Yet</h3>
              <p style={{ margin: 0 }}>Use the "Discover People" tab to find and add friends!</p>
            </div>
          ) : (
            <div className="user-grid">
              {friends.map((user) => (
                <div key={user.id} className="user-card">
                  <div className="user-card-top">
                    <div className="user-card-avatar">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.displayName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        user.displayName.charAt(0).toUpperCase()
                      )}
                      <span className={`presence-dot ${user.presence?.online ? "online" : "offline"}`} />
                    </div>
                    <div className="user-card-info">
                      <h3>{user.displayName}</h3>
                      <div className="user-card-username">@{user.username}</div>
                      <div className="user-card-status">⚡ {user.customStatus || (user.presence?.online ? "Online" : "Offline")}</div>
                    </div>
                  </div>

                  <p className="user-card-bio">{user.bio || "No bio provided."}</p>

                  <div className="user-card-actions">
                    <button className="btn-primary-action" onClick={() => startDirectChatWithUser(user)}>
                      💬 Start Encrypted Chat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PENDING REQUESTS TAB */}
      {activeTab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {pendingRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📭</div>
              <h3 style={{ color: "white", margin: "0 0 8px 0" }}>No Pending Friend Requests</h3>
              <p style={{ margin: 0 }}>When someone sends you a friend request, it will appear here.</p>
            </div>
          ) : (
            <div className="user-grid">
              {pendingRequests.map((req) => (
                <div key={req.requestId} className="user-card">
                  <div className="user-card-top">
                    <div className="user-card-avatar">
                      {req.fromUser.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-card-info">
                      <h3>{req.fromUser.displayName}</h3>
                      <div className="user-card-username">@{req.fromUser.username}</div>
                    </div>
                  </div>
                  <div className="user-card-actions">
                    <button className="btn-primary-action" onClick={() => respondFriendRequest(req.fromUser.id, "accept")}>
                      ✓ Accept
                    </button>
                    <button className="btn-secondary-action" onClick={() => respondFriendRequest(req.fromUser.id, "decline")}>
                      ✕ Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PUBLIC CHANNELS TAB */}
      {activeTab === "channels" && (
        <div className="channel-grid">
          {channels.map((chan) => (
            <div key={chan._id} className="channel-card">
              <div className="channel-icon">{chan.icon || "🌐"}</div>
              <h3 className="channel-title">{chan.name}</h3>
              <p className="channel-desc">{chan.description}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                <span className="interest-tag">Topic: {chan.topic}</span>
                <button
                  className="btn-primary-action"
                  onClick={() => onOpenDirectChat(`channel:${chan._id}`, { displayName: chan.name, isChannel: true })}
                >
                  Join Room
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
