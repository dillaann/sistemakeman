import { localDateString } from "@/lib/utils";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Loader2, AlertCircle, X, Plus, Trash2 } from "lucide-react";

interface PhotoPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: any[];
  purchaseRequests: any[];
  clients: any[];
  workOrders: any[];
  onSave: (data: any) => void;
}

const paymentMethods: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência",
};
const paymentStatuses: Record<string, string> = {
  pago: "Pago", pendente: "Pendente", parcelado: "Parcelado",
};

const PhotoPurchaseDialog = ({ open, onOpenChange, suppliers, purchaseRequests, clients, workOrders, onSave }: PhotoPurchaseDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"upload" | "processing" | "review">("upload");
  const [photos, setPhotos] = useState<{ file: File; preview: string; label: string }[]>([]);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state for review
  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
    purchase_date: localDateString(),
    invoice_number: "",
    items: [{ material: "", quantity: "1", unit: "un", unit_price: "0", client_id: "", work_order_id: "" }],
    original_total: "",
    final_total: "",
    payment_method: "pix",
    payment_status: "pendente",
    due_date: "",
    notes: "",
    linked_wo_id: "",
  });

  const resetDialog = () => {
    setStep("upload");
    setPhotos([]);
    setExtractedData(null);
    setMissingFields([]);
    setForm({
      supplier_id: "", supplier_name: "",
      purchase_date: localDateString(),
      invoice_number: "",
      items: [{ material: "", quantity: "1", unit: "un", unit_price: "0", client_id: "", work_order_id: "" }],
      original_total: "", final_total: "",
      payment_method: "pix", payment_status: "pendente",
      due_date: "", notes: "", linked_wo_id: "",
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.map((file, i) => ({
      file,
      preview: URL.createObjectURL(file),
      label: photos.length + i === 0 ? "Pedido Original" : "Pedido Final",
    }));
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 2));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const photo of photos) {
      const ext = photo.file.name.split(".").pop() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("purchase-photos").upload(path, photo.file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("purchase-photos").getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const processWithAI = async () => {
    if (photos.length === 0) {
      toast({ title: "Adicione pelo menos uma foto", variant: "destructive" });
      return;
    }

    setStep("processing");
    try {
      const imageUrls = await uploadPhotos();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-purchase-data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ imageUrls }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao processar");
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Falha na extração");

      const data = result.data;
      setExtractedData(data);

      const matchedSupplier = suppliers.find(
        s => s.name.toLowerCase().includes((data.supplier_name || "").toLowerCase())
      );

      const missing: string[] = [];
      if (!data.supplier_name) missing.push("supplier_name");
      if (!data.purchase_date) missing.push("purchase_date");
      if (!data.items || data.items.length === 0) missing.push("items");
      if (!data.final_total && data.final_total !== 0) missing.push("final_total");
      setMissingFields(missing);

      setForm({
        supplier_id: matchedSupplier?.id || "",
        supplier_name: data.supplier_name || "",
        purchase_date: data.purchase_date || localDateString(),
        invoice_number: data.invoice_number || "",
        items: data.items?.length > 0
          ? data.items.map((item: any) => ({
              material: item.material || "",
              quantity: String(item.quantity || 1),
              unit: item.unit || "un",
              unit_price: String(item.unit_price || 0),
              client_id: "",
              work_order_id: "",
            }))
          : [{ material: "", quantity: "1", unit: "un", unit_price: "0", client_id: "", work_order_id: "" }],
        original_total: String(data.original_total || ""),
        final_total: String(data.final_total || ""),
        payment_method: data.payment_method || "pix",
        payment_status: "pendente",
        due_date: data.due_date || "",
        notes: data.notes || "",
        linked_wo_id: "",
      });

      setStep("review");
      toast({ title: "Dados extraídos com sucesso!", description: missing.length > 0 ? `${missing.length} campo(s) precisam de atenção` : undefined });
    } catch (err: any) {
      console.error("AI processing error:", err);
      toast({ title: "Erro ao processar fotos", description: err.message, variant: "destructive" });
      setStep("upload");
    }
  };

  const updateItem = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const updateItemDestination = (index: number, value: string) => {
    if (value === "geral") {
      updateItem(index, "client_id", "");
      updateItem(index, "work_order_id", "");
      // Need to set both at once
      setForm(prev => ({
        ...prev,
        items: prev.items.map((item, i) => i === index ? { ...item, client_id: "", work_order_id: "" } : item),
      }));
    } else {
      const wo = workOrders.find((w: any) => w.id === value);
      if (wo) {
        setForm(prev => ({
          ...prev,
          items: prev.items.map((item, i) => i === index ? { ...item, work_order_id: value, client_id: wo.client_id } : item),
        }));
      } else {
        setForm(prev => ({
          ...prev,
          items: prev.items.map((item, i) => i === index ? { ...item, client_id: value, work_order_id: "" } : item),
        }));
      }
    }
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { material: "", quantity: "1", unit: "un", unit_price: "0", client_id: "", work_order_id: "" }],
    }));
  };

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calcItemsTotal = () => {
    return form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0), 0);
  };

  const handleSave = async () => {
    if (!form.items.some(i => i.material)) {
      toast({ title: "Adicione pelo menos um material", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const itemsTotal = calcItemsTotal();
      
      // Calculate discount factor ONLY if the user explicitly provided different totals in the summary fields.
      let discountFactor = 1;
      if (form.final_total && form.original_total && parseFloat(form.original_total) > 0) {
        discountFactor = parseFloat(form.final_total) / parseFloat(form.original_total);
      }

      const items = form.items.filter(i => i.material).map(item => {
        const qty = parseFloat(item.quantity) || 1;
        const originalUnitPrice = parseFloat(item.unit_price) || 0;
        
        // If discountFactor is 1 (default), finalUnitPrice will be exactly originalUnitPrice
        const finalUnitPrice = originalUnitPrice * discountFactor;
        
        const itemFinalTotal = qty * finalUnitPrice;
        const itemOriginalTotal = qty * originalUnitPrice;
        const itemDiscount = itemOriginalTotal - itemFinalTotal;
        const itemDiscountPct = itemOriginalTotal > 0 ? (itemDiscount / itemOriginalTotal) * 100 : 0;

        return {
          supplier_id: form.supplier_id || null,
          material: item.material,
          quantity: qty,
          unit: item.unit,
          unit_price: finalUnitPrice,
          original_price: discountFactor < 1 && originalUnitPrice > 0 ? originalUnitPrice : null,
          total: itemFinalTotal,
          purchase_date: form.purchase_date,
          invoice_number: form.invoice_number || null,
          payment_method: form.payment_method,
          payment_status: form.payment_status,
          due_date: form.due_date || null,
          discount_percentage: itemDiscountPct > 0 ? itemDiscountPct : 0,
          discount_amount: itemDiscount > 0 ? itemDiscount : 0,
          notes: form.notes || null,
          client_id: item.client_id || null,
          work_order_id: item.work_order_id || null,
        };
      });

      onSave({
        items,
        linked_wo_id: form.linked_wo_id || null,
      });

      resetDialog();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const isFieldMissing = (field: string) => missingFields.includes(field);

  const pendingRequests = purchaseRequests.filter((r: any) => r.status === "pendente");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "📸 Registrar Compra por Foto"}
            {step === "processing" && "🔄 Processando..."}
            {step === "review" && "✅ Revisar Dados Extraídos"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envie até 2 fotos: o <strong>Pedido Original</strong> (valor sem desconto) e o <strong>Pedido Final</strong> (valor negociado).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {photos.map((photo, i) => (
                <Card key={i} className="relative">
                  <CardContent className="p-2">
                    <Badge className="absolute top-3 left-3 z-10">{photo.label}</Badge>
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-2 right-2 z-10 h-6 w-6 bg-background/80"
                      onClick={() => removePhoto(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <img src={photo.preview} alt={photo.label} className="rounded-md w-full h-48 object-cover" />
                  </CardContent>
                </Card>
              ))}

              {photos.length < 2 && (
                <Card
                  className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CardContent className="p-2 flex flex-col items-center justify-center h-48 gap-2">
                    <div className="flex gap-2">
                      <Camera className="h-6 w-6 text-muted-foreground" />
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      {photos.length === 0 ? "Pedido Original" : "Pedido Final"}
                    </p>
                    <p className="text-xs text-muted-foreground">JPG, PNG ou PDF</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />Escolher Arquivo
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={processWithAI}
              disabled={photos.length === 0}
            >
              Processar com IA
            </Button>
          </div>
        )}

        {/* STEP 2: Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando documentos com inteligência artificial...</p>
            <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {missingFields.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-700">Campos que precisam de atenção:</p>
                  <p className="text-yellow-600 text-xs">Os campos destacados em amarelo não foram identificados automaticamente.</p>
                </div>
              </div>
            )}

            {/* Photos preview */}
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((photo, i) => (
                  <img key={i} src={photo.preview} alt={photo.label} className="h-20 rounded-md border object-cover" />
                ))}
              </div>
            )}

            <div className={`space-y-1 ${isFieldMissing("supplier_name") ? "ring-2 ring-yellow-400 rounded-md p-2" : ""}`}>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder={form.supplier_name || "Selecione..."} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.supplier_name && !form.supplier_id && (
                <p className="text-xs text-muted-foreground">IA identificou: "{form.supplier_name}"</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={isFieldMissing("purchase_date") ? "ring-2 ring-yellow-400 rounded-md p-2" : ""}>
                <Label>Data da Compra</Label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div>
                <Label>Nº Nota/Pedido</Label>
                <Input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
            </div>

            {/* Items */}
            <div className={`space-y-2 ${isFieldMissing("items") ? "ring-2 ring-yellow-400 rounded-md p-2" : ""}`}>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Materiais</Label>
                <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
              </div>
              {form.items.map((item, i) => (
                <div key={i} className="space-y-1 border rounded-md p-2">
                  <div className="grid grid-cols-12 gap-1 items-end">
                    <div className="col-span-5">
                      {i === 0 && <Label className="text-xs">Material</Label>}
                      <Input value={item.material} onChange={e => updateItem(i, "material", e.target.value)} placeholder="Material" />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input type="number" step="0.01" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Un</Label>}
                      <Select value={item.unit} onValueChange={v => updateItem(i, "unit", v)}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["un", "kg", "m", "m²", "m³", "litro", "peça", "pacote", "cx", "rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Valor Un.</Label>}
                      <Input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      {form.items.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeItem(i)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Client / Obra per item */}
                  <div>
                    <Label className="text-xs">Cliente / Obra</Label>
                    <Select
                      value={item.work_order_id || item.client_id || "geral"}
                      onValueChange={v => updateItemDestination(i, v)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Uso Geral / Estoque" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geral">Uso Geral / Estoque</SelectItem>
                        {workOrders.map((wo: any) => (
                          <SelectItem key={wo.id} value={wo.id}>
                            {wo.clients?.name || "Cliente"} — OS #{wo.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                        {clients.filter((c: any) => !workOrders.some((wo: any) => wo.client_id === c.id)).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} (sem OS)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    Total: {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground font-medium">Total itens: {fmt(calcItemsTotal())}</p>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Valor Original Total (R$)</Label>
                <Input
                  type="number" step="0.01"
                  value={form.original_total}
                  onChange={e => setForm({ ...form, original_total: e.target.value })}
                  placeholder="Sem desconto"
                />
              </div>
              <div className={isFieldMissing("final_total") ? "ring-2 ring-yellow-400 rounded-md p-2" : ""}>
                <Label>Valor Final Total (R$)</Label>
                <Input
                  type="number" step="0.01"
                  value={form.final_total}
                  onChange={e => setForm({ ...form, final_total: e.target.value })}
                  placeholder={String(calcItemsTotal())}
                />
              </div>
            </div>

            {/* Savings display */}
            {parseFloat(form.original_total) > 0 && parseFloat(form.final_total) > 0 && (
              <div className="flex gap-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-sm">
                  <span className="text-green-700 font-medium">Economizado: </span>
                  <span className="text-green-600 font-bold">
                    {fmt(parseFloat(form.original_total) - parseFloat(form.final_total))}
                  </span>
                  <span className="text-green-600 ml-2">
                    ({(((parseFloat(form.original_total) - parseFloat(form.final_total)) / parseFloat(form.original_total)) * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Payment */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentMethods).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status Pagamento</Label>
                <Select value={form.payment_status} onValueChange={v => setForm({ ...form, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentStatuses).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.payment_status !== "pago" && (
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            )}

            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            {/* Link to purchase request */}
            {pendingRequests.length > 0 && (
              <div className="space-y-1">
                <Label>Vincular a Solicitação de Compra (opcional)</Label>
                <Select value={form.linked_wo_id} onValueChange={v => setForm({ ...form, linked_wo_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma OS..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {pendingRequests.map((r: any) => (
                      <SelectItem key={r.id} value={r.work_order_id}>
                        OS #{r.work_order_id?.slice(0, 8)} — {(r as any).work_orders?.description || "Sem descrição"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar e Salvar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PhotoPurchaseDialog;
