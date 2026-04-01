import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Wallet, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ExtratoDialog from "./ExtratoDialog";
import FinancialReportDialog from "./FinancialReportDialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const typeLabels: Record<string, string> = {
  conta_corrente: "Conta Corrente",
  conta_poupanca: "Conta Poupança",
  caixa_fisico: "Caixa Físico",
  cartao: "Cartão",
  outro: "Outro",
};

export default function ContasTab() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [extratoAccountId, setExtratoAccountId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "conta_corrente", initial_balance: "0", notes: "" });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["account-movements-all"],
    queryFn: async () => {
      const { data } = await supabase.from("account_movements").select("account_id, type, amount");
      return data ?? [];
    },
  });

  const getBalance = (accountId: string, initialBalance: number) => {
    const acctMovements = movements.filter(m => m.account_id === accountId);
    const entradas = acctMovements.filter(m => m.type === "entrada" || m.type === "transferencia_entrada").reduce((s, m) => s + Number(m.amount), 0);
    const saidas = acctMovements.filter(m => m.type === "saida" || m.type === "transferencia_saida").reduce((s, m) => s + Number(m.amount), 0);
    return initialBalance + entradas - saidas;
  };

  const totalConsolidado = accounts.filter(a => a.active).reduce((s, a) => s + getBalance(a.id, Number(a.initial_balance)), 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        type: form.type,
        initial_balance: parseFloat(form.initial_balance) || 0,
        notes: form.notes || null,
      };
      if (editId) {
        const { error } = await supabase.from("financial_accounts").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      setOpen(false);
      setEditId(null);
      setForm({ name: "", type: "conta_corrente", initial_balance: "0", notes: "" });
      toast({ title: editId ? "Conta atualizada!" : "Conta criada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("financial_accounts").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial-accounts"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      toast({ title: "Conta removida!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEdit = (a: any) => {
    setEditId(a.id);
    setForm({ name: a.name, type: a.type, initial_balance: String(a.initial_balance), notes: a.notes ?? "" });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Saldo consolidado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Saldo Consolidado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalConsolidado >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(totalConsolidado)}
            </p>
          </CardContent>
        </Card>
        {accounts.filter(a => a.active).slice(0, 3).map(a => {
          const bal = getBalance(a.id, Number(a.initial_balance));
          return (
            <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setExtratoAccountId(a.id)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{a.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${bal >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(bal)}</p>
                <p className="text-xs text-muted-foreground">{typeLabels[a.type] ?? a.type}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Contas Cadastradas</h3>
        <div className="flex gap-2">
          <FinancialReportDialog
            type="contas"
            transactions={movements.map(m => ({ date: m.date ?? "", description: m.description ?? "", category: m.category ?? "", amount: Number(m.amount), status: m.type }))}
            categories={[...new Set(movements.map(m => m.category).filter(Boolean) as string[])]}
            periodLabel="Todas as movimentações"
          />
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditId(null); setForm({ name: "", type: "conta_corrente", initial_balance: "0", notes: "" }); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div><Label>Nome da Conta *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Bradesco PJ" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conta_corrente">Conta Corrente</SelectItem>
                      <SelectItem value="conta_poupanca">Conta Poupança</SelectItem>
                      <SelectItem value="caixa_fisico">Caixa Físico</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Saldo Inicial (R$)</Label><Input type="number" step="0.01" value={form.initial_balance} onChange={e => setForm({ ...form, initial_balance: e.target.value })} /></div>
              </div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Saldo Inicial</TableHead>
              <TableHead className="text-right">Saldo Atual</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map(a => {
              const bal = getBalance(a.id, Number(a.initial_balance));
              return (
                <TableRow key={a.id} className={!a.active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="outline">{typeLabels[a.type] ?? a.type}</Badge></TableCell>
                  <TableCell className="text-right">{fmt(Number(a.initial_balance))}</TableCell>
                  <TableCell className={`text-right font-bold ${bal >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(bal)}</TableCell>
                  <TableCell>
                    <Switch checked={a.active} onCheckedChange={v => toggleActive.mutate({ id: a.id, active: v })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setExtratoAccountId(a.id)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      {userRole === "admin" && (
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {accounts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Extrato Dialog */}
      {extratoAccountId && (
        <ExtratoDialog
          accountId={extratoAccountId}
          accountName={accounts.find(a => a.id === extratoAccountId)?.name ?? ""}
          initialBalance={Number(accounts.find(a => a.id === extratoAccountId)?.initial_balance ?? 0)}
          open={!!extratoAccountId}
          onOpenChange={v => { if (!v) setExtratoAccountId(null); }}
        />
      )}
    </div>
  );
}
