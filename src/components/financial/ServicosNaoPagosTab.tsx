import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, FileDown, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { formatDateBR } from "@/lib/utils";
import { isInRange } from "@/components/MonthFilter";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Row {
  id: string;
  quote_id: string | null;
  clientName: string;
  description: string;
  reference_date: string | null;
  wo_status: string;
  total: number;
  paid: number;
  remaining: number;
  payment_status: string;
}

const statusLabel: Record<string, { label: string; color: string }> = {
  aguardando: { label: "Sem pagamento", color: "bg-red-500/10 text-red-700 border-red-500/20" },
  entrada_pendente: { label: "Entrada pendente", color: "bg-orange-500/10 text-orange-700 border-orange-500/20" },
  pagamento_parcial: { label: "Parcial", color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
  pago_total: { label: "Pago", color: "bg-green-500/10 text-green-700 border-green-500/20" },
  concluido_pago: { label: "Concluído e pago", color: "bg-green-500/10 text-green-700 border-green-500/20" },
};

const woStatusLabel: Record<string, string> = {
  aguardando: "Aguardando",
  em_producao: "Em produção",
  aguardando_instalacao: "Aguardando instalação",
  entregue: "Entregue",
};

export default function ServicosNaoPagosTab({ dateRange }: { dateRange?: { start: Date; end: Date } }) {
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState<string>("todos");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["servicos-todos-pagamentos"],
    queryFn: async (): Promise<Row[]> => {
      // 1. Fetch work orders (OS)
      const wos = await fetchAllRows<any>(() =>
        supabase
          .from("work_orders")
          .select("id, quote_id, description, delivered_at, completed_at, created_at, total, client_id, status, clients(name)")
      );

      // 2. Fetch all "a_receber" transactions to link payments to OS/Quotes
      const allTx = await fetchAllRows<any>(() =>
        supabase
          .from("financial_transactions")
          .select("*")
          .eq("type", "a_receber")
          .neq("status", "cancelado")
      );

      // 3. Fetch linked quotes for metadata
      const quoteIds = wos.map(w => w.quote_id).filter(Boolean);
      const { data: quotes = [] } = quoteIds.length
        ? await supabase
            .from("quotes")
            .select("id, payment_status, down_payment, remaining_amount, total")
            .in("id", quoteIds)
        : { data: [] as any[] };
      const qMap = new Map((quotes ?? []).map((q: any) => [q.id, q]));

      // 4. Map everything together
      return wos.map(w => {
        const q: any = w.quote_id ? qMap.get(w.quote_id) : null;
        
        // Find transactions linked to this specific OS
        const osTx = allTx.filter(t => t.work_order_id === w.id);
        
        // Calculate paid amount from transactions
        const paid = osTx.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
        
        // Total should be from quote if available, else OS total
        const total = Number(q?.total ?? w.total ?? 0);
        
        // Status determination logic
        let status = q?.payment_status ?? "aguardando";
        if (paid >= total && total > 0) {
          status = "pago_total";
        } else if (paid > 0) {
          status = "pagamento_parcial";
        }

        const remaining = Math.max(total - paid, 0);

        return {
          id: w.id,
          quote_id: w.quote_id,
          clientName: w.clients?.name ?? "—",
          description: w.description ?? "—",
          reference_date: w.delivered_at ?? w.completed_at ?? w.created_at,
          wo_status: w.status,
          total,
          paid,
          remaining,
          payment_status: status,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    return rows.filter(r => {
      // If there is a search term, ignore the date filter to help find specific missing records
      if (!search && dateRange && !isInRange(r.reference_date, dateRange)) return false;
      
      if (payFilter === "pagos" && !(r.payment_status === "pago_total" || r.payment_status === "concluido_pago")) return false;
      if (payFilter === "abertos" && (r.payment_status === "pago_total" || r.payment_status === "concluido_pago")) return false;
      if (payFilter !== "todos" && payFilter !== "pagos" && payFilter !== "abertos" && r.payment_status !== payFilter) return false;
      
      if (search) {
        const t = search.toLowerCase();
        if (!r.clientName.toLowerCase().includes(t) && !r.description.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [rows, search, dateRange, payFilter]);

  const totalRemaining = filtered.reduce((s, r) => s + r.remaining, 0);
  const totalValue = filtered.reduce((s, r) => s + r.total, 0);
  const totalPaid = filtered.reduce((s, r) => s + r.paid, 0);

  const exportPDF = () => {
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text("Serviços Entregues Não Pagos", w / 2, 15, { align: "center" });
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, w / 2, 22, { align: "center" });

    autoTable(doc, {
      startY: 28,
      head: [["Indicador", "Valor"]],
      body: [
        ["Serviços não pagos", String(filtered.length)],
        ["Valor total dos serviços", fmt(totalValue)],
        ["Total já pago", fmt(totalPaid)],
        ["Total em aberto", fmt(totalRemaining)],
      ],
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [["Entrega", "Cliente", "Serviço", "Total", "Pago", "Em aberto", "Status"]],
      body: filtered.map(r => [
        r.reference_date ? formatDateBR(r.reference_date) : "—",
        r.clientName,
        r.description.length > 40 ? r.description.slice(0, 37) + "..." : r.description,
        fmt(r.total),
        fmt(r.paid),
        fmt(r.remaining),
        statusLabel[r.payment_status]?.label ?? r.payment_status,
      ]),
      theme: "striped",
      headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });
    doc.save(`servicos_nao_pagos_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportPendingReport = () => {
    const pending = filtered.filter(r => r.payment_status !== "pago_total" && r.payment_status !== "concluido_pago");
    if (pending.length === 0) return;

    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text("Relatório de Contas a Receber - Serviços", w / 2, 15, { align: "center" });
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, w / 2, 22, { align: "center" });

    const total = pending.reduce((s, r) => s + r.remaining, 0);

    autoTable(doc, {
      startY: 28,
      head: [["Entrega", "Cliente", "Serviço", "Total", "Pago", "Saldo"]],
      body: pending.map(r => [
        r.reference_date ? formatDateBR(r.reference_date) : "—",
        r.clientName,
        r.description.length > 35 ? r.description.slice(0, 32) + "..." : r.description,
        fmt(r.total),
        fmt(r.paid),
        fmt(r.remaining),
      ]),
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      foot: [[{ content: "TOTAL A RECEBER", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } }, { content: fmt(total), styles: { halign: "right", fontStyle: "bold" } }]],
    });
    
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const exportCSV = () => {
    const header = "Entrega,Cliente,Serviço,Total,Pago,Em Aberto,Status\n";
    const body = filtered
      .map(r =>
        [
          r.reference_date ? formatDateBR(r.reference_date) : "",
          `"${r.clientName.replace(/"/g, '""')}"`,
          `"${r.description.replace(/"/g, '""')}"`,
          r.total.toFixed(2),
          r.paid.toFixed(2),
          r.remaining.toFixed(2),
          statusLabel[r.payment_status]?.label ?? r.payment_status,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `servicos_nao_pagos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-muted-foreground">Serviços</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="rounded-lg border p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-muted-foreground">Valor total</p>
          <p className="text-2xl font-bold">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-lg border p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-muted-foreground">Já recebido</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-red-300 p-4 flex-1 min-w-[180px]">
          <p className="text-sm text-red-600 font-medium">Em aberto</p>
          <p className="text-2xl font-bold text-red-700">{fmt(totalRemaining)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente ou serviço..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select
          value={payFilter}
          onChange={e => setPayFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="abertos">Com saldo em aberto</option>
          <option value="pagos">Pagos</option>
          <option value="aguardando">Sem pagamento</option>
          <option value="entrada_pendente">Entrada pendente</option>
          <option value="pagamento_parcial">Parcial</option>
        </select>
        <Button variant="outline" onClick={exportPendingReport} disabled={filtered.filter(r => r.payment_status !== "pago_total" && r.payment_status !== "concluido_pago").length === 0} className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100">
          <FileDown className="h-4 w-4 mr-2" /> Relatório a Receber
        </Button>
        <Button variant="outline" onClick={exportPDF} disabled={filtered.length === 0}>
          <FileDown className="h-4 w-4 mr-2" /> PDF Geral
        </Button>
        <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>OS</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Em aberto</TableHead>
              <TableHead>Pagamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && filtered.map(r => {
              const s = statusLabel[r.payment_status] ?? { label: r.payment_status, color: "" };
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.reference_date ? formatDateBR(r.reference_date) : "—"}</TableCell>
                  <TableCell className="font-medium">{r.clientName}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{woStatusLabel[r.wo_status] ?? r.wo_status}</TableCell>
                  <TableCell className="text-right">{fmt(r.total)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(r.paid)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.remaining > 0.01 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(r.remaining)}</TableCell>
                  <TableCell><Badge className={s.color}>{s.label}</Badge></TableCell>
                </TableRow>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum serviço encontrado no período.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
