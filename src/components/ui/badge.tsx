import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&>.dot]:size-1.5 [&>.dot]:rounded-full",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary [&>.dot]:bg-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground [&>.dot]:bg-muted-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive [&>.dot]:bg-destructive",
        outline: "text-foreground border-border [&>.dot]:bg-muted-foreground",
        success: "border-transparent bg-success/15 text-success [&>.dot]:bg-success",
        warning: "border-transparent bg-warning/15 text-warning [&>.dot]:bg-warning",
        gold: "border-transparent bg-gold/15 text-gold [&>.dot]:bg-gold",
        solid: "border-transparent bg-primary text-primary-foreground [&>.dot]:bg-primary-foreground",
        info: "border-transparent bg-sky-500/15 text-sky-500 [&>.dot]:bg-sky-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
