import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CalendarX, Lightbulb, TrendingDown, Target } from "lucide-react";
import { formatDateBR } from "@/lib/utils";
import type { CashFlowAnalysis } from "@/lib/cashflow";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface CashFlowAlertsProps {
  analysis: CashFlowAnalysis;
  recommendations: string[];
}

export default function CashFlowAlerts({ analysis, recommendations }: CashFlowAlertsProps) {
  const { criticalDays, worstDay, biggestOutflowDay, cashNeed, minBalance } = analysis;
  const firstCritical = criticalDays.find((d) => !d.isPast) ?? criticalDays[0];

  const cards = [
    {
      label: "Dias críticos no período",
      value: String(criticalDays.length),
      hint: `Abaixo de ${fmt(minBalance)}`,
      icon: CalendarX,
      danger: criticalDays.length > 0,
    },
    {
      label: "Pior dia",
      value: worstDay ? fmt(worstDay.cumulative) : "—",
      hint: worstDay ? formatDateBR(worstDay.date) : "Sem dados",
      icon: TrendingDown,
      danger: (worstDay?.cumulative ?? 0) < minBalance,
    },
    {
      label: "Maior saída",
      value: biggestOutflowDay ? fmt(biggestOutflowDay.outflow) : "—",
      hint: biggestOutflowDay ? formatDateBR(biggestOutflowDay.date) : "Sem saídas",
      icon: AlertTriangle,
      danger: false,
    },
    {
      label: "Necessidade de caixa",
      value: fmt(cashNeed),
      hint: cashNeed > 0 ? "Precisa entrar no período" : "Caixa suficiente",
      icon: Target,
      danger: cashNeed > 0,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-lg font-bold truncate ${c.danger ? "text-destructive" : "text-foreground"}`}>
                  {c.value}
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.hint}</p>
              </div>
              <c.icon className={`h-5 w-5 shrink-0 ${c.danger ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
          </Card>
        ))}
      </div>

      {firstCritical && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Atenção — no dia {formatDateBR(firstCritical.date)} o saldo projetado é de {fmt(firstCritical.cumulative)},
            abaixo do mínimo necessário de {fmt(minBalance)}.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Recomendações automáticas</h3>
        </div>
        <ul className="space-y-1.5">
          {recommendations.map((r) => (
            <li key={r} className="text-sm text-muted-foreground flex gap-2">
              <span className="text-primary">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
