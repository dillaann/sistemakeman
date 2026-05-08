import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface SaturdaysTabProps {
  saturdays: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const SaturdaysTab = ({ saturdays, employees, selectedMonth, canEdit, onEdit, onDelete }: SaturdaysTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [satOpen, setSatOpen] = useState(false);
  const [satForm, setSatForm] = useState({ employee_id: "", hours: "", description: "", date: localDateString() });

  const satMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === satForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const satValue = Number(emp.saturday_value) || 0;
      if (satValue <= 0) throw new Error(`Cadastre o valor do sábado de ${emp.name} antes de registrar`);
      const days = parseFloat(satForm.hours);
      if (!days || days <= 0) throw new Error("Informe a quantidade de sábados");
      const total = satValue * days;
      const { error } = await supabase.from("employee_saturdays").insert({ 
        employee_id: satForm.employee_id, 
        hours: days, 
        calculated_value: Math.round(total * 100) / 100, 
        description: satForm.description || null, 
        date: satForm.date, 
        month_ref: selectedMonth 
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-saturdays"] }); 
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); 
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); 
      setSatOpen(false); 
      setSatForm({ employee_id: "", hours: "", description: "", date: localDateString() }); 
      toast({ title: "Sábado registrado!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Sábados Trabalhados</CardTitle>
        {canEdit && (
          <Dialog open={satOpen} onOpenChange={setSatOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Novo Sábado</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Sábado Trabalhado</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); satMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={satForm.employee_id} onChange={e => setSatForm({ ...satForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} (R$ {Number(e.saturday_value || 0).toFixed(2)}/sáb)</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Qtd Sábados (ou fração)</Label><Input type="number" step="0.1" value={satForm.hours} onChange={e => setSatForm({ ...satForm, hours: e.target.value })} required /></div>
                  <div><Label>Data</Label><Input type="date" value={satForm.date} onChange={e => setSatForm({ ...satForm, date: e.target.value })} required /></div>
                </div>
                <div><Label>Descrição (opcional)</Label><Input value={satForm.description} onChange={e => setSatForm({ ...satForm, description: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={satMutation.isPending}>Registrar</Button>
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
              <TableHead>Valor Total</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {saturdays.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : saturdays.map(s => (
              <TableRow key={s.id}>
                <TableCell>{formatDateBR(s.date)}</TableCell>
                <TableCell>{s.employees?.name}</TableCell>
                <TableCell>{s.hours} sáb</TableCell>
                <TableCell className="font-medium text-primary">{fmt(Number(s.calculated_value))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_saturdays",
                        id: s.id,
                        title: "Editar Sábado",
                        fields: [
                          { key: "hours", label: "Quantidade", type: "number", value: String(s.hours), step: "0.1" },
                          { key: "date", label: "Data", type: "date", value: s.date },
                          { key: "description", label: "Descrição", type: "text", value: s.description || "" },
                        ],
                        transform: (vals: any) => {
                          const emp = employees.find(e => e.id === s.employee_id);
                          const val = Number(emp?.saturday_value) || 0;
                          const qty = parseFloat(vals.hours) || 0;
                          return { ...vals, calculated_value: Math.round(val * qty * 100) / 100 };
                        },
                        invalidate: ["employee-saturdays", "monthly-closings"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_saturdays", s.id, `Sábado de ${s.employees?.name}`)}>
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

export default SaturdaysTab;
