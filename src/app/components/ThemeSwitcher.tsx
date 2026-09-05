"use client";

import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "theme";
type Theme = "light" | "dark" | "system";

function applyTheme(value: Theme) {
  const root = document.documentElement;
  const resolved =
    value === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : value;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-bs-theme", resolved);
  if (value === "system") {
    root.setAttribute("data-theme-system", "true");
  } else {
    root.removeAttribute("data-theme-system");
  }
}

type ThemeSwitcherProps = {
  /** When true, render only the theme options (for embedding inside another dropdown) */
  inline?: boolean;
};

export default function ThemeSwitcher({ inline = false }: ThemeSwitcherProps) {
  const [theme, setThemeState] = useState<Theme>("system");

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    if (value === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, value);
    }
    applyTheme(value);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const initial: Theme =
      stored === "light" || stored === "dark" ? stored : "system";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const themeChoices: { value: Theme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "bi-sun-fill" },
    { value: "dark", label: "Dark", icon: "bi-moon-stars-fill" },
    { value: "system", label: "System", icon: "bi-circle-half" },
  ];

  const options = (
    <li className="px-2 py-1">
      <div className="theme-toggle-group" role="group" aria-label="Theme">
        {themeChoices.map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            className={`theme-toggle-btn${theme === value ? " active" : ""}`}
            aria-pressed={theme === value}
            onClick={(event) => {
              // Bootstrap's dropdown auto-close listener is bound to document at the
              // same node React delegates events to, so plain stopPropagation() doesn't
              // stop it from also seeing this click — stopImmediatePropagation() does.
              event.nativeEvent.stopImmediatePropagation();
              event.stopPropagation();
              setTheme(value);
            }}
          >
            <i className={`bi ${icon}`} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </li>
  );

  if (inline) {
    return <>{options}</>;
  }

  return (
    <div className="dropdown">
      <button
        type="button"
        className="btn btn-sm theme-switcher-btn dropdown-toggle"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-label="Choose theme"
        title="Theme"
      >
        <i className="bi bi-circle-half" aria-hidden />
      </button>
      <ul className="dropdown-menu dropdown-menu-end theme-dropdown">
        {options}
      </ul>
    </div>
  );
}
