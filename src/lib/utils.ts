import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a date string in YYYY-MM-DD format using the LOCAL timezone,
 * avoiding the UTC shift that causes dates to go back one day in Brazil (UTC-3).
 */
export function localDateString(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseLocalDate(value?: string | Date | null): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateBR(value?: string | Date | null): string {
  const parsed = parseLocalDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "";
}

export function compareDateStrings(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

export function addDaysToLocalDateString(days: number, baseDate: Date = new Date()): string {
  const next = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  next.setDate(next.getDate() + days);
  return localDateString(next);
}
