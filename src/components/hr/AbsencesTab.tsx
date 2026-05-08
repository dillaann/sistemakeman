import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, UserMinus, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface AbsencesTabProps {
  absences: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const AbsencesTab = ({ absences, employees, selectedMonth, canEdit, onEdit, onDelete }: AbsencesTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [absOpen, setAbsOpen] = useState(false);
  const [absForm, setAbsForm] = useState({ employee_id: "", day_quantity: "1", reason: "", date: localDateString() });

  const absMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === absForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const salary = Number(emp.salary) || 0;
      if (salary <= 0) throw new Error(`Cadastre o salário base de ${emp.name} antes de registrar`);
      const days = parseFloat(absForm.day_quantity);
      if (!days || days <= 0) throw new Error("Informe a quantidade de faltas");
      const dailyRate = salary / 20;
      const total = dailyRate * days;
      const { error } = await supabase.from("employee_absences" as any).insert({
        employee_id: absForm.employee_id,
        date: absForm.date,
        day_quantity: days,
        reason: absForm.reason || null,
        daily_rate: Math.round(dailyRate * 100) / 100,
        calculated_value: Math.round(total * 100) / 100,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-absences"] }); 
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); 
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); 
      setAbsOpen(false); 
      setAbsForm({ employee_id: "", day_quantity: "1", reason: "", date: localDateString() }); 
      toast({ title: "Falta registrada!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Faltas</CardTitle>
        {canEdit && (
          <Dialog open={absOpen} onOpenChange={setAbsOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Registrar Falta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Falta</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); absMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={absForm.employee_id} onChange={e => setAbsForm({ ...absForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} (Salário R$ {Number(e.salary || 0).toFixed(2)})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Qtd de Faltas</Label><Input type="number" step="0.5" value={absForm.day_quantity} onChange={e => setAbsForm({ ...absForm, day_quantity: e.target.value })} required /></div>
                  <div><Label>Data</Label><Input type="date" value={absForm.date} onChange={e => setAbsForm({ ...absForm, date: e.target.value })} required /></div>
                </div>
                <div><Label>Motivo (opcional)</Label><Input value={absForm.reason} onChange={e => setAbsForm({ ...absForm, reason: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={absMutation.isPending}>Registrar</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Valor Descontado</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {absences.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : absences.map(a => (
              <TableRow key={a.id}>
                <TableCell>{formatDateBR(a.date)}</TableCell>
                <TableCell>{a.employees?.name}</TableCell>
                <TableCell>{a.day_quantity} dia(s)</TableCell>
                <TableCell className="font-medium text-destructive">{fmt(Number(a.calculated_value))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_absences",
                        id: a.id,
                        title: "Editar Falta",
                        fields: [
                          { key: "day_quantity", label: "Quantidade", type: "number", value: String(a.day_quantity), step: "0.5" },
                          { key: "date", label: "Data", type: "date", value: a.date },
                          { key: "reason", label: "Motivo", type: "text", value: a.reason || "" },
                        ],
                        transform: (vals: any) => {
                          const emp = employees.find(e => e.id === a.employee_id);
                          const salary = Number(emp?.salary) || 0;
                          const qty = parseFloat(vals.day_quantity) || 0;
                          const rate = salary / 20;
                          return { ...vals, daily_rate: Math.round(rate * 100) / 100, calculated_value: Math.round(rate * qty * 100) / 100 };
                        },
                        invalidate: ["employee-absences", "monthly-closings"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_absences", a.id, `Falta de ${a.employees?.name}`)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

export default AbsencesTab;
