import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/ThemeContext";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center rounded-md border-2 border-foreground/30 bg-card hover:bg-muted transition-colors size-9"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
