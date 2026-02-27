"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "valuesearch_create_account_email";

export default function CreateAccountPage() {
  const [verificationCode, setVerificationCode] = useState("");
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setEmail(stored);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (
      !verificationCode.trim() ||
      !firstname.trim() ||
      !lastname.trim() ||
      !email.trim()
    ) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          emailVerificationToken: verificationCode.trim(),
          firstname: firstname.trim(),
          lastname: lastname.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to create account.");
        setLoading(false);
        return;
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
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
            <p className="glass-subheading mb-0">Create an account</p>
          </div>
          <form onSubmit={handleSubmit} className="glass-panel p-4 p-md-5">
            <div className="mb-3">
              <label className="form-label fw-medium">
                Verification code
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Enter the code from your email"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">First name</label>
              <input
                type="text"
                className="form-control"
                placeholder="First name"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">Last name</label>
              <input
                type="text"
                className="form-control"
                placeholder="Last name"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label fw-medium">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="mb-4">
              <label className="form-label fw-medium">
                Confirm password
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="Confirm password"
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
              {loading ? "Creating account…" : "Create account"}
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
