import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Clock, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface OvertimeTabProps {
  overtime: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const OvertimeTab = ({ overtime, employees, selectedMonth, canEdit, onEdit, onDelete }: OvertimeTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [otOpen, setOtOpen] = useState(false);
  const [otForm, setOtForm] = useState({ employee_id: "", hours: "", description: "", date: localDateString() });

  const otMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === otForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const fixedRate = Number(emp.overtime_hourly_rate) || 0;
      if (fixedRate <= 0) throw new Error(`Cadastre o valor hora extra de ${emp.name} antes de registrar`);
      const hrs = parseFloat(otForm.hours);
      if (!hrs || hrs <= 0) throw new Error("Informe a quantidade de horas");
      const value = fixedRate * hrs;
      const { error } = await supabase.from("employee_overtime").insert({ 
        employee_id: otForm.employee_id, 
        hours: hrs, 
        percentage: 0, 
        calculated_value: Math.round(value * 100) / 100, 
        description: otForm.description || null, 
        date: otForm.date, 
        month_ref: selectedMonth 
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-overtime"] }); 
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); 
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); 
      setOtOpen(false); 
      setOtForm({ employee_id: "", hours: "", description: "", date: localDateString() }); 
      toast({ title: "Hora extra registrada!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Horas Extras</CardTitle>
        {canEdit && (
          <Dialog open={otOpen} onOpenChange={setOtOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nova Hora Extra</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Hora Extra</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); otMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={otForm.employee_id} onChange={e => setOtForm({ ...otForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} (R$ {Number(e.overtime_hourly_rate || 0).toFixed(2)}/h)</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Horas</Label><Input type="number" step="0.5" value={otForm.hours} onChange={e => setOtForm({ ...otForm, hours: e.target.value })} required /></div>
                  <div><Label>Data</Label><Input type="date" value={otForm.date} onChange={e => setOtForm({ ...otForm, date: e.target.value })} required /></div>
                </div>
                <div><Label>Descrição (opcional)</Label><Input value={otForm.description} onChange={e => setOtForm({ ...otForm, description: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={otMutation.isPending}>Registrar</Button>
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
              <TableHead>Horas</TableHead>
              <TableHead>Valor Total</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {overtime.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : overtime.map(o => (
              <TableRow key={o.id}>
                <TableCell>{formatDateBR(o.date)}</TableCell>
                <TableCell>{o.employees?.name}</TableCell>
                <TableCell>{o.hours}h</TableCell>
                <TableCell className="font-medium text-primary">{fmt(Number(o.calculated_value))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_overtime",
                        id: o.id,
                        title: "Editar Hora Extra",
                        fields: [
                          { key: "hours", label: "Horas", type: "number", value: String(o.hours), step: "0.5" },
                          { key: "date", label: "Data", type: "date", value: o.date },
                          { key: "description", label: "Descrição", type: "text", value: o.description || "" },
                        ],
                        transform: (vals: any) => {
                          const emp = employees.find(e => e.id === o.employee_id);
                          const rate = Number(emp?.overtime_hourly_rate) || 0;
                          const hrs = parseFloat(vals.hours) || 0;
                          return { ...vals, calculated_value: Math.round(rate * hrs * 100) / 100 };
                        },
                        invalidate: ["employee-overtime", "monthly-closings"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_overtime", o.id, `Hora extra de ${o.employees?.name}`)}>
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

export default OvertimeTab;
