import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FinancialCategory = {
  id: string;
  name: string;
  type: "entrada" | "saida" | "ambos";
  is_default: boolean;
};

export function useFinancialCategories(filterType?: "entrada" | "saida") {
  const { data: categories = [], ...rest } = useQuery({
    queryKey: ["financial-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_categories")
        .select("*")
        .order("name");
      return (data ?? []) as FinancialCategory[];
    },
  });

  const filtered = filterType
    ? categories.filter(c => c.type === filterType || c.type === "ambos")
    : categories;

  return { categories: filtered, allCategories: categories, ...rest };
}
