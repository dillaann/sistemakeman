/**
 * Testes de regressão: validação de datas.
 * Histórico:
 * - 11 compras criadas em 2026-04 com purchase_date em 2024-04 (typo de ano).
 * - Funções parseLocalDate / formatDateBR devem evitar UTC shift no Brasil (UTC-3).
 */
import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  validateEventDateAgainstCreation,
} from "@/lib/date-validation";
import { parseLocalDate, formatDateBR, localDateString } from "@/lib/utils";

describe("regressão: validação de datas inválidas", () => {
  describe("isValidIsoDate", () => {
    it("aceita datas válidas YYYY-MM-DD", () => {
      expect(isValidIsoDate("2026-04-15")).toBe(true);
      expect(isValidIsoDate("2024-02-29")).toBe(true); // ano bissexto
    });

    it("rejeita formatos inválidos", () => {
      expect(isValidIsoDate("15/04/2026")).toBe(false);
      expect(isValidIsoDate("2026-4-15")).toBe(false);
      expect(isValidIsoDate("")).toBe(false);
      expect(isValidIsoDate(null)).toBe(false);
      expect(isValidIsoDate(undefined)).toBe(false);
    });

    it("rejeita datas absurdas (mês 13, dia 32)", () => {
      expect(isValidIsoDate("2026-13-01")).toBe(false);
      expect(isValidIsoDate("2026-04-32")).toBe(false);
      expect(isValidIsoDate("2025-02-29")).toBe(false); // não bissexto
    });
  });

  describe("validateEventDateAgainstCreation (typo de ano)", () => {
    it("detecta purchase_date 2 anos antes do created_at (regressão real)", () => {
      const r = validateEventDateAgainstCreation({
        event_date: "2024-04-15",
        created_at: "2026-04-24T10:00:00Z",
      });
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/typo|anos antes/i);
    });

    it("aceita defasagem de até 1 ano (lançamento atrasado)", () => {
      const r = validateEventDateAgainstCreation({
        event_date: "2025-04-15",
        created_at: "2026-04-24T10:00:00Z",
      });
      expect(r.valid).toBe(true);
    });

    it("aceita data do mesmo período de criação", () => {
      const r = validateEventDateAgainstCreation({
        event_date: "2026-04-20",
        created_at: "2026-04-24T10:00:00Z",
      });
      expect(r.valid).toBe(true);
    });

    it("rejeita datas muito no futuro", () => {
      const r = validateEventDateAgainstCreation({
        event_date: "2030-01-01",
        created_at: "2026-04-24T10:00:00Z",
      });
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/futuro/i);
    });

    it("rejeita event_date com formato inválido", () => {
      const r = validateEventDateAgainstCreation({
        event_date: "15/04/2026",
        created_at: "2026-04-24T10:00:00Z",
      });
      expect(r.valid).toBe(false);
    });
  });

  describe("parseLocalDate / formatDateBR (UTC shift)", () => {
    it("não aplica UTC shift em strings YYYY-MM-DD (bug histórico do BR)", () => {
      // No timezone -3, new Date("2026-04-15") vira 2026-04-14 21:00 local.
      // parseLocalDate deve preservar o dia 15.
      const d = parseLocalDate("2026-04-15");
      expect(d).not.toBeNull();
      expect(d!.getDate()).toBe(15);
      expect(d!.getMonth()).toBe(3); // abril
      expect(d!.getFullYear()).toBe(2026);
    });

    it("formatDateBR retorna dd/mm/yyyy correto", () => {
      expect(formatDateBR("2026-04-15")).toBe("15/04/2026");
      expect(formatDateBR("2024-12-31")).toBe("31/12/2024");
    });

    it("localDateString round-trip preserva a data", () => {
      const original = "2026-04-15";
      const parsed = parseLocalDate(original)!;
      expect(localDateString(parsed)).toBe(original);
    });

    it("retorna null/empty para entradas inválidas", () => {
      expect(parseLocalDate(null)).toBeNull();
      expect(parseLocalDate("")).toBeNull();
      expect(formatDateBR(null)).toBe("");
    });
  });
});
