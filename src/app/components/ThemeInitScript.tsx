/**
 * Runs before React hydrates so the chosen theme is applied immediately and avoids a flash.
 * Reads localStorage.theme and sets data-theme + data-bs-theme on <html> (taskboard-style).
 * Also reads localStorage['bg-theme'] (set by /settings — see that page) and applies it as
 * data-bg-theme, so a user's chosen background preset doesn't flash to the default on load.
 */
export default function ThemeInitScript() {
  const script = `(function(){var t=localStorage.getItem('theme');var el=document.documentElement;var resolved;if(t==='light'||t==='dark'){resolved=t;el.removeAttribute('data-theme-system');}else{resolved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';el.setAttribute('data-theme-system','true');}el.setAttribute('data-theme',resolved);el.setAttribute('data-bs-theme',resolved);var bg=localStorage.getItem('bg-theme');if(bg)el.setAttribute('data-bg-theme',bg);})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
