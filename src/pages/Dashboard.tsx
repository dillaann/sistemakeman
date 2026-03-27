import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, ClipboardList, DollarSign, Factory, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Dashboard = () => {
  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["quotes-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("status, total");
      return data ?? [];
    },
  });

  const { data: workOrders } = useQuery({
    queryKey: ["work-orders-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("status, total");
      return data ?? [];
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("type, status, amount");
      return data ?? [];
    },
  });

  const { data: billingOrders = [] } = useQuery({
    queryKey: ["billing-dashboard"],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("work_orders")
        .select("id, total, completed_at")
        .in("status", ["concluido", "entregue"]);
      const { data: txns } = await supabase
        .from("financial_transactions")
        .select("work_order_id, amount, status")
        .eq("type", "a_receber")
        .eq("status", "pago");
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthOrders = (orders ?? []).filter(o => {
        if (!o.completed_at) return false;
        const d = new Date(o.completed_at);
        return d >= monthStart && d <= monthEnd;
      });
      const totalBilled = monthOrders.reduce((s, o) => s + Number(o.total), 0);
      const monthOrderIds = new Set(monthOrders.map(o => o.id));
      const totalReceived = (txns ?? [])
        .filter(t => t.work_order_id && monthOrderIds.has(t.work_order_id))
        .reduce((s, t) => s + Number(t.amount), 0);
      return { totalBilled, totalReceived };
    },
  });

  const pendingQuotes = quotes?.filter(q => q.status === "pendente").length ?? 0;
  const quotesTotal = quotes?.filter(q => q.status === "aprovado").reduce((s, q) => s + Number(q.total), 0) ?? 0;

  const woByStatus = {
    aguardando: workOrders?.filter(w => w.status === "aguardando").length ?? 0,
    em_producao: workOrders?.filter(w => w.status === "em_producao").length ?? 0,
    concluido: workOrders?.filter(w => w.status === "concluido").length ?? 0,
    entregue: workOrders?.filter(w => w.status === "entregue").length ?? 0,
  };

  const totalReceivable = transactions?.filter(t => t.type === "a_receber" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const totalPayable = transactions?.filter(t => t.type === "a_pagar" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const totalReceived = transactions?.filter(t => t.type === "a_receber" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const totalPaid = transactions?.filter(t => t.type === "a_pagar" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0) ?? 0;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusLabels: Record<string, string> = {
    aguardando: "Aguardando",
    em_producao: "Em Produção",
    concluido: "Concluído",
    entregue: "Entregue",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orçamentos Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingQuotes}</div>
            <p className="text-xs text-muted-foreground">Aprovados: {fmt(quotesTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totalReceivable)}</div>
            <p className="text-xs text-muted-foreground">Recebido: {fmt(totalReceived)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(totalPayable)}</div>
            <p className="text-xs text-muted-foreground">Pago: {fmt(totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Faturamento do Mês</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Faturado</p>
              <p className="text-xl font-bold">{fmt(billingOrders.totalBilled ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="text-xl font-bold text-green-600">{fmt(billingOrders.totalReceived ?? 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Ordens de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(woByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm">{statusLabels[status]}</span>
                  <Badge variant={status === "em_producao" ? "default" : "secondary"}>{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4" /> Produção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { key: "aguardando", label: "Fila de Produção" },
                { key: "em_producao", label: "Em Andamento" },
                { key: "concluido", label: "Finalizado" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <Badge variant={key === "em_producao" ? "default" : "secondary"}>
                    {workOrders?.filter(w => w.status === key).length ?? 0}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Entradas</p>
              <p className="text-xl font-bold text-green-600">{fmt(totalReceived)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saídas</p>
              <p className="text-xl font-bold text-red-600">{fmt(totalPaid)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo</p>
              <p className={`text-xl font-bold ${totalReceived - totalPaid >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(totalReceived - totalPaid)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
