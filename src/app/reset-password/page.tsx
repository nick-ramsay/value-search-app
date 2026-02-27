"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!email.trim() || !resetCode.trim()) {
      setError("Email and reset code are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          resetCode: resetCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to reset password.");
        setLoading(false);
        return;
      }
      router.push("/login");
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
            <p className="glass-subheading mb-0">Reset password</p>
          </div>
          <form onSubmit={handleSubmit} className="glass-panel p-4 p-md-5">
            <div className="mb-3">
              <label className="form-label fw-medium">Reset code</label>
              <input
                type="text"
                className="form-control"
                placeholder="Code from your email"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">New password</label>
              <input
                type="password"
                className="form-control"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="mb-4">
              <label className="form-label fw-medium">
                Confirm new password
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="glass-alert glass-alert-danger mb-3" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="glass-btn glass-btn-primary w-100"
              disabled={loading}
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
          <div className="text-center mt-4">
            <Link href="/login" className="glass-link">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
