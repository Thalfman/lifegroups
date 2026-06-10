import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "solid"
  | "ghost"
  | "subtle"
  | "destructive";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-sans text-base font-medium leading-tight no-underline transition duration-150 ease-out active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  // exactly one `primary` per surface — the action the user came to do
  primary: "bg-clay text-white hover:bg-clayDeep",
  solid: "bg-ink text-bg hover:bg-ink/90",
  ghost: "border border-line bg-transparent text-ink hover:bg-surfaceAlt",
  subtle: "bg-surfaceAlt text-ink2 hover:bg-line/60",
  destructive: "bg-rose text-white hover:bg-rose/85",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2",
  md: "px-[18px] py-2.5",
};

/** Class string for things that must look like a Button but can't be one
 *  (e.g. a raw `<a download>` anchor). */
export function buttonClassName(
  variant: ButtonVariant = "ghost",
  size: ButtonSize = "md",
  className?: string
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-[lg-spin_0.7s_linear_infinite] rounded-pill border-2 border-current border-t-transparent"
    />
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  const busy = rest["aria-busy"] === true || rest["aria-busy"] === "true";
  return (
    <button {...rest} className={buttonClassName(variant, size, className)}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export type LinkButtonProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function LinkButton({
  variant = "ghost",
  size = "md",
  href,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      href={href}
      className={buttonClassName(variant, size, className)}
    >
      {children}
    </Link>
  );
}
