"use client";

import { useEffect, useState } from "react";

type BackgroundTheme = "light" | "dark";
type BackgroundVariant = "gradient" | "solid";

type BackgroundOption = {
  id: string;
  label: string;
  description: string;
  theme: BackgroundTheme;
  variant: BackgroundVariant;
  preview: string;
};

/**
 * Ported verbatim from taskboard.work's own /settings page (same 22 preset
 * IDs, labels, and descriptions) — see globals.css's matching
 * `[data-theme][data-bg-theme]` blocks, which these ids/previews must stay
 * in sync with. The 5 dark solid previews below use the actual rendered
 * --bg-start values from globals.css rather than taskboard's own settings
 * page preview strings, which don't match its globals.css for those 5
 * (a pre-existing inconsistency in taskboard.work itself, not reproduced
 * here).
 */
const BACKGROUND_OPTIONS: BackgroundOption[] = [
  // Light mode – gradients
  {
    id: "light-sunrise-studio",
    label: "Sunrise Studio",
    description: "Peach and apricot blending into crisp sky blue.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #ffd2a0 0%, #ffe6b8 40%, #d6e8ff 100%)",
  },
  {
    id: "light-citrus-focus",
    label: "Citrus Focus",
    description: "Lemon and lime with a hint of teal.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #fff3b0 0%, #d7f7a8 40%, #c2f4e2 100%)",
  },
  {
    id: "light-lilac-ideas",
    label: "Lilac Ideas",
    description: "Soft lilac flowing into sky and mint.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #f0ddff 0%, #e0e7ff 40%, #d1f7ea 100%)",
  },
  {
    id: "light-mango-waves",
    label: "Mango Waves",
    description: "Mango orange, coral, and a cool blue finish.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #ffd6a3 0%, #ffb3b8 40%, #d3e6ff 100%)",
  },
  {
    id: "light-mint-notes",
    label: "Mint Notes",
    description: "Fresh mint and aqua with soft white.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #e7fff4 0%, #ccf5e7 40%, #d4f1ff 100%)",
  },
  {
    id: "light-sky-meadow",
    label: "Sky Meadow",
    description: "Sky blue from the top left easing into grass green at the bottom right.",
    theme: "light",
    variant: "gradient",
    preview: "linear-gradient(135deg, #c0e8ff 0%, #b2e8d4 40%, #b5df98 100%)",
  },
  // Dark mode – gradients
  {
    id: "dark-aurora-focus",
    label: "Aurora Focus",
    description: "Deep navy with teal and violet aurora streaks.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #050818 0%, #053047 40%, #221b4b 100%)",
  },
  {
    id: "dark-neon-ocean",
    label: "Neon Ocean",
    description: "Midnight blue with cyan and electric purple.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #020617 0%, #054960 40%, #312e81 100%)",
  },
  {
    id: "dark-midnight-grid",
    label: "Midnight Grid",
    description: "Graphite base with cool blue highlights.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #090b16 0%, #141827 40%, #1f2737 100%)",
  },
  {
    id: "dark-orchid-haze",
    label: "Orchid Haze",
    description: "Orchid violet blending into deep indigo.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #1b1028 0%, #261a3f 40%, #141a33 100%)",
  },
  {
    id: "dark-deep-space",
    label: "Deep Space",
    description: "Almost-black navy with a subtle teal core.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #02030b 0%, #050c20 40%, #0a1f2b 100%)",
  },
  {
    id: "dark-mars-descent",
    label: "Mars Descent",
    description: "Space black at the top left warming into rust Mars red at the bottom right.",
    theme: "dark",
    variant: "gradient",
    preview: "linear-gradient(135deg, #020203 0%, #1c0a08 40%, #9a301f 100%)",
  },
  // Light mode – solid colors
  {
    id: "light-soft-paper",
    label: "Soft Paper",
    description: "Neutral off-white, like a fresh notebook page.",
    theme: "light",
    variant: "solid",
    preview: "#f9f5ef",
  },
  {
    id: "light-oat",
    label: "Oat",
    description: "Warm oat tone with gentle contrast.",
    theme: "light",
    variant: "solid",
    preview: "#f3e3cf",
  },
  {
    id: "light-cloud-blue",
    label: "Cloud Blue",
    description: "Very light blue with a calm feel.",
    theme: "light",
    variant: "solid",
    preview: "#e5f1ff",
  },
  {
    id: "light-pale-rose",
    label: "Pale Rose",
    description: "Subtle rose tint to soften the canvas.",
    theme: "light",
    variant: "solid",
    preview: "#ffe8f1",
  },
  {
    id: "light-soft-mint",
    label: "Soft Mint",
    description: "Barely-there mint that stays out of the way.",
    theme: "light",
    variant: "solid",
    preview: "#e7fbf3",
  },
  // Dark mode – solid colors
  {
    id: "dark-ink",
    label: "Ink",
    description: "Almost-black ink blue for maximum focus.",
    theme: "dark",
    variant: "solid",
    preview: "#0f172a",
  },
  {
    id: "dark-charcoal",
    label: "Charcoal",
    description: "Smoky charcoal with soft contrast.",
    theme: "dark",
    variant: "solid",
    preview: "#1e293b",
  },
  {
    id: "dark-forest",
    label: "Forest",
    description: "Deep forest green that keeps accents bright.",
    theme: "dark",
    variant: "solid",
    preview: "#0d3329",
  },
  {
    id: "dark-deep-teal",
    label: "Deep Teal",
    description: "Teal-tinted midnight for a calm dashboard.",
    theme: "dark",
    variant: "solid",
    preview: "#0c3d4d",
  },
  {
    id: "dark-plum",
    label: "Plum",
    description: "Rich plum that still feels professional.",
    theme: "dark",
    variant: "solid",
    preview: "#3d1a4a",
  },
];

