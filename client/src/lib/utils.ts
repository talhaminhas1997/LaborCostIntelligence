import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Omit that distributes over a discriminated union (preserves each variant). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const usdK = (n: number) => {
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k";
  return "$" + Math.round(n);
};
