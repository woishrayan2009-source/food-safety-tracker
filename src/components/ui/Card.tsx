import type { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

// The "label panel": sharp corners, a heavy top rule and a fine bottom rule,
// echoing the printed border of a Nutrition Facts panel rather than a
// generic soft-shadowed SaaS card.
const cardStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderTop: "4px solid var(--line-strong)",
  borderRadius: "var(--radius)",
  padding: "24px",
  width: "100%",
  maxWidth: 400,
  boxShadow: "none",
};

export default function Card({ children, style, className }: CardProps) {
  return (
    <div className={className} style={{ ...cardStyle, ...style }}>
      {children}
    </div>
  );
}
