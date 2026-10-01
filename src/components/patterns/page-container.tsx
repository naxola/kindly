import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const SIZE_CLASSES = {
  sm: "max-w-page-sm",
  md: "max-w-page-md",
  lg: "max-w-page-lg",
  full: "w-full",
} as const;

/**
 * Owns a page's width, horizontal gutter and vertical rhythm
 * (docs/ui/LAYOUT_NAVIGATION.md §5). Pick the size by content, not by page
 * type: `sm` settings/forms, `md` lists and detail pages, `lg` wider
 * detail views, `full` dense views (Inbox).
 */
export function PageContainer({
  size = "md",
  className,
  children,
}: {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("mx-auto flex w-full flex-col gap-8 px-gutter py-6", SIZE_CLASSES[size], className)}>{children}</div>;
}
