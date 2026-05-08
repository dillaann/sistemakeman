import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Banknote, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR } from "@/lib/utils";

interface AdvancesTabProps {
  advances: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const AdvancesTab = ({ advances, employees, selectedMonth, canEdit, onEdit, onDelete }: AdvancesTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [advOpen, setAdvOpen] = useState(false);
  const [advForm, setAdvForm] = useState({ employee_id: "", amount: "", type: "adiantamento", description: "", date: localDateString() });

  const advMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_advances").insert({ 
        employee_id: advForm.employee_id, 
        amount: parseFloat(advForm.amount), 
        type: advForm.type, 
        description: advForm.description || null, 
        date: advForm.date, 
        month_ref: selectedMonth 
      });
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["employee-advances"] }); 
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); 
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); 
      setAdvOpen(false); 
      setAdvForm({ employee_id: "", amount: "", type: "adiantamento", description: "", date: localDateString() }); 
      toast({ title: "Registrado!" }); 
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Vales e Adiantamentos</CardTitle>
        {canEdit && (
          <Dialog open={advOpen} onOpenChange={setAdvOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Novo Vale</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Vale/Adiantamento</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); advMutation.mutate(); }} className="space-y-3">
                <div>
                  <Label>Funcionário</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={advForm.employee_id} onChange={e => setAdvForm({ ...advForm, employee_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} required /></div>
                  <div><Label>Data</Label><Input type="date" value={advForm.date} onChange={e => setAdvForm({ ...advForm, date: e.target.value })} required /></div>
                </div>
                <div><Label>Tipo</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={advForm.type} onChange={e => setAdvForm({ ...advForm, type: e.target.value })}>
                    <option value="adiantamento">Adiantamento</option>
                    <option value="vale">Vale</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div><Label>Descrição (opcional)</Label><Input value={advForm.description} onChange={e => setAdvForm({ ...advForm, description: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={advMutation.isPending}>Registrar</Button>
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
              <TableHead>Descrição</TableHead>
              <TableHead>Valor</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {advances.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Nenhum registro.</TableCell></TableRow> : advances.map(a => (
              <TableRow key={a.id}>
                <TableCell>{formatDateBR(a.date)}</TableCell>
                <TableCell>{a.employees?.name}</TableCell>
                <TableCell>{a.description || a.type}</TableCell>
                <TableCell className="font-medium text-amber-600">{fmt(Number(a.amount))}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit({
                        table: "employee_advances",
                        id: a.id,
                        title: "Editar Vale",
                        fields: [
                          { key: "amount", label: "Valor", type: "number", value: String(a.amount), step: "0.01" },
                          { key: "date", label: "Data", type: "date", value: a.date },
                          { key: "description", label: "Descrição", type: "text", value: a.description || "" },
                        ],
                        invalidate: ["employee-advances", "monthly-closings"]
                      })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("employee_advances", a.id, `Vale de ${a.employees?.name}`)}>
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

export default AdvancesTab;
