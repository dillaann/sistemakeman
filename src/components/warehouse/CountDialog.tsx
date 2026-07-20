import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { localDateString } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function CountDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [responsible, setResponsible] = useState("");
  const [countDate, setCountDate] = useState(localDateString());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Record<string, { physical: string; reason: string; notes: string }>>({});

  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items_for_count"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items" as any).select("id,code,name,unit,current_qty").eq("active", true).order("name");
      return (data as any[]) ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) setRows({});
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: count, error: e1 } = await supabase
        .from("inventory_counts" as any)
        .insert({ count_date: countDate, responsible, notes, status: "em_andamento" })
        .select()
        .single();
      if (e1) throw e1;
      const countId = (count as any).id;

      const rowsToInsert = items
        .filter((i) => rows[i.id]?.physical !== undefined && rows[i.id]?.physical !== "")
        .map((i) => ({
          count_id: countId,
          item_id: i.id,
          system_qty: Number(i.current_qty),
          physical_qty: Number(rows[i.id].physical),
          adjustment_reason: rows[i.id].reason || null,
          notes: rows[i.id].notes || null,
        }));

      if (rowsToInsert.length) {
        const { error: e2 } = await supabase.from("inventory_count_items" as any).insert(rowsToInsert);
        if (e2) throw e2;
      }

      const { error: e3 } = await supabase.from("inventory_counts" as any).update({ status: "finalizado" }).eq("id", countId);
      if (e3) throw e3;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_counts"] });
      qc.invalidateQueries({ queryKey: ["inventory_movements"] });
      toast({ title: "Inventário finalizado — ajustes registrados" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Inventário Físico</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="w-32">Contado</TableHead>
                <TableHead className="text-right">Dif.</TableHead>
                <TableHead className="w-40">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const row = rows[i.id] ?? { physical: "", reason: "", notes: "" };
                const diff = row.physical === "" ? null : Number(row.physical) - Number(i.current_qty);
                return (
                  <TableRow key={i.id}>
                    <TableCell>{i.code} — {i.name}</TableCell>
                    <TableCell className="text-right">{Number(i.current_qty).toFixed(2)} {i.unit}</TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" value={row.physical} onChange={(e) =>
                        setRows({ ...rows, [i.id]: { ...row, physical: e.target.value } })} />
                    </TableCell>
                    <TableCell className={`text-right font-mono ${diff === null ? "" : diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-green-600" : "text-destructive"}`}>
                      {diff === null ? "—" : diff.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {diff !== null && diff !== 0 && (
                        <Select value={row.reason} onValueChange={(v) => setRows({ ...rows, [i.id]: { ...row, reason: v } })}>
                          <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quebra">Quebra</SelectItem>
                            <SelectItem value="perda">Perda</SelectItem>
                            <SelectItem value="erro">Erro de lançamento</SelectItem>
                            <SelectItem value="furto">Furto</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Finalizar Inventário</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
