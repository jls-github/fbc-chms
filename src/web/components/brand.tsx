import clsx from "clsx";

/**
 * Official First Baptist Church logos (from the FBC brand guide, v1.0).
 * - "alt": the Alternative Logo (mark + two-line name) for tight spaces like the sidebar.
 * - "primary": the Primary Logo (mark + three-line name) for covers and sign-in.
 * - "white": the Reversed Alternative Logo, for use on photos and color blocks.
 * In dark mode the alt logo switches to the guide's Color-White-Outline execution.
 */
export function Logo({ variant = "alt", className }: { variant?: "alt" | "primary" | "white"; className?: string }) {
  const alt = "First Baptist Church";
  if (variant === "white") return <img src="/brand/logo-alt-white.png" alt={alt} className={clsx("w-auto", className)} />;
  if (variant === "primary") {
    return (
      <>
        <img src="/brand/logo-primary.png" alt={alt} className={clsx("w-auto dark:hidden", className)} />
        <img src="/brand/logo-alt-on-dark.png" alt={alt} className={clsx("hidden w-auto dark:block", className)} />
      </>
    );
  }
  return (
    <>
      <img src="/brand/logo-alt.png" alt={alt} className={clsx("w-auto dark:hidden", className)} />
      <img src="/brand/logo-alt-on-dark.png" alt={alt} className={clsx("hidden w-auto dark:block", className)} />
    </>
  );
}

/** The guide's "color blocks" element: the three peaks as a banner texture. */
export function ColorBlocks({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("bg-[url(/brand/color-blocks.jpg)] bg-cover bg-center", className)} />;
}