const STORAGE_KEY = "bg-theme";

function OptionGrid({
  options,
  selectedId,
  onSelect,
}: {
  options: BackgroundOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="row g-3">
      {options.map((option) => {
        const isActive = selectedId === option.id;
        const style =
          option.variant === "gradient"
            ? { backgroundImage: option.preview }
            : { background: option.preview };
        return (
          <div key={option.id} className="col-12 col-sm-6">
            <button
              type="button"
              className={`w-100 text-start glass-pill glass-pill-button bg-option-tile${isActive ? " bg-option-tile-active" : ""}`}
              onClick={() => onSelect(option.id)}
              style={style}
            >
              <span className="bg-option-swatch me-3" style={{ background: option.preview }} />
              <span className="d-flex flex-column bg-option-tile-body">
                <span className="fw-semibold small">{option.label}</span>
                <span className="glass-subheading small mb-0 bg-option-tile-desc">{option.description}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function SettingsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<BackgroundTheme>("light");

  useEffect(() => {
    const root = document.documentElement;

    const initialTheme = (root.getAttribute("data-theme") as BackgroundTheme | null) ?? "light";
    setCurrentTheme(initialTheme);

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initialId = stored && BACKGROUND_OPTIONS.some((o) => o.id === stored) ? stored : null;
    setSelectedId(initialId);

    // Picks up a light/dark toggle made elsewhere (e.g. the navbar's theme
    // switcher) while this page is open, so the gradient/solid sections
    // shown below stay in sync with the user's actual current mode.
    const observer = new MutationObserver(() => {
      const themeAttr = root.getAttribute("data-theme") as BackgroundTheme | null;
      if (themeAttr) setCurrentTheme(themeAttr);
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    document.documentElement.setAttribute("data-bg-theme", id);
  };

  const gradients = BACKGROUND_OPTIONS.filter(
    (o) => o.theme === currentTheme && o.variant === "gradient",
  );
  const solids = BACKGROUND_OPTIONS.filter(
    (o) => o.theme === currentTheme && o.variant === "solid",
  );

  return (
    <section className="card glass-card mt-4 mb-4" aria-label="Background theme">
      <div className="card-body">
        <h3 className="h6 mb-2">
          {currentTheme === "light" ? "Light mode gradients" : "Dark mode gradients"}
        </h3>
        <p className="glass-subheading mb-3">
          {currentTheme === "light"
            ? "Vibrant daytime gradients to inspire creativity and focus."
            : "Deep, cinematic palettes designed for late-night focus."}
        </p>
        <OptionGrid options={gradients} selectedId={selectedId} onSelect={handleSelect} />

        <h3 className="h6 mb-2 mt-4">
          {currentTheme === "light" ? "Light mode solids" : "Dark mode solids"}
        </h3>
        <p className="glass-subheading mb-3">
          {currentTheme === "light"
            ? "Calm flat colors that keep content in the spotlight."
            : "Flat, high-contrast colors for a distraction-free board."}
        </p>
        <OptionGrid options={solids} selectedId={selectedId} onSelect={handleSelect} />
      </div>
    </section>
  );
}
