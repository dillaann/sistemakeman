import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Clock, Calendar, PartyPopper, UserMinus, Gift, AlertTriangle, BarChart3 } from "lucide-react";
import { fmt, monthLabel } from "@/lib/utils";

interface DashboardTabProps {
  totalPayroll: number;
  employeesCount: number;
  totalOvertime: number;
  overtimeCount: number;
  totalSaturdays: number;
  saturdaysCount: number;
  totalHolidays: number;
  holidayDaysCount: number;
  totalAdvances: number;
  advancesCount: number;
  totalAbsences: number;
  totalAbsenceDays: number;
  absencesCount: number;
  total13thProvision: number;
  selectedMonth: string;
  selectedYear: number;
  vacationAlerts: any[];
}

const DashboardTab = ({
  totalPayroll,
  employeesCount,
  totalOvertime,
  overtimeCount,
  totalSaturdays,
  saturdaysCount,
  totalHolidays,
  holidayDaysCount,
  totalAdvances,
  advancesCount,
  totalAbsences,
  totalAbsenceDays,
  absencesCount,
  total13thProvision,
  selectedMonth,
  selectedYear,
  vacationAlerts,
}: DashboardTabProps) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Folha do Mês</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(totalPayroll)}</div><p className="text-xs text-muted-foreground">{employeesCount} funcionários</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Horas Extras</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalOvertime)}</div><p className="text-xs text-muted-foreground">{overtimeCount} registros</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Sábados</CardTitle><Calendar className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalSaturdays)}</div><p className="text-xs text-muted-foreground">{saturdaysCount} registros</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Feriados</CardTitle><PartyPopper className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalHolidays)}</div><p className="text-xs text-muted-foreground">{holidayDaysCount} feriado(s) trabalhado(s)</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Vales/Adiant.</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{fmt(totalAdvances)}</div><p className="text-xs text-muted-foreground">{advancesCount} registros</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Faltas do Mês</CardTitle><UserMinus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{fmt(totalAbsences)}</div><p className="text-xs text-muted-foreground">{totalAbsenceDays} dia(s) — {absencesCount} registro(s)</p></CardContent></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Provisão 13º ({selectedYear})</CardTitle><Gift className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(total13thProvision)}</div>
            <p className="text-xs text-muted-foreground">Acumulado até {monthLabel(selectedMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Alertas de Férias</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>
            {vacationAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum alerta.</p>
            ) : (
              <div className="space-y-2">
                {vacationAlerts.map(a => (
                  <div key={a.emp.id} className="flex items-center justify-between text-sm">
                    <span>{a.emp.name}</span>
                    <Badge variant={a.status === "vencida" ? "destructive" : "secondary"}>
                      {a.status === "vencida" ? `Vencida (${a.days}d)` : `Vence em ${a.days}d`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardTab;
