import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-moss text-base hover:bg-moss/90 border-transparent",
  ghost: "bg-transparent text-mist hover:bg-surface2 border-hairline",
  danger: "bg-transparent text-danger hover:bg-danger/10 border-hairline",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`px-4 py-2 rounded-sm border text-sm font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
