import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { fmt } from "@/lib/utils";

interface HREmployeesTabProps {
  employees: any[];
  canEdit: boolean;
  onEditSalary: (emp: any) => void;
}

const HREmployeesTab = ({ employees, canEdit, onEditSalary }: HREmployeesTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações de Salário</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Tipo Pgto</TableHead>
              <TableHead>Salário Base</TableHead>
              <TableHead>Valor Sábado</TableHead>
              <TableHead>Valor Hora Extra</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.role}</TableCell>
                <TableCell className="capitalize">{e.payment_type || "mensal"}</TableCell>
                <TableCell>{fmt(Number(e.salary))}</TableCell>
                <TableCell>{fmt(Number(e.saturday_value))}</TableCell>
                <TableCell>{fmt(Number(e.overtime_hourly_rate))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditSalary(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default HREmployeesTab;
