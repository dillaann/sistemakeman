import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Package, ArrowDown, ArrowUp } from "lucide-react";
import { isInRange } from "@/components/MonthFilter";

type MaterialEntry = {
  material: string;
  unit: string;
  suppliers: {
    supplier_id: string | null;
    supplier_name: string;
    min_price: number;
    last_price: number;
    last_date: string;
    total_qty: number;
    is_cheapest: boolean;
    diff_pct: number;
  }[];
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface MaterialsTabProps {
  dateRange: { start: Date; end: Date };
}

const MaterialsTab = ({ dateRange }: MaterialsTabProps) => {
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases").select("*, suppliers(name)").order("purchase_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      return data ?? [];
    },
  });

  const materials: MaterialEntry[] = useMemo(() => {
    // Filter purchases by dateRange first
    const filteredByDate = purchases.filter((p: any) => isInRange(p.purchase_date, dateRange));
    
    // Group by normalized material name
    const map: Record<string, Record<string, { min_price: number; last_price: number; last_date: string; total_qty: number; supplier_name: string; supplier_id: string | null; unit: string }>> = {};

    filteredByDate.forEach((p: any) => {
      const matKey = p.material.trim().toLowerCase();
      const suppId = p.supplier_id || "__none__";
      const suppName = p.suppliers?.name ?? "Sem fornecedor";
      const unitPrice = Number(p.unit_price) || 0;
      const qty = Number(p.quantity) || 0;
      const date = p.purchase_date;

      if (!map[matKey]) map[matKey] = {};
      if (!map[matKey][suppId]) {
        map[matKey][suppId] = {
          min_price: unitPrice,
          last_price: unitPrice,
          last_date: date,
          total_qty: 0,
          supplier_name: suppName,
          supplier_id: p.supplier_id,
          unit: p.unit,
        };
      }

      const entry = map[matKey][suppId];
      if (unitPrice < entry.min_price) entry.min_price = unitPrice;
      if (date > entry.last_date) {
        entry.last_date = date;
        entry.last_price = unitPrice;
      }
      entry.total_qty += qty;
    });

    return Object.entries(map).map(([matKey, suppMap]) => {
      const suppEntries = Object.values(suppMap);
      const globalMin = Math.min(...suppEntries.map(s => s.min_price));
      const originalName = filteredByDate.find((p: any) => p.material.trim().toLowerCase() === matKey)?.material ?? matKey;

      return {
        material: originalName,
        unit: suppEntries[0]?.unit ?? "un",
        suppliers: suppEntries
          .map(s => ({
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name,
            min_price: s.min_price,
            last_price: s.last_price,
            last_date: s.last_date,
            total_qty: s.total_qty,
            is_cheapest: s.min_price === globalMin,
            diff_pct: globalMin > 0 ? ((s.min_price - globalMin) / globalMin) * 100 : 0,
          }))
          .sort((a, b) => a.min_price - b.min_price),
      };
    }).sort((a, b) => a.material.localeCompare(b.material));
  }, [purchases]);

  const filtered = useMemo(() => {
    return materials.filter(m => {
      if (search) {
        const s = search.toLowerCase();
        if (!m.material.toLowerCase().includes(s)) return false;
      }
      if (filterSupplier !== "all") {
        if (!m.suppliers.some(s => s.supplier_id === filterSupplier)) return false;
      }
      return true;
    });
  }, [materials, search, filterSupplier]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Materiais Catalogados</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{materials.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fornecedores Ativos</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{suppliers.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Materiais com 2+ Fornecedores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materials.filter(m => m.suppliers.length > 1).length}</div>
            <p className="text-xs text-muted-foreground">Comparação disponível</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Fornecedores</SelectItem>
            {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Materials list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {materials.length === 0
              ? "Nenhum material encontrado. Registre compras para alimentar o catálogo automaticamente."
              : "Nenhum material encontrado com os filtros aplicados."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{m.material}</CardTitle>
                  <Badge variant="outline" className="text-xs">{m.unit}</Badge>
                </div>
                {m.suppliers.length > 1 && (
                  <p className="text-xs text-muted-foreground">{m.suppliers.length} fornecedores — melhor preço destacado</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="border rounded-lg overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Menor Preço</TableHead>
                        <TableHead className="hidden sm:table-cell">Último Preço</TableHead>
                        <TableHead className="hidden sm:table-cell">Última Compra</TableHead>
                        <TableHead className="hidden md:table-cell">Qtd. Comprada</TableHead>
                        <TableHead>Comparação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {m.suppliers.map((s, si) => (
                        <TableRow key={si} className={s.is_cheapest ? "bg-green-500/5" : ""}>
                          <TableCell className="font-medium">{s.supplier_name}</TableCell>
                          <TableCell className={s.is_cheapest ? "text-green-700 font-bold" : "text-red-600 font-medium"}>
                            {fmt(s.min_price)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{fmt(s.last_price)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs">
                            {new Date(s.last_date).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {s.total_qty} {m.unit}
                          </TableCell>
                          <TableCell>
                            {s.is_cheapest ? (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                                <ArrowDown className="h-3 w-3 mr-1" />Melhor preço
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-700 border-red-500/20">
                                <ArrowUp className="h-3 w-3 mr-1" />{s.diff_pct.toFixed(0)}% mais caro
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaterialsTab;
