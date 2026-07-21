// Lightweight fuzzy string similarity (0..1) using Dice's coefficient on bigrams.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

export function fuzzyRatio(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  for (const [k, v] of ba) {
    const other = bb.get(k);
    if (other) intersection += Math.min(v, other);
  }
  const total =
    Array.from(ba.values()).reduce((a, b) => a + b, 0) +
    Array.from(bb.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return (2 * intersection) / total;
}

export function onlyDigits(s?: string | null): string {
  return (s ?? "").replace(/\D+/g, "");
}
