import { compareDateStrings, formatDateBR, localDateString } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowUpDown, CheckCircle } from "lucide-react";
import { isInRange } from "@/components/MonthFilter";

interface PendenciasTabProps {
  dateRange?: { start: Date; end: Date };
}

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  atrasado: "bg-red-500/10 text-red-700 border-red-500/20",
  cancelado: "bg-muted text-muted-foreground border-muted",
};
const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

const typeLabels: Record<string, string> = { a_receber: "A Receber", a_pagar: "A Pagar" };
const typeColors: Record<string, string> = {
  a_receber: "bg-green-500/10 text-green-700 border-green-500/20",
  a_pagar: "bg-red-500/10 text-red-700 border-red-500/20",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PendenciasTab({ dateRange }: PendenciasTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"due_date" | "amount">("due_date");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-pendencias"],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase
          .from("financial_transactions")
          .select("*")
          .in("status", ["pendente", "atrasado"])
          .order("due_date", { ascending: true })
      );
    },
  });

  const getEffectiveStatus = (t: { status: string; due_date: string }) => {
    if (t.status === "pendente" && t.due_date < localDateString()) return "atrasado";
    return t.status;
  };

  const filtered = useMemo(() => {
    let list = transactions.filter(t => {
      if (dateRange && !isInRange(t.due_date, dateRange)) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      const effective = getEffectiveStatus(t);
      if (statusFilter === "atrasado" && effective !== "atrasado") return false;
      if (statusFilter === "pendente" && effective !== "pendente") return false;
      if (statusFilter !== "all" && statusFilter !== "atrasado" && statusFilter !== "pendente") return false;
      const text = search.toLowerCase();
      if (text && !t.description.toLowerCase().includes(text) && !(t.category ?? "").toLowerCase().includes(text)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortField === "amount") {
        const d = Number(a.amount) - Number(b.amount);
        return sortAsc ? d : -d;
      }
      const d = compareDateStrings(a.due_date, b.due_date);
      return sortAsc ? d : -d;
    });
    return list;
  }, [transactions, typeFilter, statusFilter, search, sortField, sortAsc, dateRange]);

  const totalReceber = filtered.filter(t => t.type === "a_receber").reduce((s, t) => s + Number(t.amount), 0);
  const totalPagar = filtered.filter(t => t.type === "a_pagar").reduce((s, t) => s + Number(t.amount), 0);
  const totalAtrasado = filtered.filter(t => getEffectiveStatus(t) === "atrasado").reduce((s, t) => s + Number(t.amount), 0);

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("financial_transactions")
        .update({ status: "pago" as any, paid_date: localDateString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-pendencias"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Transação confirmada!" });
    },
  });

  const toggleSort = (field: "due_date" | "amount") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="rounded-lg border p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-muted-foreground">A Receber (Pendente)</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalReceber)}</p>
        </div>
        <div className="rounded-lg border p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-muted-foreground">A Pagar (Pendente)</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalPagar)}</p>
        </div>
        <div className="rounded-lg border border-red-300 p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-red-600 font-medium">Total Atrasado</p>
          <p className="text-2xl font-bold text-red-700">{fmt(totalAtrasado)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="a_receber">A Receber</SelectItem>
            <SelectItem value="a_pagar">A Pagar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>Vencimento <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => {
              const effective = getEffectiveStatus(t);
              return (
                <TableRow key={t.id} className={effective === "atrasado" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                  <TableCell className={effective === "atrasado" ? "text-red-600 font-medium" : ""}>{formatDateBR(t.due_date)}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{t.description}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell><Badge className={typeColors[t.type]}>{typeLabels[t.type]}</Badge></TableCell>
                  <TableCell className="font-semibold">{fmt(Number(t.amount))}</TableCell>
                  <TableCell><Badge className={statusColors[effective]}>{statusLabels[effective] ?? t.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(t.id)} disabled={confirmMutation.isPending}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Confirmar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma pendência encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
