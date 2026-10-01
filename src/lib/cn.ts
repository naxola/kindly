import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scale. Without this, our
 * token-named utilities are misread — `text-2xs` would be taken for a colour
 * and silently dropped next to `text-foreground`.
 */
const twMerge = extendTailwindMerge<"typography">({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs"] }],
      typography: [
        {
          type: ["page-title", "section-title", "body", "label", "caption", "overline"],
        },
      ],
    },
  },
});

/** Joins class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
