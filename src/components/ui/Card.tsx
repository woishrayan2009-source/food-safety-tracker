import type { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 32,
  width: "100%",
  maxWidth: 400,
  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
};

export default function Card({ children, style, className }: CardProps) {
  return (
    <div className={className} style={{ ...cardStyle, ...style }}>
      {children}
    </div>
  );
}
