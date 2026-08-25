import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  {
    variants: {
      variant: {
        primary: "bg-success text-white hover:brightness-110",
        secondary: "bg-surface-hover text-foreground hover:bg-border",
        danger: "bg-danger text-white hover:brightness-110",
        ghost: "bg-transparent text-foreground hover:bg-surface-hover",
        outline: "border border-border bg-transparent text-foreground hover:bg-surface-hover",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11",
        lg: "h-12 text-base px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";
