import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowUpDown, AlertTriangle, Clock, CheckCircle2, TrendingUp, Eye } from "lucide-react";
import { formatDateBR, localDateString } from "@/lib/utils";
import { isInRange } from "@/components/MonthFilter";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface GroupedReceivable {
  workOrderId: string | null;
  clientId: string | null;
  description: string;
  totalValue: number;
  totalReceived: number;
  remaining: number;
  percentReceived: number;
  dueDate: string;
  status: "recebido_total" | "vencido" | "a_receber";
  pendingTransactionIds: string[];
}

export default function ContasReceberTab({ dateRange }: { dateRange?: { start: Date; end: Date } }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"due_date" | "remaining">("due_date");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAllPending, setShowAllPending] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-contas-receber"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("type", "a_receber")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name");
      return data ?? [];
    },
  });

  // Group transactions by work_order_id to show total, received, remaining
  const grouped = useMemo(() => {
    const byWO = new Map<string, typeof transactions>();
    const noWO: typeof transactions = [];

    for (const t of transactions) {
      if (t.work_order_id) {
        const arr = byWO.get(t.work_order_id) || [];
        arr.push(t);
        byWO.set(t.work_order_id, arr);
      } else {
        noWO.push(t);
      }
    }

    const result: GroupedReceivable[] = [];

    for (const [woId, txns] of byWO) {
      const totalValue = txns.reduce((s, t) => s + Number(t.amount), 0);
      const totalReceived = txns
        .filter(t => t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0);
      const remaining = totalValue - totalReceived;
      const percentReceived = totalValue > 0 ? (totalReceived / totalValue) * 100 : 0;

      const pendingTxns = txns.filter(t => t.status !== "pago" && t.status !== "cancelado");
      const latestDue = pendingTxns.length > 0
        ? pendingTxns.sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date
        : txns[0].due_date;

      const clientId = txns[0].client_id;
      // Use description from first pending, or first txn
      const descTxn = pendingTxns[0] || txns[0];
      // Extract base description (client name + quote ref)
      const clientName = clientId ? (clients.find(c => c.id === clientId)?.name ?? "—") : "—";

      let status: GroupedReceivable["status"] = "a_receber";
      if (remaining <= 0) {
        status = "recebido_total";
      } else if (daysUntil(latestDue) < 0) {
        status = "vencido";
      }

      result.push({
        workOrderId: woId,
        clientId,
        description: descTxn.description,
        totalValue,
        totalReceived,
        remaining: Math.max(remaining, 0),
        percentReceived: Math.min(percentReceived, 100),
        dueDate: latestDue,
        status,
        pendingTransactionIds: pendingTxns.map(t => t.id),
      });
    }

    // Individual transactions without work_order_id
    for (const t of noWO) {
      const received = t.status === "pago" ? Number(t.amount) : 0;
      const remaining = Number(t.amount) - received;
      let status: GroupedReceivable["status"] = "a_receber";
      if (t.status === "pago") status = "recebido_total";
      else if (daysUntil(t.due_date) < 0) status = "vencido";

      result.push({
        workOrderId: null,
        clientId: t.client_id,
        description: t.description,
        totalValue: Number(t.amount),
        totalReceived: received,
        remaining: Math.max(remaining, 0),
        percentReceived: received > 0 ? 100 : 0,
        dueDate: t.due_date,
        status,
        pendingTransactionIds: t.status !== "pago" && t.status !== "cancelado" ? [t.id] : [],
      });
    }

    return result;
  }, [transactions, clients]);

  const filtered = useMemo(() => {
    let list = [...grouped];

    // Apply date range filter (fixed in due_date month) unless showing all pending
    if (dateRange && !showAllPending) {
      list = list.filter(g => isInRange(g.dueDate, dateRange));
    }
    // When showAllPending, only show open items
    if (showAllPending) {
      list = list.filter(g => g.status !== "recebido_total");
    }

    if (statusFilter !== "all") {
      list = list.filter(g => g.status === statusFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(g =>
        g.description.toLowerCase().includes(s) ||
        (g.clientId && clients.find(c => c.id === g.clientId)?.name.toLowerCase().includes(s))
      );
    }

    list.sort((a, b) => {
      if (sortField === "remaining") return sortAsc ? a.remaining - b.remaining : b.remaining - a.remaining;
      return sortAsc ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
    });
    return list;
  }, [grouped, statusFilter, search, sortField, sortAsc, clients, dateRange, showAllPending]);

  // Summary: only count open items, sum only REMAINING balances
  const openItems = grouped.filter(g => g.status !== "recebido_total");
  const totalRestante = openItems.reduce((s, g) => s + g.remaining, 0);
  const totalVencido = openItems.filter(g => g.status === "vencido").reduce((s, g) => s + g.remaining, 0);
  const total7d = openItems.filter(g => {
    const d = daysUntil(g.dueDate);
    return g.status !== "vencido" && d >= 0 && d <= 7;
  }).reduce((s, g) => s + g.remaining, 0);
  const total30d = openItems.filter(g => {
    const d = daysUntil(g.dueDate);
    return g.status !== "vencido" && d >= 0 && d <= 30;
  }).reduce((s, g) => s + g.remaining, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const recebidoMes = transactions
    .filter(t => t.status === "pago" && t.paid_date && t.paid_date >= monthStart && t.paid_date <= monthEnd)
    .reduce((s, t) => s + Number(t.amount), 0);

  const markReceived = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.from("financial_transactions").update({
          status: "pago" as any,
          paid_date: localDateString(),
        }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Recebimento registrado!" });
    },
  });

  const toggleSort = (field: "due_date" | "remaining") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const statusBadge: Record<string, { label: string; className: string }> = {
    recebido_total: { label: "Recebido Total", className: "bg-green-500/10 text-green-700 border-green-500/20" },
    vencido: { label: "Vencido", className: "bg-red-500/10 text-red-700 border-red-500/20" },
    a_receber: { label: "A Receber", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Saldo a Receber</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(totalRestante)}</p></CardContent>
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
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Recebido no Mês</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(recebidoMes)}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="a_receber">A Receber</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
            <SelectItem value="recebido_total">Recebidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>Vencimento <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("remaining")}>Saldo Restante <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Progresso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((g, idx) => {
              const days = daysUntil(g.dueDate);
              const rowClass = g.status === "vencido"
                ? "bg-red-50 dark:bg-red-950/20"
                : (g.status === "a_receber" && days <= 7 ? "bg-yellow-50 dark:bg-yellow-950/20" : "");
              const badge = statusBadge[g.status];
              const clientName = g.clientId ? (clients.find(c => c.id === g.clientId)?.name ?? "—") : "—";

              return (
                <TableRow key={g.workOrderId || `no-wo-${idx}`} className={`${rowClass} ${g.status === "recebido_total" ? "opacity-60" : ""}`}>
                  <TableCell>{formatDateBR(g.dueDate)}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{g.description}</TableCell>
                  <TableCell>{clientName}</TableCell>
                  <TableCell className="text-muted-foreground">{fmt(g.totalValue)}</TableCell>
                  <TableCell className="text-green-600">{fmt(g.totalReceived)}</TableCell>
                  <TableCell className="font-bold text-primary">{fmt(g.remaining)}</TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <Progress value={g.percentReceived} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(g.percentReceived)}%</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    {g.status !== "recebido_total" && g.pendingTransactionIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markReceived.mutate(g.pendingTransactionIds)}
                        disabled={markReceived.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Receber
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma conta a receber encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
