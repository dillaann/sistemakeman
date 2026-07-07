import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateBR } from "@/lib/utils";
import { generateReceiptPDF } from "@/lib/generateReceiptPDF";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, FileDown } from "lucide-react";

type ReceiptType = "total" | "entrada50" | "saldo" | "custom";

const fmtCurrency = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Receipts = () => {
  const { toast } = useToast();
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [receiptType, setReceiptType] = useState<ReceiptType>("entrada50");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const { data: quotes = [] } = useQuery({
    queryKey: ["receipts-quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, clients(*)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_team_display_names");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || "Sem nome"; });
      return map;
    },
  });

  const selectedQuote = useMemo(
    () => quotes.find((q: any) => q.id === selectedQuoteId) as any,
    [quotes, selectedQuoteId]
  );

  const quoteTotal = selectedQuote ? Number(selectedQuote.total) : 0;
  const alreadyPaid = selectedQuote ? Number(selectedQuote.down_payment ?? 0) : 0;
  const remaining = Math.max(quoteTotal - alreadyPaid, 0);

  const computedAmount = useMemo(() => {
    switch (receiptType) {
      case "total": return quoteTotal;
      case "entrada50": return quoteTotal * 0.5;
      case "saldo": return remaining;
      case "custom": {
        const parsed = parseFloat(customAmount.replace(/\./g, "").replace(",", "."));
        return isNaN(parsed) ? 0 : parsed;
      }
    }
  }, [receiptType, quoteTotal, remaining, customAmount]);

  const paymentLabel = useMemo(() => {
    switch (receiptType) {
      case "total": return "Valor total";
      case "entrada50": return "Entrada (50%)";
      case "saldo": return "Saldo restante";
      case "custom": return "Valor personalizado";
    }
  }, [receiptType]);

  const handleGenerate = async () => {
    if (!selectedQuote) {
      toast({ title: "Selecione um orçamento", variant: "destructive" });
      return;
    }
    if (computedAmount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const client = selectedQuote.clients as any;
      const dateStr = formatDateBR(new Date());
      const createdByName = selectedQuote.created_by ? (profilesMap[selectedQuote.created_by] || null) : null;

      await generateReceiptPDF({
        date: dateStr,
        client: {
          name: client?.name ?? "—",
          cpf_cnpj: client?.cpf_cnpj,
          phone: client?.phone,
          address: client?.address,
          number: client?.number,
          complement: client?.complement,
          neighborhood: client?.neighborhood,
          city: client?.city,
          state: client?.state,
          cep: client?.cep,
        },
        amount: computedAmount,
        quoteTotal,
        paymentLabel,
        description: note || selectedQuote.description,
        createdByName,
      });
      toast({ title: "Recibo gerado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao gerar recibo", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Receipt className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Recibos</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Selecione um orçamento e gere um recibo em PDF para enviar ao cliente.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gerar recibo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Quote selection */}
          <div className="space-y-2">
            <Label>Orçamento</Label>
            <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o orçamento da cliente" />
              </SelectTrigger>
              <SelectContent>
                {quotes.map((q: any) => (
                  <SelectItem key={q.id} value={q.id}>
                    {(q.clients?.name ?? "Cliente")} — {fmtCurrency(Number(q.total))} ({formatDateBR(q.issue_date || q.created_at)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedQuote && (
            <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border p-3 bg-muted/30">
              <div>
                <span className="text-muted-foreground">Valor do orçamento</span>
                <p className="font-semibold">{fmtCurrency(quoteTotal)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Já recebido</span>
                <p className="font-semibold">{fmtCurrency(alreadyPaid)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Saldo em aberto</span>
                <p className="font-semibold">{fmtCurrency(remaining)}</p>
              </div>
            </div>
          )}

          {/* Receipt type */}
          <div className="space-y-2">
            <Label>Tipo de valor</Label>
            <RadioGroup value={receiptType} onValueChange={(v) => setReceiptType(v as ReceiptType)} className="grid grid-cols-2 gap-2">
              {([
                { v: "total", label: "Valor total" },
                { v: "entrada50", label: "Entrada de 50%" },
                { v: "saldo", label: "Saldo restante" },
                { v: "custom", label: "Valor personalizado" },
              ] as const).map((opt) => (
                <label
                  key={opt.v}
                  htmlFor={`rt-${opt.v}`}
                  className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value={opt.v} id={`rt-${opt.v}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {receiptType === "custom" && (
            <div className="space-y-2">
              <Label>Valor personalizado (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="Ex.: 2.000,00"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              placeholder="Ex.: Entrada para início da produção"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg border p-4 flex items-center justify-between bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">Valor do recibo</p>
              <p className="text-2xl font-bold">{fmtCurrency(computedAmount)}</p>
              <p className="text-xs text-muted-foreground">{paymentLabel}</p>
            </div>
            <Button onClick={handleGenerate} disabled={generating || !selectedQuote} size="lg">
              <FileDown className="h-4 w-4 mr-2" />
              {generating ? "Gerando..." : "Gerar PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Receipts;
