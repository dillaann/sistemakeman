import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Palmtree, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface VacationsTabProps {
  vacations: any[];
  employees: any[];
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const VacationsTab = ({ vacations, employees, canEdit, onEdit, onDelete }: VacationsTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vacOpen, setVacOpen] = useState(false);
  const [vacForm, setVacForm] = useState({ employee_id: "", start_date: "", end_date: "", days: "", vacation_value: "", notes: "" });

  const vacMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === vacForm.employee_id);
      const salary = Number(emp?.salary) || 0;
      const days = parseInt(vacForm.days);
      const manualVal = parseFloat(vacForm.vacation_value);
      const vacValue = !isNaN(manualVal) && manualVal > 0 ? manualVal : (salary / 30) * days;
      const third = vacValue / 3;
      const { error } = await supabase.from("employee_vacations").insert({
        employee_id: vacForm.employee_id, 
        start_date: vacForm.start_date, 
        end_date: vacForm.end_date, 
        days,
        base_salary: salary, 
        vacation_value: Math.round(vacValue * 100) / 100,
        constitutional_third: Math.round(third * 100) / 100, 
        total_value: Math.round((vacValue + third) * 100) / 100,
        notes: vacForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-vacations"] }); 
      setVacOpen(false); 
      setVacForm({ employee_id: "", start_date: "", end_date: "", days: "", vacation_value: "", notes: "" }); 
      toast({ title: "Férias registradas!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Controle de Férias</CardTitle>
        {canEdit && (
          <Dialog open={vacOpen} onOpenChange={setVacOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Registrar Férias</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Registrar Férias</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); vacMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={vacForm.employee_id} onChange={e => setVacForm({ ...vacForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início</Label><Input type="date" value={vacForm.start_date} onChange={e => setVacForm({ ...vacForm, start_date: e.target.value })} required /></div>
                  <div><Label>Término</Label><Input type="date" value={vacForm.end_date} onChange={e => setVacForm({ ...vacForm, end_date: e.target.value })} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Qtd de Dias</Label><Input type="number" value={vacForm.days} onChange={e => setVacForm({ ...vacForm, days: e.target.value })} required /></div>
                  <div><Label>Valor (opcional)</Label><Input type="number" step="0.01" value={vacForm.vacation_value} onChange={e => setVacForm({ ...vacForm, vacation_value: e.target.value })} placeholder="Auto se vazio" /></div>
                </div>
                <div><Label>Observações</Label><Input value={vacForm.notes} onChange={e => setVacForm({ ...vacForm, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={vacMutation.isPending}>Registrar Férias</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Valor Pago (+1/3)</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vacations.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : vacations.map(v => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.employees?.name}</TableCell>
                <TableCell className="text-sm">{formatDateBR(v.start_date)} — {formatDateBR(v.end_date)}</TableCell>
                <TableCell>{v.days} dias</TableCell>
                <TableCell>{fmt(Number(v.total_value))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_vacations",
                        id: v.id,
                        title: "Editar Férias",
                        fields: [
                          { key: "start_date", label: "Início", type: "date", value: v.start_date },
                          { key: "end_date", label: "Fim", type: "date", value: v.end_date },
                          { key: "days", label: "Dias", type: "number", value: String(v.days) },
                          { key: "total_value", label: "Valor Total", type: "number", value: String(v.total_value), step: "0.01" },
                        ],
                        invalidate: ["employee-vacations"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_vacations", v.id, `Férias de ${v.employees?.name}`)}>
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

export default VacationsTab;
