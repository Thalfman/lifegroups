import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium", { variants: { variant: { default: "bg-primary text-primary-foreground", outline: "border border-border bg-white" } }, defaultVariants: { variant: "default" } });

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, ...props }, ref) => (
  <button className={cn(buttonVariants({ variant }), className)} ref={ref} {...props} />
));
Button.displayName = "Button";
