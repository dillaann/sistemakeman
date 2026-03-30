import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Download, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const typeLabels: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_entrada: "Transf. Entrada",
  transferencia_saida: "Transf. Saída",
};

interface Props {
  accountId: string;
  accountName: string;
  initialBalance: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function ExtratoDialog({ accountId, accountName, initialBalance, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const { data: movements = [] } = useQuery({
    queryKey: ["account-extrato", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_movements")
        .select("*")
        .eq("account_id", accountId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!accountId,
  });

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      return true;
    });
  }, [movements, typeFilter, dateFrom, dateTo]);

  const rows = useMemo(() => {
    let acc = initialBalance;
    return filtered.map(m => {
      const val = Number(m.amount);
      const isCredit = m.type === "entrada" || m.type === "transferencia_entrada";
      acc += isCredit ? val : -val;
      return { ...m, saldo: acc };
    });
  }, [filtered, initialBalance]);

  const exportCSV = () => {
    const header = "Data,Descrição,Tipo,Valor,Saldo\n";
    const csv = rows.map(r => {
      const isCredit = r.type === "entrada" || r.type === "transferencia_entrada";
      return `${r.date},"${r.description}",${typeLabels[r.type]},${isCredit ? "+" : "-"}${Number(r.amount).toFixed(2)},${r.saldo.toFixed(2)}`;
    }).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `extrato_${accountName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const movement = movements.find(m => m.id === id);
      if (movement?.financial_transaction_id) {
        await supabase.from("financial_transactions").delete().eq("id", movement.financial_transaction_id);
      }
      const { error } = await supabase.from("account_movements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-extrato", accountId] });
      qc.invalidateQueries({ queryKey: ["account-movements-list"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      setDeleteTarget(null);
      setDeleteReason("");
      toast({ title: "Movimentação excluída!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Extrato — {accountName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" />
          <span className="text-muted-foreground">a</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="transferencia_entrada">Transf. Entrada</SelectItem>
              <SelectItem value="transferencia_saida">Transf. Saída</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto">
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                {userRole === "admin" && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma movimentação.</TableCell></TableRow>
              )}
              {rows.map(r => {
                const isCredit = r.type === "entrada" || r.type === "transferencia_entrada";
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="max-w-[250px] truncate">{r.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isCredit ? "text-green-700 border-green-500/30" : "text-red-700 border-red-500/30"}>
                        {typeLabels[r.type] ?? r.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.category ?? "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${isCredit ? "text-green-700" : "text-red-700"}`}>
                      {isCredit ? "+" : "-"}{fmt(Number(r.amount))}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${r.saldo >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {fmt(r.saldo)}
                    </TableCell>
                    {userRole === "admin" && (
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {!!deleteTarget && (
          <div className="border border-destructive/30 rounded-lg p-4 space-y-3 bg-destructive/5">
            <p className="font-semibold text-destructive">Confirmar Exclusão</p>
            <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta movimentação do extrato?</p>
            <div><Label>Motivo da Exclusão *</Label><Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Informe o motivo..." /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}>Cancelar</Button>
              <Button variant="destructive" size="sm" disabled={!deleteReason.trim() || deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
