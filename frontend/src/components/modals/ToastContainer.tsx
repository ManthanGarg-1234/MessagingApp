import { useState, useEffect } from "react";

export interface ToastItem {
  id: string;
  type: "info" | "success" | "warning" | "call";
  title: string;
  message: string;
  duration?: number;
}

let toastListener: ((toast: ToastItem) => void) | null = null;

export function showToast(title: string, message: string, type: ToastItem["type"] = "info", duration = 4000) {
  if (toastListener) {
    toastListener({
      id: `toast_${Date.now()}_${Math.random()}`,
      type,
      title,
      message,
      duration,
    });
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListener = (newToast) => {
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration || 4000);
    };

    return () => {
      toastListener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 3000,
        maxWidth: "360px",
        width: "90%",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${
              t.type === "success"
                ? "var(--accent-emerald)"
                : t.type === "warning"
                ? "var(--accent-amber)"
                : t.type === "call"
                ? "var(--accent-rose)"
                : "var(--accent-cyan)"
            }`,
            borderRadius: "14px",
            padding: "14px 18px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            animation: "toastSlide 0.3s ease-out",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "700", fontSize: "0.95rem", color: "var(--accent-cyan)" }}>
              {t.title}
            </span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
          <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
