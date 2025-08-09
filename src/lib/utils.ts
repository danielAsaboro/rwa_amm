import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(
  address?: string,
  head: number = 4,
  tail: number = 4
): string {
  if (!address) return "";
  const trimmed = address.trim();
  if (trimmed.length <= head + tail + 1) return trimmed;
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}
