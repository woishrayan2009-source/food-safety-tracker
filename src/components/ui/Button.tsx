import type { ButtonHTMLAttributes, CSSProperties } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

// Primary action reads like a stamp: solid ink fill, sharp corners, no
// gradient. Hover shifts to the brand green rather than a lighter tint of
// the same blue, so "in progress" vs "confirmed" stay visually distinct.
const baseStyle: CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--ink)",
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
      onMouseOver={(e) => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--brand)";
        }
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--ink)";
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
