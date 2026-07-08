/**
 * Pagination helper for Supabase queries.
 *
 * The backend caps every response at 1000 rows, silently dropping the rest.
 * This helper pages past that cap so totals and lists reflect ALL records.
 *
 * Pass a factory that builds a FRESH query (filters + order, WITHOUT `.range`)
 * each time it is called — a query builder can only be awaited once.
 *
 * Example:
 *   const rows = await fetchAllRows(() =>
 *     supabase.from("financial_transactions").select("*").eq("type", "a_pagar")
 *   );
 */
const PAGE_SIZE = 1000;

// Query builders are PromiseLike and expose `.range`. We keep the type loose on
// purpose so any Supabase select builder can be passed in.
type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export async function fetchAllRows<T = unknown>(
  buildQuery: () => RangeableQuery<T>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  // Hard safety cap: 1000 pages = 1,000,000 rows. Prevents infinite loops if a
  // page ever returns exactly PAGE_SIZE forever due to an unexpected backend quirk.
  for (let page = 0; page < 1000; page++) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
