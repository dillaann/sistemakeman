import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { parseLocalDate } from "@/lib/utils";
import type { CashFlowDay } from "@/lib/cashflow";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortLabel = (d: string) => {
  const parsed = parseLocalDate(d);
  return parsed ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : d;
};

interface CashFlowChartProps {
  days: CashFlowDay[];
  minBalance: number;
}

export default function CashFlowChart({ days, minBalance }: CashFlowChartProps) {
  const data = useMemo(
    () =>
      days.map((d) => ({
        label: shortLabel(d.date),
        Entradas: Number(d.inflow.toFixed(2)),
        Saídas: Number(d.outflow.toFixed(2)),
        Acumulado: Number(d.cumulative.toFixed(2)),
      })),
    [days],
  );

  const minCumulative = useMemo(
    () => days.reduce((m, d) => Math.min(m, d.cumulative), minBalance),
    [days, minBalance],
  );

  if (data.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-3">Tendência de caixa no período</h3>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} width={48} />
            <Tooltip
              formatter={(value: number, name: string) => [fmt(Number(value)), name]}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Faixa de risco: abaixo do saldo mínimo configurado */}
            <ReferenceArea
              y1={minCumulative}
              y2={minBalance}
              fill="hsl(var(--destructive))"
              fillOpacity={0.12}
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={minBalance}
              stroke="hsl(var(--destructive))"
              strokeDasharray="4 4"
              label={{ value: "Mínimo", position: "insideTopLeft", fontSize: 10 }}
            />
            <Bar dataKey="Entradas" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Saídas" fill="hsl(0 72% 51%)" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="Acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
