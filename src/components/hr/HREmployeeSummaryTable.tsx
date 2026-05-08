import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmt, monthLabel } from "@/lib/utils";

interface HREmployeeSummaryTableProps {
  employeeSummary: any[];
  selectedMonth: string;
}

const HREmployeeSummaryTable = ({ employeeSummary, selectedMonth }: HREmployeeSummaryTableProps) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Funcionário</TableHead>
          <TableHead>Salário Base</TableHead>
          <TableHead>Acréscimos</TableHead>
          <TableHead>Descontos</TableHead>
          <TableHead>Líquido</TableHead>
          <TableHead>Pago</TableHead>
          <TableHead>Restante</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employeeSummary.map(e => (
          <TableRow key={e.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {e.name}
                {e.isWeekly && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Semanal</Badge>}
              </div>
            </TableCell>
            <TableCell>{e.isWeekly ? fmt(Number(e.weekly_salary)) + " /sem" : fmt(e.baseSalary)}</TableCell>
            <TableCell className="text-primary">{fmt(e.empOvertime + e.empSaturdays + e.empHolidays)}</TableCell>
            <TableCell className="text-destructive">{fmt(e.empAdvances + e.empAbsences)}</TableCell>
            <TableCell className="font-bold">{fmt(e.closing?.net_pay ?? e.netPay)}</TableCell>
            <TableCell className="text-green-600 font-medium">{fmt(e.totalPaid)}</TableCell>
            <TableCell className={e.remaining > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>
              {e.remaining <= 0 ? "Quitado" : fmt(e.remaining)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default HREmployeeSummaryTable;
