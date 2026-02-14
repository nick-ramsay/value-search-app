/**
 * Runs before React hydrates so the chosen theme is applied immediately and avoids a flash.
 * Reads localStorage.theme and sets data-theme on <html> when value is "light" or "dark".
 */
export default function ThemeInitScript() {
  const script = `(function(){var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
