"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LoginForm from "./LoginForm";

export const LOGIN_MODAL_ID = "loginModal";

function closeModalAndBackdrop() {
  const modal = document.getElementById(LOGIN_MODAL_ID);
  const backdrop = document.querySelector(".modal-backdrop");
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.remove();
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.removeAttribute("inert");
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
}

export default function LoginModal() {
  const pathname = usePathname();

  useEffect(() => {
    closeModalAndBackdrop();
  }, [pathname]);

  return (
    <div
      className="modal fade login-modal"
      id={LOGIN_MODAL_ID}
      tabIndex={-1}
      aria-labelledby="loginModalLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header border-0 pb-0">
            <h2 className="modal-title glass-heading mb-0" id="loginModalLabel">
              Sign in
            </h2>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body pt-2">
            <LoginForm compact />
            <div className="d-flex align-items-center justify-content-center gap-3 flex-wrap mt-3">
              <Link href="/create-account-request" className="glass-link">
                Create account
              </Link>
              <Link href="/reset-password-request" className="glass-link">
                Reset password
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
