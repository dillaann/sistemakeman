import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowUpDown, AlertTriangle, Clock, CheckCircle2, Eye } from "lucide-react";
import { formatDateBR, localDateString } from "@/lib/utils";
import { isInRange } from "@/components/MonthFilter";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const categorias = ["Compras", "Folha de Pagamento", "Despesa Administrativa", "Marketing", "Aluguel", "Serviço", "Fornecedor", "Material", "Outro"];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(t: { status: string; due_date: string }): "pago" | "vencido" | "a_vencer" {
  if (t.status === "pago") return "pago";
  if (daysUntil(t.due_date) < 0) return "vencido";
  return "a_vencer";
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pago: { label: "Pago", className: "bg-green-500/10 text-green-700 border-green-500/20" },
  vencido: { label: "Vencido", className: "bg-red-500/10 text-red-700 border-red-500/20" },
  a_vencer: { label: "A Vencer", className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
};

export default function ContasPagarTab({ dateRange }: { dateRange?: { start: Date; end: Date } }) {
  const isBeforeRange = (dateStr: string) => {
    if (!dateRange) return false;
    const d = new Date(dateStr + "T00:00:00");
    return d < dateRange.start;
  };
  const isInCurrentRange = (dateStr: string) => {
    if (!dateRange) return true;
    return isInRange(dateStr, dateRange);
  };
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortField, setSortField] = useState<"due_date" | "amount">("due_date");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAllPending, setShowAllPending] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-contas-pagar"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("type", "a_pagar")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("id, name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = transactions.map(t => ({ ...t, computedStatus: getStatus(t) }));

    // Apply date range filter (fixed in due_date month) unless showing all pending
    if (dateRange && !showAllPending) {
      list = list.filter(t => isInRange(t.due_date, dateRange));
    }
    // When showAllPending, only show open items
    if (showAllPending) {
      list = list.filter(t => t.computedStatus !== "pago");
    }

    if (statusFilter !== "all") {
      list = list.filter(t => t.computedStatus === statusFilter);
    }
    if (catFilter !== "all") {
      list = list.filter(t => (t.category ?? "") === catFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.description.toLowerCase().includes(s) || (t.category ?? "").toLowerCase().includes(s));
    }

    list.sort((a, b) => {
      if (sortField === "amount") return sortAsc ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount);
      return sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date);
    });
    return list;
  }, [transactions, statusFilter, catFilter, search, sortField, sortAsc, dateRange, showAllPending]);

  const openItems = transactions.filter(t => t.status !== "pago" && t.status !== "cancelado");
  const totalAberto = openItems.reduce((s, t) => s + Number(t.amount), 0);
  const totalVencido = openItems.filter(t => daysUntil(t.due_date) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const total7d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 7; }).reduce((s, t) => s + Number(t.amount), 0);
  const total30d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 30; }).reduce((s, t) => s + Number(t.amount), 0);

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").update({ status: "pago" as any, paid_date: localDateString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Pagamento registrado!" });
    },
  });

  const toggleSort = (field: "due_date" | "amount") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const getRowClass = (cs: string) => {
    if (cs === "vencido") return "bg-red-50 dark:bg-red-950/20";
    if (cs === "a_vencer" && filtered.find(t => t.computedStatus === cs)) {
      // highlight items due within 7 days
    }
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Total a Pagar</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalAberto)}</p></CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Vencido</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalVencido)}</p></CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-600 flex items-center gap-2"><Clock className="h-4 w-4" /> Próximos 7 dias</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">{fmt(total7d)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Próximos 30 dias</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(total30d)}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="a_vencer">A Vencer</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={showAllPending ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAllPending(!showAllPending)}
          className="flex items-center gap-1"
        >
          <Eye className="h-4 w-4" />
          {showAllPending ? "Filtrar por mês" : "Ver todos pendentes"}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>Vencimento <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => {
              const days = daysUntil(t.due_date);
              const rowClass = t.computedStatus === "vencido"
                ? "bg-red-50 dark:bg-red-950/20"
                : (t.computedStatus === "a_vencer" && days <= 7 ? "bg-yellow-50 dark:bg-yellow-950/20" : "");
              const badge = statusBadge[t.computedStatus];
              return (
                <TableRow key={t.id} className={`${rowClass} ${t.computedStatus === "pago" ? "opacity-60" : ""}`}>
                  <TableCell>{formatDateBR(t.due_date)}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{t.description}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell>{t.account_id ? (accounts.find(a => a.id === t.account_id)?.name ?? "—") : "—"}</TableCell>
                  <TableCell className="font-semibold">{fmt(Number(t.amount))}</TableCell>
                  <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    {t.computedStatus !== "pago" && (
                      <Button size="sm" variant="outline" onClick={() => markPaid.mutate(t.id)} disabled={markPaid.isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conta a pagar encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
