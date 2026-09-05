import type { ButtonHTMLAttributes, CSSProperties } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

const baseStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--brand)",
  color: "var(--paper)",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-body)",
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
        opacity: disabled || loading ? 0.5 : 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
