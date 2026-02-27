"use client";

import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "theme";
type Theme = "light" | "dark" | "system";

function applyTheme(value: Theme) {
  const root = document.documentElement;
  if (value === "system") {
    root.removeAttribute("data-theme");
    root.setAttribute(
      "data-bs-theme",
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
  } else {
    root.setAttribute("data-theme", value);
    root.setAttribute("data-bs-theme", value);
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

  const optionClass = "dropdown-item d-flex align-items-center gap-2";
  const options = (
    <>
      <li>
        <button
          type="button"
          className={optionClass}
          onClick={() => setTheme("light")}
        >
          {theme === "light" ? (
            <i className="bi bi-check-lg theme-dropdown-check" aria-hidden />
          ) : (
            <span className="theme-dropdown-check-placeholder" aria-hidden />
          )}
          Light
        </button>
      </li>
      <li>
        <button
          type="button"
          className={optionClass}
          onClick={() => setTheme("dark")}
        >
          {theme === "dark" ? (
            <i className="bi bi-check-lg theme-dropdown-check" aria-hidden />
          ) : (
            <span className="theme-dropdown-check-placeholder" aria-hidden />
          )}
          Dark
        </button>
      </li>
      <li>
        <button
          type="button"
          className={optionClass}
          onClick={() => setTheme("system")}
        >
          {theme === "system" ? (
            <i className="bi bi-check-lg theme-dropdown-check" aria-hidden />
          ) : (
            <span className="theme-dropdown-check-placeholder" aria-hidden />
          )}
          System
        </button>
      </li>
    </>
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
