"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

type LoginFormProps = {
  callbackUrl?: string;
  onSuccess?: () => void;
  compact?: boolean;
};

export default function LoginForm({
  callbackUrl = "/portfolio",
  onSuccess,
  compact = false,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) {
        if (result.error === "CredentialsSignin") {
          setError("Invalid email or password.");
        } else if (result.error === "AccountNotApproved") {
          setError("Your account is not yet approved. Please contact support.");
        } else {
          setError(result.error);
        }
        setLoading(false);
        return;
      }
      onSuccess?.();
      if (typeof window !== "undefined") {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? "" : "glass-panel p-4 p-md-5"}>
      <div className="mb-3">
        <label htmlFor="loginEmail" className="form-label fw-medium">
          Email address
        </label>
        <input
          type="email"
          className="form-control"
          id="loginEmail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className={compact ? "mb-3" : "mb-4"}>
        <label htmlFor="loginPassword" className="form-label fw-medium">
          Password
        </label>
        <input
          type="password"
          className="form-control"
          id="loginPassword"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <button
        type="submit"
        className="glass-btn glass-btn-primary w-100 mb-3"
        disabled={loading}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <div className="glass-alert glass-alert-danger mb-3" role="alert">
          {error}
        </div>
      )}
      {!compact && (
        <div className="d-flex align-items-center justify-content-center gap-3 flex-wrap mt-3">
          <Link href="/create-account-request" className="glass-link">
            Create account
          </Link>
          <Link href="/reset-password-request" className="glass-link">
            Reset password
          </Link>
        </div>
      )}
    </form>
  );
}
