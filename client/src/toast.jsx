import { createContext, useCallback, useContext, useState } from "react";
import { CheckIcon, CloseIcon } from "./icons.jsx";

const ToastContext = createContext(() => {});

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const push = useCallback((message, type = "info") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((t) => [...t, { id, message, type }]);
        setTimeout(() => {
            setToasts((t) => t.filter((toast) => toast.id !== id));
        }, 3200);
    }, []);

    return (
        <ToastContext.Provider value={push}>
            {children}
            <div className="toasts" aria-live="polite">
                {toasts.map(({ id, message, type }) => (
                    <div key={id} className={`toast${type === "error" ? " error" : ""}`}>
                        <span aria-hidden="true">
                            {type === "error" ? (
                                <CloseIcon size={14} />
                            ) : (
                                <CheckIcon size={14} />
                            )}
                        </span>
                        {message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
