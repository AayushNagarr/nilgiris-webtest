import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full bg-surface border border-hairline rounded-sm px-3 py-2 text-sm
        text-mist placeholder:text-muted/70 outline-none focus:border-moss
        focus:ring-1 focus:ring-moss transition-colors ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";
