import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload, Sparkles, Loader2, FileDown } from "lucide-react";
import { localDateString } from "@/lib/utils";
import { generatePaintSheetPDF } from "@/lib/generatePaintSheetPDF";

type Item = {
  id?: string;
  item_number: number;
  part_name: string;
  quantity: string;
  width: string;
  height: string;
  color: string;
  price_per_m2: string;
  unit: "cm" | "m";
};

const emptyItem = (n: number, defaultPrice = "45", defaultUnit: "cm" | "m" = "cm"): Item => ({
  item_number: n, part_name: "", quantity: "", width: "", height: "", color: "",
  price_per_m2: defaultPrice, unit: defaultUnit,
});

export default function PaintSheetDialog({ open, onOpenChange, sheet }: { open: boolean; onOpenChange: (o: boolean) => void; sheet: any | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!sheet;

  const [sheetDate, setSheetDate] = useState(localDateString());
  const [workOrderId, setWorkOrderId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState<"aguardando" | "em_pintura" | "finalizado">("aguardando");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem(1)]);
  const [defaultUnit, setDefaultUnit] = useState<"cm" | "m">("cm");
  const [defaultPrice, setDefaultPrice] = useState<string>("45");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const itemCalc = (it: Item) => {
    const q = Number(it.quantity) || 1;
    const w = Number(it.width) || 0;
    const h = Number(it.height) || 0;
    const factor = it.unit === "cm" ? 1 / 10000 : 1;
    const area = w * h * factor * q;
    const price = Number(it.price_per_m2) || 0;
    return { area, cost: area * price };
  };
  const totals = items.reduce(
    (acc, it) => {
      const { area, cost } = itemCalc(it);
      return { area: acc.area + area, cost: acc.cost + cost };
    },
    { area: 0, cost: 0 },
  );
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


  const { data: workOrders = [] } = useQuery({
    queryKey: ["paint-workorders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("id, description, clients(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (sheet) {
      setSheetDate(sheet.sheet_date);
      setWorkOrderId(sheet.work_order_id || "");
      setClientName(sheet.client_name || "");
      setResponsible(sheet.responsible || "");
      setStatus(sheet.status);
      setNotes(sheet.notes || "");
      setAttachmentUrl(sheet.attachment_url || null);
      setAttachmentFile(null);
      supabase
        .from("paint_sheet_items")
        .select("*")
        .eq("sheet_id", sheet.id)
        .order("item_number")
        .then(({ data }) => {
          const list: Item[] = (data || []).map((i: any) => ({
            id: i.id,
            item_number: i.item_number,
            part_name: i.part_name || "",
            quantity: i.quantity != null ? String(i.quantity) : "",
            width: i.width != null ? String(i.width) : "",
            height: i.height != null ? String(i.height) : "",
            color: i.color || "",
            price_per_m2: i.price_per_m2 != null ? String(i.price_per_m2) : "45",
            unit: (i.unit === "m" ? "m" : "cm") as "cm" | "m",
          }));
          setItems(list.length ? list : [emptyItem(1)]);
        });
    } else {
      setSheetDate(localDateString());
      setWorkOrderId("");
      setClientName("");
      setResponsible("");
      setStatus("aguardando");
      setNotes("");
      setAttachmentUrl(null);
      setAttachmentFile(null);
      setItems([emptyItem(1)]);
    }
  }, [open, sheet]);

  const addItem = () => setItems((prev) => [...prev, emptyItem(prev.length + 1, defaultPrice, defaultUnit)]);

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, item_number: i + 1 })));
  const updateItem = (idx: number, field: keyof Item, value: string) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const onWorkOrderChange = (id: string) => {
    setWorkOrderId(id);
    if (!clientName) {
      const wo: any = workOrders.find((w: any) => w.id === id);
      if (wo?.clients?.name) setClientName(wo.clients.name);
    }
  };

  const extractWithAI = async () => {
    if (!attachmentFile) {
      toast({ title: "Anexe uma imagem/PDF antes", variant: "destructive" });
      return;
    }
    setExtracting(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(attachmentFile);
      });
      const { data, error } = await supabase.functions.invoke("extract-paint-sheet", {
        body: { imageBase64: base64, mimeType: attachmentFile.type },
      });
      if (error) throw error;
      if (data?.sheet_date) setSheetDate(data.sheet_date);
      if (data?.client_name) setClientName(data.client_name);
      if (data?.responsible) setResponsible(data.responsible);
      if (data?.notes) setNotes(data.notes);
      if (Array.isArray(data?.items) && data.items.length) {
        setItems(
          data.items.map((i: any, idx: number): Item => ({
            item_number: i.item_number ?? idx + 1,
            part_name: i.part_name ?? "",
            quantity: i.quantity != null ? String(i.quantity) : "",
            width: i.width != null ? String(i.width) : "",
            height: i.height != null ? String(i.height) : "",
            color: i.color ?? "",
            price_per_m2: defaultPrice,
            unit: defaultUnit,
          })),
        );
      }
      toast({ title: "Dados extraídos com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro na extração", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const uploadAttachment = async (sheetId: string): Promise<string | null> => {
    if (!attachmentFile) return attachmentUrl;
    const ext = attachmentFile.name.split(".").pop();
    const path = `${sheetId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("paint-sheets").upload(path, attachmentFile, { upsert: true });
    if (error) throw error;
    return path;
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast({ title: "Informe o cliente/obra", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let sheetId = sheet?.id as string | undefined;
      let sheetNumber = sheet?.sheet_number as string | undefined;

      if (!isEdit) {
        const { data: numberData, error: numErr } = await supabase.rpc("next_paint_sheet_number", { _date: sheetDate });
        if (numErr) throw numErr;
        sheetNumber = numberData as string;

        const { data: inserted, error: insErr } = await supabase
          .from("paint_sheets")
          .insert({
            sheet_number: sheetNumber,
            sheet_date: sheetDate,
            work_order_id: workOrderId || null,
            client_name: clientName,
            responsible: responsible || null,
            status,
            notes: notes || null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        sheetId = inserted.id;
      } else {
        const { error: updErr } = await supabase
          .from("paint_sheets")
          .update({
            sheet_date: sheetDate,
            work_order_id: workOrderId || null,
            client_name: clientName,
            responsible: responsible || null,
            status,
            notes: notes || null,
          })
          .eq("id", sheetId!);
        if (updErr) throw updErr;
      }

      // upload attachment
      if (attachmentFile && sheetId) {
        const path = await uploadAttachment(sheetId);
        if (path) await supabase.from("paint_sheets").update({ attachment_url: path }).eq("id", sheetId);
      }

      // replace items
      if (sheetId) {
        await supabase.from("paint_sheet_items").delete().eq("sheet_id", sheetId);
        const rows = items
          .filter((i) => i.part_name || i.quantity || i.width || i.height || i.color)
          .map((i) => ({
            sheet_id: sheetId!,
            item_number: i.item_number,
            part_name: i.part_name || null,
            quantity: i.quantity ? Number(i.quantity) : null,
            width: i.width ? Number(i.width) : null,
            height: i.height ? Number(i.height) : null,
            color: i.color || null,
          }));
        if (rows.length) {
          const { error: itemErr } = await supabase.from("paint_sheet_items").insert(rows);
          if (itemErr) throw itemErr;
        }
      }

      toast({ title: isEdit ? "Ficha atualizada" : `Ficha ${sheetNumber} criada` });
      qc.invalidateQueries({ queryKey: ["paint-sheets"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    const wo: any = workOrders.find((w: any) => w.id === workOrderId);
    await generatePaintSheetPDF({
      sheet_number: sheet?.sheet_number || "NOVO",
      sheet_date: sheetDate,
      client_name: clientName,
      responsible,
      status,
      notes,
      work_order_short: wo ? `OS-${String(wo.id).slice(0, 8)}` : null,
      items: items.map((i) => ({
        item_number: i.item_number,
        part_name: i.part_name,
        quantity: i.quantity ? Number(i.quantity) : null,
        width: i.width ? Number(i.width) : null,
        height: i.height ? Number(i.height) : null,
        color: i.color,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar Ficha ${sheet?.sheet_number}` : "Nova Ficha de Pintura"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Attachment + AI */}
          <div className="rounded-lg border border-dashed p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="text-sm font-medium">Anexar ficha física (imagem/PDF) para extrair com IA</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                className="max-w-sm"
              />
              <Button type="button" size="sm" onClick={extractWithAI} disabled={!attachmentFile || extracting}>
                {extracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Extrair com IA
              </Button>
              {attachmentUrl && !attachmentFile && (
                <span className="text-xs text-muted-foreground">Anexo atual salvo</span>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aguardando">Aguardando</SelectItem>
                  <SelectItem value="em_pintura">Em Pintura</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Nome" />
            </div>
            <div className="md:col-span-2">
              <Label>Cliente / Obra</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome do cliente ou obra" />
            </div>
            <div>
              <Label>OS Vinculada (opcional)</Label>
              <Select value={workOrderId || "none"} onValueChange={(v) => onWorkOrderChange(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar OS" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem OS</SelectItem>
                  {workOrders.map((wo: any) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      OS-{String(wo.id).slice(0, 8)} — {wo.clients?.name || "Sem cliente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-2">
              <Label>Itens</Label>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Unidade das medidas</Label>
                  <Select value={unit} onValueChange={(v: any) => setUnit(v)}>
                    <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">cm</SelectItem>
                      <SelectItem value="m">m</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">R$ / m²</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricePerM2}
                    onChange={(e) => setPricePerM2(e.target.value)}
                    className="w-24 h-9"
                  />
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" /> Item
                </Button>
              </div>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left w-12">#</th>
                    <th className="p-2 text-left">Peça</th>
                    <th className="p-2 text-left w-20">Qtd</th>
                    <th className="p-2 text-left w-24">Largura ({unit})</th>
                    <th className="p-2 text-left w-24">Altura ({unit})</th>
                    <th className="p-2 text-left w-28">Cor</th>
                    <th className="p-2 text-right w-20">m²</th>
                    <th className="p-2 text-right w-28">Valor</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const { area, cost } = itemCalc(it);
                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-2 text-muted-foreground">{it.item_number}</td>
                        <td className="p-2"><Input value={it.part_name} onChange={(e) => updateItem(idx, "part_name", e.target.value)} /></td>
                        <td className="p-2"><Input value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} /></td>
                        <td className="p-2"><Input value={it.width} onChange={(e) => updateItem(idx, "width", e.target.value)} /></td>
                        <td className="p-2"><Input value={it.height} onChange={(e) => updateItem(idx, "height", e.target.value)} /></td>
                        <td className="p-2"><Input value={it.color} onChange={(e) => updateItem(idx, "color", e.target.value)} /></td>
                        <td className="p-2 text-right tabular-nums">{area ? area.toFixed(3) : "-"}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{cost ? fmtBRL(cost) : "-"}</td>
                        <td className="p-2">
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/50 border-t">
                  <tr>
                    <td colSpan={6} className="p-2 text-right font-semibold">Totais</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{totals.area.toFixed(3)} m²</td>
                    <td className="p-2 text-right tabular-nums font-bold text-primary">{fmtBRL(totals.cost)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Cálculo: largura × altura × quantidade, convertido para m² e multiplicado por R$ {price.toFixed(2)}/m².
            </p>
          </div>


          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileDown className="h-4 w-4 mr-2" /> PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Salvar Alterações" : "Criar Ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
