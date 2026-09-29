import { useEffect, useState } from "react";

const KEY = "cb-theme";

function getInitial() {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
    // dark is the default (espresso hero mode) regardless of OS preference
    return "dark";
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
