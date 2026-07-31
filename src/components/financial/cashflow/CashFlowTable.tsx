import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateBR } from "@/lib/utils";
import type { CashFlowDay } from "@/lib/cashflow";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface CashFlowTableProps {
  days: CashFlowDay[];
  minBalance: number;
}

export default function CashFlowTable({ days, minBalance }: CashFlowTableProps) {
  const firstFutureIndex = days.findIndex((d) => d.isProjected);

  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Data</TableHead>
            <TableHead className="w-28">Situação</TableHead>
            <TableHead className="text-right">Entradas</TableHead>
            <TableHead className="text-right">Saídas</TableHead>
            <TableHead className="text-right">Saldo do dia</TableHead>
            <TableHead className="text-right">Saldo acumulado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((d, i) => {
            const negative = d.cumulative < 0;
            const belowMin = !negative && d.cumulative < minBalance;
            return (
              <Fragment key={d.date}>
                {i === firstFutureIndex && firstFutureIndex > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-1">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-primary/60" />
                        <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">
                          Projeção futura
                        </span>
                        <div className="h-px flex-1 bg-primary/60" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  className={cn(
                    negative && "bg-destructive/10",
                    belowMin && "bg-yellow-500/10",
                    d.isToday && "ring-1 ring-inset ring-primary/40",
                  )}
                >
                  <TableCell className="font-medium">
                    {formatDateBR(d.date)}
                    {d.isToday && <span className="ml-2 text-xs text-primary">hoje</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", d.isProjected ? "border-primary/40 text-primary" : "text-muted-foreground")}>
                      {d.isProjected ? "Previsto" : "Realizado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-green-600">{d.inflow ? fmt(d.inflow) : "—"}</TableCell>
                  <TableCell className="text-right text-destructive">{d.outflow ? fmt(d.outflow) : "—"}</TableCell>
                  <TableCell className={cn("text-right", d.net < 0 ? "text-destructive" : "text-foreground")}>
                    {fmt(d.net)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold",
                      negative && "text-destructive",
                      belowMin && "text-yellow-700 dark:text-yellow-500",
                    )}
                  >
                    {fmt(d.cumulative)}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
          {days.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Nenhum dia no período selecionado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
