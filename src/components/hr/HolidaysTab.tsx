import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, PartyPopper, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface HolidaysTabProps {
  holidays: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const HolidaysTab = ({ holidays, employees, selectedMonth, canEdit, onEdit, onDelete }: HolidaysTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [holOpen, setHolOpen] = useState(false);
  const [holForm, setHolForm] = useState({ employee_id: "", holiday_name: "", description: "", date: localDateString() });

  const holMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === holForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const dailyRate = Number(emp.daily_rate) || 0;
      if (dailyRate <= 0) throw new Error(`Cadastre o valor da diária de ${emp.name} na aba Diárias antes de registrar`);
      if (!holForm.holiday_name.trim()) throw new Error("Informe o nome do feriado");
      const total = dailyRate;
      const { error } = await supabase.from("employee_holidays" as any).insert({
        employee_id: holForm.employee_id,
        date: holForm.date,
        holiday_name: holForm.holiday_name,
        hours: 0,
        day_quantity: 1,
        daily_rate: dailyRate,
        calculated_value: Math.round(total * 100) / 100,
        description: holForm.description || null,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-holidays"] }); 
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); 
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); 
      setHolOpen(false); 
      setHolForm({ employee_id: "", holiday_name: "", description: "", date: localDateString() }); 
      toast({ title: "Feriado registrado!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Feriados Trabalhados</CardTitle>
        {canEdit && (
          <Dialog open={holOpen} onOpenChange={setHolOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Novo Feriado</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Feriado Trabalhado</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); holMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={holForm.employee_id} onChange={e => setHolForm({ ...holForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} (Diária R$ {Number(e.daily_rate || 0).toFixed(2)})</option>)}
                  </select>
                </div>
                <div><Label>Nome do Feriado</Label><Input value={holForm.holiday_name} onChange={e => setHolForm({ ...holForm, holiday_name: e.target.value })} required placeholder="Ex: Tiradentes" /></div>
                <div><Label>Data</Label><Input type="date" value={holForm.date} onChange={e => setHolForm({ ...holForm, date: e.target.value })} required /></div>
                <div><Label>Descrição (opcional)</Label><Input value={holForm.description} onChange={e => setHolForm({ ...holForm, description: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={holMutation.isPending}>Registrar</Button>
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
              <TableHead>Feriado</TableHead>
              <TableHead>Valor Total</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : holidays.map(h => (
              <TableRow key={h.id}>
                <TableCell>{formatDateBR(h.date)}</TableCell>
                <TableCell>{h.employees?.name}</TableCell>
                <TableCell>{h.holiday_name}</TableCell>
                <TableCell className="font-medium text-primary">{fmt(Number(h.calculated_value))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_holidays",
                        id: h.id,
                        title: "Editar Feriado",
                        fields: [
                          { key: "holiday_name", label: "Feriado", type: "text", value: h.holiday_name },
                          { key: "date", label: "Data", type: "date", value: h.date },
                          { key: "description", label: "Descrição", type: "text", value: h.description || "" },
                        ],
                        invalidate: ["employee-holidays", "monthly-closings"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_holidays", h.id, `Feriado ${h.holiday_name} de ${h.employees?.name}`)}>
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

export default HolidaysTab;
