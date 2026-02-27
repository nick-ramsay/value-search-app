"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!email.trim() || !email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Request failed. Please try again.");
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="container py-5 d-flex justify-content-center align-items-center min-vh-100">
      <div className="row justify-content-center w-100">
        <div className="col-12 col-md-6 col-lg-5">
          <div className="text-center mb-4">
            <h1 className="glass-heading mb-2">valuesearch.app</h1>
            <p className="glass-subheading mb-0">
              Request a password reset
            </p>
          </div>
          <form onSubmit={handleSubmit} className="glass-panel p-4 p-md-5">
            <div className="mb-4">
              <label
                htmlFor="resetRequestEmail"
                className="form-label fw-medium"
              >
                Email address
              </label>
              <input
                type="email"
                className="form-control"
                id="resetRequestEmail"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="glass-alert glass-alert-danger mb-3" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="glass-alert glass-alert-success mb-3">
                Check your email for the reset code, then use the link below
                to reset your password.
              </div>
            )}
            <button
              type="submit"
              className="glass-btn glass-btn-primary w-100"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
          <div className="text-center mt-4 d-flex justify-content-center gap-3 flex-wrap">
            <Link href="/reset-password" className="glass-link">
              Enter reset code
            </Link>
            <Link href="/login" className="glass-link">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
