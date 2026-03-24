"use client";

import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={["theme-toggle-btn", className ?? ""].filter(Boolean).join(" ")}
      onClick={toggleTheme}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "Kalor në modalitet të çelët" : "Kalor në modalitet të errët"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
