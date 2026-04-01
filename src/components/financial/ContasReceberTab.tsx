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
import { Search, ArrowUpDown, AlertTriangle, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { formatDateBR, localDateString } from "@/lib/utils";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const origens = ["Orçamento", "Faturamento", "Serviço", "Venda de Produto", "Sinal/Entrada", "Outro"];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(t: { status: string; due_date: string }): "recebido" | "vencido" | "a_receber" {
  if (t.status === "pago") return "recebido";
  if (daysUntil(t.due_date) < 0) return "vencido";
  return "a_receber";
}

const statusBadge: Record<string, { label: string; className: string }> = {
  recebido: { label: "Recebido", className: "bg-green-500/10 text-green-700 border-green-500/20" },
  vencido: { label: "Vencido", className: "bg-red-500/10 text-red-700 border-red-500/20" },
  a_receber: { label: "A Receber", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
};

export default function ContasReceberTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortField, setSortField] = useState<"due_date" | "amount">("due_date");
  const [sortAsc, setSortAsc] = useState(true);

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

  const filtered = useMemo(() => {
    let list = transactions.map(t => ({ ...t, computedStatus: getStatus(t) }));

    if (statusFilter !== "all") {
      list = list.filter(t => t.computedStatus === statusFilter);
    }
    if (catFilter !== "all") {
      list = list.filter(t => (t.category ?? "") === catFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t =>
        t.description.toLowerCase().includes(s) ||
        (t.client_id && clients.find(c => c.id === t.client_id)?.name.toLowerCase().includes(s))
      );
    }

    list.sort((a, b) => {
      if (sortField === "amount") return sortAsc ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount);
      return sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date);
    });
    return list;
  }, [transactions, statusFilter, catFilter, search, sortField, sortAsc, clients]);

  const openItems = transactions.filter(t => t.status !== "pago" && t.status !== "cancelado");
  const totalAberto = openItems.reduce((s, t) => s + Number(t.amount), 0);
  const totalVencido = openItems.filter(t => daysUntil(t.due_date) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const total7d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 7; }).reduce((s, t) => s + Number(t.amount), 0);
  const total30d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 30; }).reduce((s, t) => s + Number(t.amount), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const recebidoMes = transactions
    .filter(t => t.status === "pago" && t.paid_date && t.paid_date >= monthStart && t.paid_date <= monthEnd)
    .reduce((s, t) => s + Number(t.amount), 0);

  const markReceived = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").update({ status: "pago" as any, paid_date: localDateString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Recebimento registrado!" });
    },
  });

  const toggleSort = (field: "due_date" | "amount") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Total a Receber</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(totalAberto)}</p></CardContent>
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
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="a_receber">A Receber</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
            <SelectItem value="recebido">Recebidos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {origens.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
              <TableHead>Origem</TableHead>
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
                : (t.computedStatus === "a_receber" && days <= 7 ? "bg-yellow-50 dark:bg-yellow-950/20" : "");
              const badge = statusBadge[t.computedStatus];
              return (
                <TableRow key={t.id} className={`${rowClass} ${t.computedStatus === "recebido" ? "opacity-60" : ""}`}>
                  <TableCell>{formatDateBR(t.due_date)}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{t.description}</TableCell>
                  <TableCell>{t.client_id ? (clients.find(c => c.id === t.client_id)?.name ?? "—") : "—"}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{fmt(Number(t.amount))}</TableCell>
                  <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    {t.computedStatus !== "recebido" && (
                      <Button size="sm" variant="outline" onClick={() => markReceived.mutate(t.id)} disabled={markReceived.isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Receber
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conta a receber encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
