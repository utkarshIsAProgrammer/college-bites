import { useEffect, useState } from "react";

const KEY = "cb-theme";

function getInitial() {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export default function useTheme() {
    const [theme, setTheme] = useState(getInitial);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(KEY, theme);
    }, [theme]);

    const toggle = () =>
        setTheme((t) => (t === "dark" ? "light" : "dark"));

    return { theme, toggle };
}
