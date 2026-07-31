import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FileDown, FileSpreadsheet, Save, Wallet } from "lucide-react";
import { analyzeCashFlow, buildCashFlow, buildRecommendations } from "@/lib/cashflow";
import { generateCashFlowExcel, generateCashFlowPDF } from "@/lib/generateCashFlowReport";
import { useCashFlowEvents, useCashFlowSettings, useCurrentBalance } from "@/hooks/useCashFlow";
import { formatDateBR } from "@/lib/utils";
import CashFlowAlerts from "./CashFlowAlerts";
import CashFlowChart from "./CashFlowChart";
import CashFlowTable from "./CashFlowTable";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Horizon = "month" | "30" | "60" | "90";

interface CashFlowTabProps {
  dateRange?: { start: Date; end: Date };
}

export default function CashFlowTab({ dateRange }: CashFlowTabProps) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = userRole === "admin";
  const [horizon, setHorizon] = useState<Horizon>("month");
  const [minInput, setMinInput] = useState<string>("");

  const range = useMemo(() => {
    const today = new Date();
    if (horizon === "month") {
      const start = dateRange?.start ?? new Date(today.getFullYear(), today.getMonth(), 1);
      const end = dateRange?.end ?? new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start, end };
    }
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + Number(horizon));
    return { start, end };
  }, [horizon, dateRange]);

  const { data: settings } = useCashFlowSettings();
  const { data: currentBalance = 0, isLoading: loadingBalance } = useCurrentBalance();
  const { data: events = [], isLoading: loadingEvents } = useCashFlowEvents(range);

  const minBalance = Number(settings?.min_daily_balance ?? 5000);

  const days = useMemo(
    () => buildCashFlow({ events, start: range.start, end: range.end, currentBalance }),
    [events, range, currentBalance],
  );
  const analysis = useMemo(() => analyzeCashFlow(days, minBalance), [days, minBalance]);
  const recommendations = useMemo(() => buildRecommendations(days, analysis), [days, analysis]);

  const periodLabel = `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`;

  const saveMin = useMutation({
    mutationFn: async (value: number) => {
      if (!settings?.id) throw new Error("Configuração não encontrada");
      const { error } = await supabase
        .from("cashflow_settings")
        .update({ min_daily_balance: value })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow-settings"] });
      setMinInput("");
      toast({ title: "Saldo mínimo atualizado!" });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const handleSaveMin = () => {
    const parsed = Number(minInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor numérico válido.", variant: "destructive" });
      return;
    }
    saveMin.mutate(parsed);
  };

  const reportConfig = { periodLabel, days, analysis, currentBalance, recommendations };
  const loading = loadingBalance || loadingEvents;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Saldo atual em conta</p>
          </div>
          <p className="text-2xl font-bold">{fmt(currentBalance)}</p>
          <p className="text-xs text-muted-foreground">Ponto de partida da projeção</p>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Saldo mínimo diário necessário</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={String(minBalance)}
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <Button onClick={handleSaveMin} disabled={saveMin.isPending || !minInput}>
                    <Save className="h-4 w-4 mr-1" /> Salvar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Atual: {fmt(minBalance)}
                {!isAdmin && " — somente o administrador pode alterar"}
              </p>
            </div>
            <div className="w-full sm:w-48">
              <Label className="text-xs">Projeção</Label>
              <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mês selecionado</SelectItem>
                  <SelectItem value="30">Próximos 30 dias</SelectItem>
                  <SelectItem value="60">Próximos 60 dias</SelectItem>
                  <SelectItem value="90">Próximos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Período: {periodLabel}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => generateCashFlowPDF(reportConfig)} disabled={loading}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => generateCashFlowExcel(reportConfig)} disabled={loading}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Calculando fluxo de caixa...</Card>
      ) : (
        <>
          <CashFlowAlerts analysis={analysis} recommendations={recommendations} />
          <CashFlowChart days={days} minBalance={minBalance} />
          <CashFlowTable days={days} minBalance={minBalance} />
        </>
      )}
    </div>
  );
}
