import { useState } from "react";

interface Props {
  apiBase: string;
  token: string;
  user: any;
  onClose: () => void;
  onProfileUpdated: (updatedUser: any) => void;
}

const PRESET_STATUSES = [
  "Online 🟢",
  "Working on code 💻",
  "Listening to music 🎵",
  "Gaming lounge 🎮",
  "Drinking coffee ☕",
  "Do Not Disturb 🚫",
];

const PRESET_TAGS = ["React", "TypeScript", "Node.js", "AI & ML", "Gaming", "Music", "Design", "Open Source"];

export function UserProfileModal({ apiBase, token, user, onClose, onProfileUpdated }: Props) {
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || "");
  const [bio, setBio] = useState(user?.bio || "Hey there! I am using AetherSync.");
  const [customStatus, setCustomStatus] = useState(user?.customStatus || "Online 🟢");
  const [interests, setInterests] = useState<string[]>(user?.interests || ["React", "Music"]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleInterest(tag: string) {
    if (interests.includes(tag)) {
      setInterests(interests.filter((t) => t !== tag));
    } else {
      setInterests([...interests, tag]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/users/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          bio,
          customStatus,
          interests,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        setMessage("Profile updated successfully!");
        onProfileUpdated(data.user);
        setTimeout(() => onClose(), 1000);
      } else {
        setMessage(data.error || "Failed to update profile.");
      }
    } catch {
      setMessage("Error updating profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Profile</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {message && (
          <div className="auth-error-msg" style={{ background: "rgba(16,185,129,0.15)", borderColor: "var(--accent-emerald)", color: "var(--accent-emerald)" }}>
            {message}
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Display Name</label>
          <div className="input-field-wrapper">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Custom Status</label>
          <div className="input-field-wrapper">
            <select
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid var(--glass-border)",
                color: "white",
                padding: "12px",
                borderRadius: "10px",
                fontSize: "0.95rem",
              }}
            >
              {PRESET_STATUSES.map((st) => (
                <option key={st} value={st} style={{ background: "#0f172a" }}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Bio</label>
          <div className="input-field-wrapper">
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid var(--glass-border)",
                color: "white",
                padding: "12px",
                borderRadius: "10px",
                fontSize: "0.95rem",
                fontFamily: "var(--font-family)",
                resize: "none",
              }}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Interests &amp; Skills</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
            {PRESET_TAGS.map((tag) => {
              const active = interests.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className="interest-tag"
                  style={{
                    cursor: "pointer",
                    background: active ? "var(--accent-cyan)" : "rgba(255,255,255,0.06)",
                    color: active ? "#0f172a" : "var(--text-main)",
                    fontWeight: active ? "700" : "500",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  #{tag} {active ? "✓" : "+"}
                </button>
              );
            })}
          </div>
        </div>

        <button className="submit-auth-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Profile Changes"}
        </button>
      </div>
    </div>
  );
}
