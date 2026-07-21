import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { parseOFX } from "@/lib/bank-reconciliation/parsers/ofx";
import { parseCSVFile } from "@/lib/bank-reconciliation/parsers/csv";
import { parseXLSXFile } from "@/lib/bank-reconciliation/parsers/xlsx";
import { guessColumnMap, type ColumnMap } from "@/lib/bank-reconciliation/parsers/tabular";
import type { ParsedStatementEntry } from "@/lib/bank-reconciliation/types";
import { Upload } from "lucide-react";

interface Account { id: string; name: string }
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onCreated: (sessionId: string) => void;
}

const COL_KEYS: (keyof ColumnMap)[] = ["date", "amount", "credit", "debit", "direction", "description", "type", "counterparty", "document"];
const COL_LABEL: Record<keyof ColumnMap, string> = {
  date: "Data", amount: "Valor único", credit: "Crédito (entrada)", debit: "Débito (saída)",
  direction: "Coluna C/D", description: "Descrição/Histórico", type: "Tipo", counterparty: "Favorecido/Pagador", document: "Documento",
};

export function ImportDialog({ open, onOpenChange, accounts, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<ParsedStatementEntry[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const period = useMemo(() => {
    if (entries.length === 0) return null;
    const dates = entries.map((e) => e.entry_date).sort();
    return { start: dates[0], end: dates[dates.length - 1] };
  }, [entries]);

  const reset = () => {
    setAccountId(""); setFile(null); setEntries([]); setHeaders([]); setMap(null); setCsvText(""); setXlsxFile(null); setBalance("");
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setEntries([]); setHeaders([]); setMap(null); setCsvText(""); setXlsxFile(null);
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith(".ofx")) {
        const text = await f.text();
        const parsed = parseOFX(text);
        setEntries(parsed);
        if (parsed.length === 0) toast({ title: "Nenhuma transação encontrada no OFX", variant: "destructive" });
      } else if (name.endsWith(".csv")) {
        const text = await f.text();
        setCsvText(text);
        const { entries: es, headers: hs, map: m } = parseCSVFile(text);
        setHeaders(hs); setMap(m); setEntries(es);
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        setXlsxFile(f);
        const { entries: es, headers: hs, map: m } = await parseXLSXFile(f);
        setHeaders(hs); setMap(m); setEntries(es);
      } else {
        toast({ title: "Formato não suportado", description: "Use OFX, CSV ou XLSX.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro ao ler arquivo", description: (err as Error).message, variant: "destructive" });
    }
  };

  const applyMap = async (newMap: ColumnMap) => {
    setMap(newMap);
    if (csvText) {
      const { entries: es } = parseCSVFile(csvText, newMap);
      setEntries(es);
    } else if (xlsxFile) {
      const { entries: es } = await parseXLSXFile(xlsxFile, newMap);
      setEntries(es);
    }
  };

  const canImport = accountId && file && entries.length > 0 && !loading;

  const doImport = async () => {
    if (!canImport || !file) return;
    setLoading(true);
    try {
      const { data: session, error: sErr } = await supabase.from("bank_reconciliation_sessions").insert({
        account_id: accountId,
        file_name: file.name,
        file_type: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
        period_start: period?.start,
        period_end: period?.end,
        statement_balance: balance ? parseFloat(balance.replace(",", ".")) : null,
        imported_by: user?.id ?? null,
        status: "aberta",
      }).select("id").single();
      if (sErr) throw sErr;

      const rows = entries.map((e) => ({
        session_id: session.id,
        entry_date: e.entry_date,
        entry_time: e.entry_time ?? null,
        type: e.type ?? null,
        direction: e.direction,
        amount: e.amount,
        description: e.description ?? null,
        counterparty_name: e.counterparty_name ?? null,
        counterparty_document: e.counterparty_document ?? null,
        pix_key: e.pix_key ?? null,
        bank: e.bank ?? null,
        agency: e.agency ?? null,
        account: e.account ?? null,
        document_number: e.document_number ?? null,
        external_id: e.external_id ?? null,
        raw: e.raw ?? null,
      }));
      // Chunk to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("bank_statement_entries").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      await supabase.from("bank_reconciliation_actions").insert({
        session_id: session.id, actor_id: user?.id ?? null, action: "import",
        after: { count: rows.length, file: file.name },
      });
      toast({ title: "Extrato importado", description: `${rows.length} movimentações carregadas.` });
      reset();
      onOpenChange(false);
      onCreated(session.id);
    } catch (err) {
      toast({ title: "Erro ao importar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Extrato Bancário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Conta bancária *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Arquivo (OFX, CSV ou XLSX)</Label>
            <Input type="file" accept=".ofx,.csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
          </div>
          <div>
            <Label>Saldo final do extrato (opcional)</Label>
            <Input placeholder="0,00" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>

          {headers.length > 0 && map && (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">Mapeamento de colunas — confirme antes de importar</p>
              <div className="grid grid-cols-2 gap-2">
                {COL_KEYS.map((k) => (
                  <div key={k}>
                    <Label className="text-xs">{COL_LABEL[k]}</Label>
                    <Select value={map[k] ?? "__none__"} onValueChange={(v) => applyMap({ ...map, [k]: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— nenhum —</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entries.length > 0 && (
            <div className="text-sm bg-muted/40 rounded p-3">
              <p><strong>{entries.length}</strong> movimentações detectadas · período <strong>{period?.start}</strong> a <strong>{period?.end}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">
                Entradas: {entries.filter((e) => e.direction === "entrada").length} · Saídas: {entries.filter((e) => e.direction === "saida").length}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canImport} onClick={doImport}>{loading ? "Importando..." : "Importar Extrato"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
