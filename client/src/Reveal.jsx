import { useEffect, useRef, useState } from "react";

export default function Reveal({ children, delay = 0, as: Tag = "div" }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                    node.dataset.revealDone = "true";
                }
            },
            { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return (
        <Tag
            ref={ref}
            className={`reveal${visible ? " is-visible" : ""}`}
            style={delay ? { transitionDelay: `${delay}ms` } : undefined}
        >
            {children}
        </Tag>
    );
}
