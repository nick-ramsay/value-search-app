"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "valuesearch_create_account_email";

export default function CreateAccountRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/create-account-request", {
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
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, email.trim().toLowerCase());
      }
      router.push("/create-account");
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
            <p className="glass-subheading mb-0">Request an account</p>
          </div>
          <form onSubmit={handleSubmit} className="glass-panel p-4 p-md-5">
            <div className="mb-4">
              <label
                htmlFor="createAccountRequestEmail"
                className="form-label fw-medium"
              >
                Email address
              </label>
              <input
                type="email"
                className="form-control"
                id="createAccountRequestEmail"
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
            <button
              type="submit"
              className="glass-btn glass-btn-primary w-100"
              disabled={loading}
            >
              {loading ? "Sending…" : "Request verification code"}
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
