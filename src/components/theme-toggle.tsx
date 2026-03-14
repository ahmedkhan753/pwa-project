"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Prevent hydration mismatch by only rendering after mount
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <button className="p-2.5 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-all w-10 h-10">
                <span className="sr-only">Toggle theme</span>
            </button>
        );
    }

    return (
        <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="p-2.5 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-all active:scale-95 relative flex items-center justify-center overflow-hidden w-10 h-10"
            aria-label="Toggle theme"
        >
            <Sun className="h-5 w-5 text-slate-600 dark:text-slate-400 absolute transition-all duration-300 transform dark:-rotate-90 dark:opacity-0 hover:text-amber-500" />
            <Moon className="h-5 w-5 text-slate-600 dark:text-slate-400 absolute transition-all duration-300 transform rotate-90 opacity-0 dark:rotate-0 dark:opacity-100 dark:hover:text-blue-400" />
        </button>
    );
}
