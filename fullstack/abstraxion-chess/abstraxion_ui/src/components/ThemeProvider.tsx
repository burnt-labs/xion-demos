"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Sun, Sparkles } from "lucide-react";

type Theme = "normal" | "party";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  isParty: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "normal",
  toggleTheme: () => {},
  isParty: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("normal");

  useEffect(() => {
    const stored = localStorage.getItem("chess-theme") as Theme | null;
    if (stored === "party") {
      setTheme("party");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "normal" ? "party" : "normal";
      localStorage.setItem("chess-theme", next);
      if (next === "party") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isParty: theme === "party" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        theme === "normal"
          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          : "bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/25"
      )}
    >
      {theme === "normal" ? (
        <>
          <Sparkles className="h-3.5 w-3.5" />
          Party Mode
        </>
      ) : (
        <>
          <Sun className="h-3.5 w-3.5" />
          Normal Mode
        </>
      )}
    </button>
  );
}
