import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Entry {
  id: string; entry_date: string; direction: "entrada" | "saida"; amount: number;
  description: string | null; counterparty_name: string | null; type: string | null; document_number: string | null;
}
interface Account { id: string; name: string }
interface Category { id: string; name: string; type: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: Entry | null;
  sessionId: string;
  accountId: string | null;
  accounts: Account[];
  categories: Category[];
  onCreated: () => void;
}

export function CreateTransactionDialog({ open, onOpenChange, entry, sessionId, accountId, accounts, categories, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Initialize from entry
  const initFromEntry = () => {
    if (!entry) return;
    setDescription(entry.description || entry.counterparty_name || "Movimentação bancária");
    setAmount(String(entry.amount));
    setDate(entry.entry_date);
    setCategory("");
    setAccount(accountId ?? "");
    setNotes(entry.document_number ? `Doc: ${entry.document_number}` : "");
  };

  // Reset when opening
  if (open && entry && !amount) initFromEntry();

  const type: "a_receber" | "a_pagar" = entry?.direction === "entrada" ? "a_receber" : "a_pagar";
  const filteredCats = categories.filter((c) => c.type === (entry?.direction === "entrada" ? "entrada" : "saida"));

  const doCreate = async () => {
    if (!entry) return;
    setLoading(true);
    try {
      const { data: tx, error } = await supabase.from("financial_transactions").insert({
        type,
        status: "pago" as const,
        description,
        amount: parseFloat(amount.replace(",", ".")),
        due_date: date,
        paid_date: date,
        category: category || null,
        account_id: account || null,
        sync_origin: "bank_reconciliation",
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("bank_statement_entries").update({
        status: "adicionado", matched_transaction_id: tx.id, confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString(),
      }).eq("id", entry.id);
      if (e2) throw e2;
      await supabase.from("bank_reconciliation_actions").insert({
        session_id: sessionId, actor_id: user?.id ?? null, action: "create_transaction",
        statement_entry_id: entry.id, transaction_id: tx.id, after: { description, amount, date, category, account, notes },
      });
      toast({ title: "Lançamento criado e conciliado" });
      setAmount(""); setDescription(""); setDate("");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao criar lançamento", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false); setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAmount(""); setDescription(""); setDate(""); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar ao Financeiro ({entry?.direction === "entrada" ? "Entrada" : "Saída"})</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor *</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  {filteredCats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="bg-muted/40 rounded p-2 text-xs text-muted-foreground">
            Este lançamento será marcado como <strong>pago</strong> na data informada e a linha do extrato será marcada como <strong>adicionada</strong>. Nada muda até você confirmar.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => setConfirming(true)} disabled={!description || !amount || !date}>Revisar e Criar</Button>
        </DialogFooter>

        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirmar criação</DialogTitle></DialogHeader>
            <div className="text-sm space-y-1">
              <p><strong>Tipo:</strong> {type === "a_receber" ? "Entrada" : "Saída"}</p>
              <p><strong>Descrição:</strong> {description}</p>
              <p><strong>Valor:</strong> R$ {amount}</p>
              <p><strong>Data:</strong> {date}</p>
              <p><strong>Categoria:</strong> {category || "—"}</p>
              <p><strong>Conta:</strong> {accounts.find((a) => a.id === account)?.name || "—"}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button>
              <Button onClick={doCreate} disabled={loading}>{loading ? "Criando..." : "Confirmar e Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
