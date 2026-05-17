import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string) {
  if (address.length <= 18) {
    return address;
  }

  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
