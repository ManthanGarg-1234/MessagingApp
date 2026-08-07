import React, { useState } from "react";
import { getOrCreateIdentityKeyPair } from "../crypto/e2ee";

export function Login({ apiBase, onLoggedIn }: { apiBase: string; onLoggedIn: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body: Record<string, unknown> = { username, password };

      if (mode === "signup") {
        // Identity keypair is generated client-side; only the public half is sent.
        const identity = await getOrCreateIdentityKeyPair();
        body.identityPublicKey = identity.publicKey;
        body.displayName = username;
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
        data = { error: res.statusText || "Server error" };
      }

      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      onLoggedIn(data.token);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <h1>Baatein</h1>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
      <button type="submit">{mode === "login" ? "Log in" : "Sign up"}</button>
      <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
