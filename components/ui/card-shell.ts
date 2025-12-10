import { cn } from "@/lib/utils";

export const baseCardClasses = "bg-white rounded-xl border border-gray-200 shadow-sm";
export const interactiveCardClasses = "hover:shadow-md hover:border-gray-300 transition-all";

export function cardClasses(className?: string, interactive = true) {
  return cn(baseCardClasses, interactive && interactiveCardClasses, className);
}
