"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const isDev = process.env.NODE_ENV === "development";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const router = useRouter();

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    } else {
      setMessage("Check your email for a login link.");
    }
  }

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "100px auto", padding: "0 20px" }}>
      <h1>Agent Call Admin</h1>

      {!usePassword ? (
        <form onSubmit={handleMagicLink}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: 4 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePasswordLogin}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email-pw" style={{ display: "block", marginBottom: 4 }}>
              Email
            </label>
            <input
              id="email-pw"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="password" style={{ display: "block", marginBottom: 4 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}

      {isDev && (
        <button
          type="button"
          onClick={() => setUsePassword((v) => !v)}
          style={{ marginTop: 12, padding: "4px 8px", fontSize: 12, opacity: 0.6 }}
        >
          {usePassword ? "Use magic link" : "Dev: use password login"}
        </button>
      )}

      {message && <p style={{ color: "green", marginTop: 12 }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
    </main>
  );
}
