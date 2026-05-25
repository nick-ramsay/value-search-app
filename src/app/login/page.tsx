"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import LoginForm from "../components/LoginForm";

function LoginFormWrapper() {
  const searchParams = useSearchParams();
  const callbackUrl =
    searchParams.get("callbackUrl") || "/portfolio";

  return (
    <div className="container py-5 d-flex justify-content-center align-items-center min-vh-100">
      <div className="row justify-content-center w-100">
        <div className="col-12 col-md-6 col-lg-5">
          <div className="login-page__back-row">
            <Link href="/" className="login-page__back-link">
              <i className="bi bi-chevron-left" aria-hidden />
              valuesearch.app
            </Link>
          </div>
          <div className="text-center mb-4">
            <h1 className="glass-heading mb-2">Sign in</h1>
            <p className="glass-subheading mb-0">Welcome back</p>
          </div>
          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="d-flex justify-content-center align-items-center min-vh-100">
          <span
            className="spinner-border"
            style={{ color: "var(--accent)" }}
            role="status"
          >
            <span className="visually-hidden">Loading…</span>
          </span>
        </div>
      }
    >
      <LoginFormWrapper />
    </Suspense>
  );
}
