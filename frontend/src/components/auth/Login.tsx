import React, { useState, useEffect } from "react";
import { getOrCreateIdentityKeyPair } from "../../crypto/e2ee";

export function Login({ apiBase, onLoggedIn }: { apiBase: string; onLoggedIn: (token: string, user?: any) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google OAuth Quick Sign-In Modal
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState("");
  const [googleNameInput, setGoogleNameInput] = useState("");

  // Initialize GIS if google script is loaded
  useEffect(() => {
    if ((window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: "100000000000-example.apps.googleusercontent.com",
          callback: handleGoogleCredentialResponse,
        });
      } catch {
        // ignore
      }
    }
  }, []);

  async function handleGoogleCredentialResponse(response: any) {
    if (!response?.credential) return;
    setLoading(true);
    setError(null);
    try {
      const identity = await getOrCreateIdentityKeyPair();
      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: response.credential,
          identityPublicKey: identity.publicKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google Authentication failed");
      onLoggedIn(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body: Record<string, unknown> = {};

      if (mode === "login") {
        if (!emailOrUsername.trim() || !password) {
          throw new Error("Please fill in all required fields.");
        }
        body.emailOrUsername = emailOrUsername.trim();
        body.password = password;
      } else {
        if (!username.trim() || !password) {
          throw new Error("Username and password are required.");
        }
        body.username = username.trim();
        body.email = email.trim() || undefined;
        body.displayName = displayName.trim() || username.trim();
        body.password = password;

        const identity = await getOrCreateIdentityKeyPair();
        body.identityPublicKey = identity.publicKey;
      }

      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { error: res.statusText || "Server response error" };
      }

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      onLoggedIn(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogleOAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!googleEmailInput.trim()) {
      setError("Please enter a valid Google email address.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const identity = await getOrCreateIdentityKeyPair();
      const emailClean = googleEmailInput.trim().toLowerCase();
      const nameClean = googleNameInput.trim() || emailClean.split("@")[0];

      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailClean,
          name: nameClean,
          googleId: `g_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(emailClean)}`,
          identityPublicKey: identity.publicKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Google Sign-In failed");
      }

      setShowGoogleModal(false);
      onLoggedIn(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Google OAuth error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="login-form">
        <div className="auth-header-block">
          <h2>AetherSync</h2>
          <p>End-to-End Encrypted Communications &amp; Social Nexus</p>
        </div>

        <div className="auth-tab-row">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(null); }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => { setMode("signup"); setError(null); }}
          >
            Sign Up
          </button>
        </div>

        <button
          type="button"
          className="google-auth-btn"
          onClick={() => { setShowGoogleModal(true); setError(null); }}
          disabled={loading}
        >
          <svg className="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          {mode === "login" ? "Sign in with Google Mail" : "Sign up with Google Mail"}
        </button>

        <div className="divider-line">
          <span>OR</span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {mode === "login" ? (
            <div className="input-group">
              <label className="input-label">Email or Username</label>
              <div className="input-field-wrapper">
                <input
                  type="text"
                  placeholder="name@gmail.com or username"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : (
            <>
              <div className="input-group">
                <label className="input-label">Username *</label>
                <div className="input-field-wrapper">
                  <input
                    type="text"
                    placeholder="e.g. alex_dev"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Email Address (Optional)</label>
                <div className="input-field-wrapper">
                  <input
                    type="email"
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Display Name</label>
                <div className="input-field-wrapper">
                  <input
                    type="text"
                    placeholder="e.g. Alex Rivers"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="input-group">
            <label className="input-label">Password *</label>
            <div className="input-field-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="input-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div className="auth-error-msg">{error}</div>}

          <button type="submit" className="submit-auth-btn" disabled={loading}>
            {loading ? "Processing..." : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>
      </div>

      {/* GOOGLE OAUTH EMAIL POPUP MODAL */}
      {showGoogleModal && (
        <div className="modal-backdrop" onClick={() => setShowGoogleModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg className="google-icon" viewBox="0 0 24 24" style={{ width: "24px", height: "24px" }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Google Mail OAuth Sign-In</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowGoogleModal(false)}>✕</button>
            </div>

            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              Enter your Google Mail address below to instantly authenticate and generate your client-side E2EE keypair.
            </p>

            {error && <div className="auth-error-msg">{error}</div>}

            <form onSubmit={submitGoogleOAuth} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="input-group">
                <label className="input-label">Google Email ID *</label>
                <div className="input-field-wrapper">
                  <input
                    type="email"
                    placeholder="your.name@gmail.com"
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Full Name (Optional)</label>
                <div className="input-field-wrapper">
                  <input
                    type="text"
                    placeholder="e.g. Alex Rivers"
                    value={googleNameInput}
                    onChange={(e) => setGoogleNameInput(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="submit-auth-btn" disabled={loading}>
                {loading ? "Authenticating..." : "Continue with Google Mail"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
