/**
 * Runs before React hydrates so the chosen theme is applied immediately and avoids a flash.
 * Reads localStorage.theme and sets data-theme + data-bs-theme on <html> (taskboard-style).
 */
export default function ThemeInitScript() {
  const script = `(function(){var t=localStorage.getItem('theme');var el=document.documentElement;if(t==='light'||t==='dark'){el.setAttribute('data-theme',t);el.setAttribute('data-bs-theme',t);}else{el.setAttribute('data-bs-theme',window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
