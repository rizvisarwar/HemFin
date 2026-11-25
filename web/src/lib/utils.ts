import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merge helper. The design-system type utilities (text-caption, text-small ...)
 * are registered as font-size classes so they are not mistaken for text colours and
 * dropped when a colour class sits next to them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display", "h1", "h2", "h3", "lead", "body", "body-strong",
            "small", "caption", "money-lg", "money",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
