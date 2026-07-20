import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Paintbrush, FileDown } from "lucide-react";
import { formatDateBR, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PaintSheetDialog from "@/components/painting/PaintSheetDialog";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { generatePaintSheetPDF } from "@/lib/generatePaintSheetPDF";

const STATUS_META: Record<string, { label: string; className: string }> = {
  aguardando: { label: "Aguardando", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  em_pintura: { label: "Em Pintura", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  finalizado: { label: "Finalizado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
};

export default function Painting() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["paint-sheets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paint_sheets")
        .select("*")
        .order("sheet_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheets.filter((s: any) => {
      if (statusFilter !== "todos" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.sheet_number?.toLowerCase().includes(q) ||
        s.client_name?.toLowerCase().includes(q) ||
        s.responsible?.toLowerCase().includes(q)
      );
    });
  }, [sheets, search, statusFilter]);

  const stats = useMemo(() => {
    const c = { total: sheets.length, aguardando: 0, em_pintura: 0, finalizado: 0 };
    sheets.forEach((s: any) => {
      if (s.status in c) (c as any)[s.status]++;
    });
    return c;
  }, [sheets]);

  const doDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("paint_sheets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ficha excluída" });
      qc.invalidateQueries({ queryKey: ["paint-sheets"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: String(e?.message || e), variant: "destructive" }),
  });

  const exportPDF = async (s: any) => {
    const { data: items } = await supabase.from("paint_sheet_items").select("*").eq("sheet_id", s.id).order("item_number");
    await generatePaintSheetPDF({
      sheet_number: s.sheet_number,
      sheet_date: s.sheet_date,
      client_name: s.client_name,
      responsible: s.responsible,
      status: s.status,
      notes: s.notes,
      work_order_short: s.work_order_id ? `OS-${String(s.work_order_id).slice(0, 8)}` : null,
      items: (items || []).map((i: any) => ({
        item_number: i.item_number,
        part_name: i.part_name,
        quantity: i.quantity,
        width: i.width,
        height: i.height,
        color: i.color,
      })),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Paintbrush className="h-6 w-6 text-primary" /> Pintura
          </h1>
          <p className="text-sm text-muted-foreground">Fichas de Controle de Pintura Epóxi</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Ficha
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, cls: "text-foreground" },
          { label: "Aguardando", value: stats.aguardando, cls: "text-amber-600" },
          { label: "Em Pintura", value: stats.em_pintura, cls: "text-blue-600" },
          { label: "Finalizadas", value: stats.finalizado, cls: "text-emerald-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.cls)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por número, cliente ou responsável" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="em_pintura">Em Pintura</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma ficha encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Número</th>
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Cliente / Obra</th>
                    <th className="p-3 font-medium">Responsável</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s: any) => {
                    const meta = STATUS_META[s.status] || STATUS_META.aguardando;
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-mono font-semibold">{s.sheet_number}</td>
                        <td className="p-3">{formatDateBR(s.sheet_date)}</td>
                        <td className="p-3">{s.client_name}</td>
                        <td className="p-3">{s.responsible || "-"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => exportPDF(s)} title="PDF">
                              <FileDown className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(s)} title="Excluir">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PaintSheetDialog open={dialogOpen} onOpenChange={setDialogOpen} sheet={editing} />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Excluir ficha ${deleteTarget?.sheet_number || ""}?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (deleteTarget) doDelete.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
