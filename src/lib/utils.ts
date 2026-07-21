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

export function formatDateTimeBR(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function monthLabel(m: string): string {
  if (!m || typeof m !== "string" || !m.includes("-")) return m || "";
  const [y, mo] = m.split("-");
  const monthIdx = parseInt(mo) - 1;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  if (monthIdx < 0 || monthIdx > 11) return m;
  return `${months[monthIdx]}/${y}`;
}

export function getNextFriday(date: Date): string {
  const target = new Date(date.getTime());
  target.setDate(target.getDate() + 15);
  const day = target.getDay();
  let diff = 5 - day;
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  target.setDate(target.getDate() + diff);
  return localDateString(target);
}

export function getPreviousFriday(dateStr: string): string {
  const d = parseLocalDate(dateStr) || new Date();
  d.setDate(d.getDate() - 14);
  let day = d.getDay();
  let diff = (day - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return localDateString(d);
}


