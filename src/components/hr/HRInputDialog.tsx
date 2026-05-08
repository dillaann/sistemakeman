import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HRInputDialogProps {
  config: any;
  values: Record<string, string>;
  setValues: (values: Record<string, string>) => void;
  onClose: () => void;
}

const HRInputDialog = ({ config, values, setValues, onClose }: HRInputDialogProps) => {
  if (!config) return null;

  return (
    <Dialog open={!!config} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{config.title}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            config.onSubmit(values);
            onClose();
          }}
          className="space-y-3"
        >
          {config.description && <p className="text-sm text-muted-foreground">{config.description}</p>}
          {config.fields.map((f: any) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              {f.type === "select" ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {f.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <Input
                  type={f.type}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  required
                />
              )}
            </div>
          ))}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{config.submitLabel || "Confirmar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default HRInputDialog;
