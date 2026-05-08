import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export type EditCtx = {
  table: string;
  id: string;
  title: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date" | "select";
    value: string;
    options?: { value: string; label: string }[];
    required?: boolean;
    step?: string;
    min?: string;
    placeholder?: string;
  }>;
  transform?: (values: Record<string, string>) => Record<string, any>;
  afterSave?: (values: Record<string, string>) => Promise<void>;
  invalidate: string[];
};

interface HREditDialogProps {
  ctx: EditCtx | null;
  onClose: () => void;
}

const HREditDialog = ({ ctx, onClose }: HREditDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ctx) {
      const initial: Record<string, string> = {};
      for (const f of ctx.fields) initial[f.key] = f.value;
      setEditValues(initial);
    } else {
      setEditValues({});
    }
  }, [ctx]);

  const editGenericMutation = useMutation({
    mutationFn: async () => {
      if (!ctx) throw new Error("Sem contexto");
      const payload = ctx.transform ? ctx.transform(editValues) : { ...editValues };
      const { error } = await supabase.from(ctx.table as any).update(payload).eq("id", ctx.id);
      if (error) throw error;
      if (ctx.afterSave) await ctx.afterSave(editValues);
    },
    onSuccess: () => {
      if (ctx) {
        for (const k of ctx.invalidate) queryClient.invalidateQueries({ queryKey: [k] });
      }
      onClose();
      toast({ title: "Registro atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });

  if (!ctx) return null;

  return (
    <Dialog open={!!ctx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{ctx.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          {ctx.fields.map(f => (
            <div key={f.key} className="space-y-2">
              <Label>{f.label}</Label>
              {f.type === "select" ? (
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                  value={editValues[f.key] || ""} 
                  onChange={e => setEditValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <Input 
                  type={f.type} 
                  value={editValues[f.key] || ""} 
                  onChange={e => setEditValues(prev => ({ ...prev, [f.key]: e.target.value }))} 
                  step={f.step} 
                  min={f.min} 
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
          <Button className="w-full" onClick={() => editGenericMutation.mutate()} disabled={editGenericMutation.isPending}>
            {editGenericMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HREditDialog;
