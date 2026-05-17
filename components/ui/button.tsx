import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium", { variants: { variant: { default: "bg-primary text-primary-foreground", outline: "border border-border bg-white" } }, defaultVariants: { variant: "default" } });

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

type ButtonComponentProps = ButtonProps & {
  asChild?: boolean;
  children?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonComponentProps>(({ className, variant, asChild = false, children, ...props }, ref) => {
  const classes = cn(buttonVariants({ variant }), className);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      className: cn(classes, (children.props as { className?: string }).className),
    });
  }

  return (
    <button className={classes} ref={ref} {...props}>
      {children}
    </button>
  );
});
Button.displayName = "Button";
