import type { ButtonHTMLAttributes, CSSProperties } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

const baseStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export default function Button({
  loading,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        opacity: disabled || loading ? 0.6 : 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        ...style,
      }}
      onMouseOver={(e) => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--accent-hover)";
        }
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--accent)";
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
