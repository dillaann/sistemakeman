import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt, formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { matchEntries } from "@/lib/bank-reconciliation/matching";
import type { FinancialTxCandidate, ParsedStatementEntry } from "@/lib/bank-reconciliation/types";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { CreateTransactionDialog } from "./CreateTransactionDialog";
import { ArrowLeft, CheckCircle2, XCircle, Plus, Trash2, EyeOff, Link2 } from "lucide-react";

interface Props {
  sessionId: string;
  onBack: () => void;
}

type Direction = "entrada" | "saida";

export function SessionView({ sessionId, onBack }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["recon-session", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("bank_reconciliation_sessions").select("*").eq("id", sessionId).single();
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["recon-entries", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("bank_statement_entries").select("*").eq("session_id", sessionId).order("entry_date");
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => (await supabase.from("financial_accounts").select("id, name").eq("active", true)).data ?? [],
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["financial-categories"],
    queryFn: async () => (await supabase.from("financial_categories").select("id, name, type")).data ?? [],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["recon-transactions", sessionId, session?.period_start, session?.period_end, session?.account_id],
    enabled: !!session?.period_start && !!session?.period_end,
    queryFn: async () => {
      const start = session!.period_start!;
      const end = session!.period_end!;
      // ±5 dias buffer
      const from = new Date(start); from.setDate(from.getDate() - 5);
      const to = new Date(end); to.setDate(to.getDate() + 5);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);
      let q = supabase.from("financial_transactions").select("id, type, amount, due_date, paid_date, description, status, client_id, category, account_id, matched:bank_statement_entries!matched_transaction_id(id)")
        .gte("due_date", fromStr).lte("due_date", toStr);
      if (session!.account_id) q = q.or(`account_id.eq.${session!.account_id},account_id.is.null`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Build match candidates
  const candidateTxs: FinancialTxCandidate[] = useMemo(() => transactions.map((t: any) => ({
    id: t.id, type: t.type, amount: Number(t.amount), due_date: t.due_date, paid_date: t.paid_date,
    description: t.description, status: t.status, category: t.category,
  })), [transactions]);

  const parsedEntries: ParsedStatementEntry[] = useMemo(() => entries.map((e) => ({
    entry_date: e.entry_date, entry_time: e.entry_time as any, direction: e.direction as Direction,
    amount: Number(e.amount), description: e.description, counterparty_name: e.counterparty_name,
    counterparty_document: e.counterparty_document, pix_key: e.pix_key, bank: e.bank,
    document_number: e.document_number, type: e.type,
  })), [entries]);

  const matches = useMemo(() => {
    // Only score pending entries (not already confirmed by user)
    const pendingIdx = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.status === "pendente");
    const pendingEntries = pendingIdx.map(({ i }) => parsedEntries[i]);
    const usedTxIds = new Set(entries.filter((e) => e.matched_transaction_id).map((e) => e.matched_transaction_id!));
    const availableTxs = candidateTxs.filter((t) => !usedTxIds.has(t.id));
    const results = matchEntries(pendingEntries, availableTxs);
    // Map back to entry ids
    return results.map((r, idx) => ({ ...r, entryId: entries[pendingIdx[idx].i].id }));
  }, [entries, parsedEntries, candidateTxs]);

  const txById = useMemo(() => new Map(transactions.map((t: any) => [t.id, t])), [transactions]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const suggested = matches.filter((m) => m.transactionId !== null);
  const pending = matches.filter((m) => m.transactionId === null && (m.top[0]?.score ?? 0) >= 40);
  const onlyStatement = matches.filter((m) => m.transactionId === null && (m.top[0]?.score ?? 0) < 40);
  const usedTxIds = new Set([
    ...entries.filter((e) => e.matched_transaction_id).map((e) => e.matched_transaction_id!),
    ...suggested.map((s) => s.transactionId!),
  ]);
  const onlySystem = transactions.filter((t: any) => !usedTxIds.has(t.id));

  const totals = useMemo(() => {
    const totalIn = entries.filter((e) => e.direction === "entrada").reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = entries.filter((e) => e.direction === "saida").reduce((s, e) => s + Number(e.amount), 0);
    const conciliados = entries.filter((e) => e.status === "conciliado" || e.status === "adicionado").length;
    const valorConciliado = entries.filter((e) => e.status === "conciliado" || e.status === "adicionado").reduce((s, e) => s + Number(e.amount), 0);
    return { totalIn, totalOut, conciliados, valorConciliado, saldoExtrato: Number(session?.statement_balance ?? 0), saldoNet: totalIn - totalOut };
  }, [entries, session]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recon-entries", sessionId] });
    qc.invalidateQueries({ queryKey: ["recon-transactions"] });
  };

  // ---- Actions ----
  const [confirm, setConfirm] = useState<null | { title: string; description: any; run: () => Promise<void> }>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEntry, setCreateEntry] = useState<any>(null);

  const askConfirmMatch = (entryId: string, txId: string, score: number) => {
    const e = entryById.get(entryId)!;
    const t: any = txById.get(txId);
    setConfirm({
      title: "Confirmar conciliação",
      description: (
        <div className="space-y-2 mt-2 text-sm">
          <div className="p-2 rounded bg-muted/40">
            <div className="text-xs text-muted-foreground">Extrato</div>
            <div>{formatDateBR(e.entry_date)} · {fmt(Number(e.amount))} · {e.description}</div>
          </div>
          <div className="p-2 rounded bg-muted/40">
            <div className="text-xs text-muted-foreground">Lançamento</div>
            <div>{formatDateBR(t.paid_date || t.due_date)} · {fmt(Number(t.amount))} · {t.description}</div>
          </div>
          <div className="text-xs">Confiança: <Badge>{score}</Badge></div>
        </div>
      ),
      run: async () => {
        const { error } = await supabase.from("bank_statement_entries").update({
          status: "conciliado", matched_transaction_id: txId, match_score: score,
          confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString(),
        }).eq("id", entryId);
        if (error) throw error;
        await supabase.from("bank_reconciliation_actions").insert({
          session_id: sessionId, actor_id: user?.id ?? null, action: "confirm_match",
          statement_entry_id: entryId, transaction_id: txId, after: { score },
        });
        toast({ title: "Conciliação confirmada" });
        invalidate();
      },
    });
  };

  const askIgnore = (entryId: string) => {
    const e = entryById.get(entryId)!;
    setConfirm({
      title: "Ignorar movimentação",
      description: <p className="mt-2 text-sm">Marcar como ignorada: {formatDateBR(e.entry_date)} · {fmt(Number(e.amount))} · {e.description}</p>,
      run: async () => {
        const { error } = await supabase.from("bank_statement_entries").update({ status: "ignorado" }).eq("id", entryId);
        if (error) throw error;
        await supabase.from("bank_reconciliation_actions").insert({
          session_id: sessionId, actor_id: user?.id ?? null, action: "ignore", statement_entry_id: entryId,
        });
        invalidate();
      },
    });
  };

  const askUnmatch = (entryId: string) => {
    setConfirm({
      title: "Desfazer conciliação",
      description: <p className="mt-2 text-sm">A movimentação voltará para o status pendente. O lançamento financeiro não será alterado nem excluído.</p>,
      run: async () => {
        const { error } = await supabase.from("bank_statement_entries").update({
          status: "pendente", matched_transaction_id: null, match_score: null, confirmed_by: null, confirmed_at: null,
        }).eq("id", entryId);
        if (error) throw error;
        await supabase.from("bank_reconciliation_actions").insert({
          session_id: sessionId, actor_id: user?.id ?? null, action: "unmatch", statement_entry_id: entryId,
        });
        invalidate();
      },
    });
  };

  const askDeleteTx = (tx: any) => {
    setConfirm({
      title: "Excluir lançamento do financeiro",
      description: (
        <div className="mt-2 text-sm">
          <p className="text-destructive font-medium">Ação destrutiva. O lançamento será removido do sistema financeiro.</p>
          <p className="mt-2">{formatDateBR(tx.due_date)} · {fmt(Number(tx.amount))} · {tx.description}</p>
        </div>
      ),
      run: async () => {
        const { error } = await supabase.from("financial_transactions").delete().eq("id", tx.id);
        if (error) throw error;
        await supabase.from("bank_reconciliation_actions").insert({
          session_id: sessionId, actor_id: user?.id ?? null, action: "delete_transaction", transaction_id: tx.id, before: tx,
        });
        toast({ title: "Lançamento excluído" });
        invalidate();
      },
    });
  };

  const askMarkTxPaid = (tx: any) => {
    setConfirm({
      title: "Marcar como conciliado manualmente",
      description: <p className="mt-2 text-sm">O lançamento será marcado como pago (sem vínculo com uma linha específica do extrato).</p>,
      run: async () => {
        const { error } = await supabase.from("financial_transactions").update({ status: "pago", paid_date: tx.paid_date || tx.due_date }).eq("id", tx.id);
        if (error) throw error;
        await supabase.from("bank_reconciliation_actions").insert({
          session_id: sessionId, actor_id: user?.id ?? null, action: "edit_transaction", transaction_id: tx.id, before: tx, after: { status: "pago" },
        });
        invalidate();
      },
    });
  };

  if (!session) return <div className="p-4 text-sm text-muted-foreground">Carregando sessão...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          <div>
            <h2 className="font-semibold">{session.file_name}</h2>
            <p className="text-xs text-muted-foreground">
              Período {formatDateBR(session.period_start)} — {formatDateBR(session.period_end)} · Importado em {formatDateTimeBR(session.created_at)}
            </p>
          </div>
        </div>
        <Badge variant={session.status === "aberta" ? "default" : "secondary"}>{session.status}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Entradas</div><div className="text-lg font-bold text-green-600">{fmt(totals.totalIn)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Saídas</div><div className="text-lg font-bold text-red-600">{fmt(totals.totalOut)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Conciliadas</div><div className="text-lg font-bold">{totals.conciliados}/{entries.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Saldo líquido do extrato</div><div className="text-lg font-bold">{fmt(totals.saldoNet)}</div></Card>
      </div>

      <Tabs defaultValue="sugeridos">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="sugeridos">🟢 Sugeridos ({suggested.length})</TabsTrigger>
          <TabsTrigger value="pendentes">🟡 Pendentes ({pending.length})</TabsTrigger>
          <TabsTrigger value="extrato">🔵 Só no Extrato ({onlyStatement.length + entries.filter((e) => e.status === "adicionado" || e.status === "ignorado").length})</TabsTrigger>
          <TabsTrigger value="sistema">🔴 Só no Sistema ({onlySystem.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sugeridos" className="space-y-2 mt-3">
          {suggested.length === 0 && <p className="text-sm text-muted-foreground">Sem sugestões de alta confiança.</p>}
          {suggested.map((m) => {
            const e = entryById.get(m.entryId)!;
            const t: any = txById.get(m.transactionId!);
            if (!t) return null;
            return (
              <Card key={m.entryId} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-muted-foreground">Extrato</div>
                  <div className="text-sm">{formatDateBR(e.entry_date)} · <strong>{fmt(Number(e.amount))}</strong> · {e.description}</div>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-muted-foreground">Lançamento</div>
                  <div className="text-sm">{formatDateBR(t.paid_date || t.due_date)} · <strong>{fmt(Number(t.amount))}</strong> · {t.description}</div>
                </div>
                <Badge>score {m.score}</Badge>
                <Button size="sm" onClick={() => askConfirmMatch(m.entryId, m.transactionId!, m.score)}><CheckCircle2 className="h-4 w-4 mr-1" />Confirmar</Button>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="pendentes" className="space-y-2 mt-3">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nada pendente.</p>}
          {pending.map((m) => {
            const e = entryById.get(m.entryId)!;
            return (
              <Card key={m.entryId} className="p-3 space-y-2">
                <div className="text-sm">{formatDateBR(e.entry_date)} · <strong>{fmt(Number(e.amount))}</strong> ({e.direction}) · {e.description}</div>
                <div className="space-y-1">
                  {m.top.map((c) => {
                    const t: any = txById.get(c.transactionId);
                    if (!t) return null;
                    return (
                      <div key={c.transactionId} className="flex items-center gap-2 text-xs bg-muted/40 rounded p-2">
                        <span className="flex-1">{formatDateBR(t.paid_date || t.due_date)} · {fmt(Number(t.amount))} · {t.description}</span>
                        <Badge variant="outline">{c.score}</Badge>
                        <Button size="sm" variant="outline" onClick={() => askConfirmMatch(m.entryId, c.transactionId, c.score)}><Link2 className="h-3 w-3 mr-1" />Escolher</Button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setCreateEntry(e); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-1" />Criar lançamento</Button>
                  <Button size="sm" variant="ghost" onClick={() => askIgnore(m.entryId)}><EyeOff className="h-4 w-4 mr-1" />Ignorar</Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="extrato" className="space-y-2 mt-3">
          {onlyStatement.length === 0 && entries.filter((e) => e.status === "adicionado" || e.status === "ignorado").length === 0 && (
            <p className="text-sm text-muted-foreground">Nada.</p>
          )}
          {[...onlyStatement.map((m) => entryById.get(m.entryId)!), ...entries.filter((e) => e.status === "adicionado" || e.status === "ignorado")].filter(Boolean).map((e) => (
            <Card key={e!.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm">{formatDateBR(e!.entry_date)} · <strong>{fmt(Number(e!.amount))}</strong> ({e!.direction}) · {e!.description}</div>
                <div className="text-xs text-muted-foreground">{e!.counterparty_name} {e!.document_number ? `· doc ${e!.document_number}` : ""}</div>
              </div>
              <Badge variant={e!.status === "adicionado" ? "default" : e!.status === "ignorado" ? "secondary" : "outline"}>{e!.status}</Badge>
              {e!.status === "pendente" && <>
                <Button size="sm" onClick={() => { setCreateEntry(e); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-1" />Adicionar ao Financeiro</Button>
                <Button size="sm" variant="ghost" onClick={() => askIgnore(e!.id)}><EyeOff className="h-4 w-4 mr-1" />Ignorar</Button>
              </>}
              {(e!.status === "adicionado" || e!.status === "conciliado") && (
                <Button size="sm" variant="ghost" onClick={() => askUnmatch(e!.id)}><XCircle className="h-4 w-4 mr-1" />Desfazer</Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sistema" className="space-y-2 mt-3">
          {onlySystem.length === 0 && <p className="text-sm text-muted-foreground">Todos os lançamentos do período foram conciliados.</p>}
          {onlySystem.map((t: any) => (
            <Card key={t.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm">{formatDateBR(t.due_date)} · <strong>{fmt(Number(t.amount))}</strong> ({t.type === "a_receber" ? "entrada" : "saída"})</div>
                <div className="text-xs text-muted-foreground">{t.description} · status: {t.status}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => askMarkTxPaid(t)}><CheckCircle2 className="h-4 w-4 mr-1" />Marcar pago</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => askDeleteTx(t)}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <ConfirmActionDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        onConfirm={async () => {
          try { await confirm?.run(); } catch (err) { toast({ title: "Erro", description: (err as Error).message, variant: "destructive" }); }
          setConfirm(null);
        }}
      />

      <CreateTransactionDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateEntry(null); }}
        entry={createEntry}
        sessionId={sessionId}
        accountId={session.account_id}
        accounts={accounts}
        categories={categories as any}
        onCreated={invalidate}
      />
    </div>
  );
}
