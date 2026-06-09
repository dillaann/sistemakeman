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
import { Camera, Upload, Loader2, AlertCircle, X, Plus, Trash2, TrendingDown } from "lucide-react";

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
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência", cheque: "Cheque",
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
  const [finalTotalTouched, setFinalTotalTouched] = useState(false);
  const [originalTotalTouched, setOriginalTotalTouched] = useState(false);

  // Form state for review
  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
    purchase_date: localDateString(),
    invoice_number: "",
    items: [{ material: "", quantity: "1", unit: "un", original_unit_price: "0", final_unit_price: "0", client_id: "", work_order_id: "" }],
    original_total: "0",
    final_total: "0",
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
    setFinalTotalTouched(false);
    setOriginalTotalTouched(false);
    setForm({
      supplier_id: "", supplier_name: "",
      purchase_date: localDateString(),
      invoice_number: "",
      items: [{ material: "", quantity: "1", unit: "un", original_unit_price: "0", final_unit_price: "0", client_id: "", work_order_id: "" }],
      original_total: "0", final_total: "0",
      payment_method: "pix", payment_status: "pendente",
      due_date: "", notes: "", linked_wo_id: "",
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.map((file, i) => ({
      file,
      preview: URL.createObjectURL(file),
      label: `Pedido ${photos.length + i + 1}`,
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
      const { data: signed, error: signErr } = await supabase.storage
        .from("purchase-photos")
        .createSignedUrl(path, 60 * 60);
      if (signErr || !signed) throw signErr ?? new Error("Falha ao gerar URL");
      urls.push(signed.signedUrl);
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

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "extract-purchase-data",
        { body: { imageUrls } }
      );

      if (fnError) throw new Error(fnError.message || "Erro ao processar");
      if (!result?.success) throw new Error(result?.error || "Falha na extração");

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
              original_unit_price: String(item.original_unit_price || item.unit_price || 0),
              final_unit_price: String(item.final_unit_price || item.unit_price || 0),
              client_id: "",
              work_order_id: "",
            }))
          : [{ material: "", quantity: "1", unit: "un", original_unit_price: "0", final_unit_price: "0", client_id: "", work_order_id: "" }],
        original_total: String(data.original_total || data.final_total || "0"),
        final_total: String(data.final_total || "0"),
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
    setForm(prev => {
      const newItems = prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item);
      
      const newOriginalTotal = newItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.original_unit_price) || 0), 0
      );
      
      const newFinalTotal = newItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.final_unit_price) || 0), 0
      );
      
      return {
        ...prev,
        items: newItems,
        original_total: originalTotalTouched ? prev.original_total : String(newOriginalTotal),
        final_total: finalTotalTouched ? prev.final_total : String(newFinalTotal),
      };
    });
  };

  const updateItemDestination = (index: number, value: string) => {
    setForm(prev => {
      const newItems = prev.items.map((item, i) => {
        if (i !== index) return item;
        if (value === "geral") return { ...item, client_id: "", work_order_id: "" };
        const wo = workOrders.find((w: any) => w.id === value);
        if (wo) return { ...item, work_order_id: value, client_id: wo.client_id };
        return { ...item, client_id: value, work_order_id: "" };
      });
      return { ...prev, items: newItems };
    });
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { material: "", quantity: "1", unit: "un", original_unit_price: "0", final_unit_price: "0", client_id: "", work_order_id: "" }],
    }));
  };

  const removeItem = (index: number) => {
    setForm(prev => {
      const newItems = prev.items.filter((_, i) => i !== index);
      const newOriginalTotal = newItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.original_unit_price) || 0), 0
      );
      const newFinalTotal = newItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.final_unit_price) || 0), 0
      );
      return {
        ...prev,
        items: newItems,
        original_total: originalTotalTouched ? prev.original_total : String(newOriginalTotal),
        final_total: finalTotalTouched ? prev.final_total : String(newFinalTotal),
      };
    });
  };

  const calcItemsFinalTotal = () => {
    return form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.final_unit_price) || 0), 0);
  };
  const calcItemsOriginalTotal = () => {
    return form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.original_unit_price) || 0), 0);
  };

  const handleSave = async () => {
    if (!form.items.some(i => i.material)) {
      toast({ title: "Adicione pelo menos um material", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const filteredItems = form.items.filter(i => i.material);
      const itemsFinalTotal = filteredItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.final_unit_price) || 0), 0
      );
      const itemsOriginalTotal = filteredItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.original_unit_price) || 0), 0
      );
      
      const confirmedFinalTotal = Number((parseFloat(form.final_total) || itemsFinalTotal).toFixed(2));
      const confirmedOriginalTotal = Number((parseFloat(form.original_total) || itemsOriginalTotal).toFixed(2));
      
      const finalTotalFactor = itemsFinalTotal > 0 ? confirmedFinalTotal / itemsFinalTotal : 1;
      const originalTotalFactor = itemsOriginalTotal > 0 ? confirmedOriginalTotal / itemsOriginalTotal : 1;
      const totalDiscount = Math.max(0, confirmedOriginalTotal - confirmedFinalTotal);

      const items = filteredItems.map((item, index) => {
        const qty = parseFloat(item.quantity) || 1;
        const typedFinalUnitPrice = parseFloat(item.final_unit_price) || 0;
        const typedOriginalUnitPrice = parseFloat(item.original_unit_price) || 0;
        
        const itemOriginalTotal = qty * typedOriginalUnitPrice * originalTotalFactor;
        
        const previousFinalTotals = filteredItems
          .slice(0, index)
          .reduce((sum, previous) => sum + Number((((parseFloat(previous.quantity) || 1) * (parseFloat(previous.final_unit_price) || 0) * finalTotalFactor).toFixed(2))), 0);
        
        const itemFinalTotal = index === filteredItems.length - 1
          ? Number((confirmedFinalTotal - previousFinalTotals).toFixed(2))
          : Number((qty * typedFinalUnitPrice * finalTotalFactor).toFixed(2));
        
        const finalUnitPrice = qty > 0 ? itemFinalTotal / qty : typedFinalUnitPrice;
        const itemDiscount = Math.max(0, itemOriginalTotal - itemFinalTotal);

        return {
          supplier_id: form.supplier_id || null,
          material: item.material,
          quantity: qty,
          unit: item.unit,
          unit_price: finalUnitPrice,
          original_price: qty > 0 ? itemOriginalTotal / qty : typedOriginalUnitPrice,
          total: itemFinalTotal,
          purchase_date: form.purchase_date,
          invoice_number: form.invoice_number || null,
          payment_method: form.payment_method,
          payment_status: form.payment_status,
          due_date: form.due_date || null,
          discount_percentage: itemOriginalTotal > 0 ? (itemDiscount / itemOriginalTotal) * 100 : 0,
          discount_amount: itemDiscount,
          notes: form.notes || null,
          client_id: item.client_id || null,
          work_order_id: item.work_order_id || null,
        };
      });

      onSave({
        items,
        order_total: confirmedFinalTotal,
        original_total: confirmedOriginalTotal,
        discount_amount: totalDiscount,
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
              Envie até 2 fotos do pedido. O sistema manterá exatamente o valor total que você confirmar.
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
                      {photos.length === 0 ? "Pedido 1" : "Pedido 2"}
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
              {form.items.map((item, i) => {
                const itemOriginalTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.original_unit_price) || 0);
                const itemFinalTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.final_unit_price) || 0);
                const itemDiscount = Math.max(0, itemOriginalTotal - itemFinalTotal);
                const itemDiscountPerc = itemOriginalTotal > 0 ? (itemDiscount / itemOriginalTotal) * 100 : 0;

                return (
                  <div key={i} className="space-y-1 border rounded-md p-2 bg-muted/30">
                    <div className="grid grid-cols-12 gap-1 items-end">
                      <div className="col-span-4">
                        {i === 0 && <Label className="text-xs">Material</Label>}
                        <Input value={item.material} onChange={e => updateItem(i, "material", e.target.value)} placeholder="Material" />
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <Label className="text-xs">Qtd</Label>}
                        <Input type="number" step="0.01" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        {i === 0 && <Label className="text-xs">Un</Label>}
                        <Input value={item.unit} onChange={e => updateItem(i, "unit", e.target.value)} className="px-1 text-center" />
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <Label className="text-xs">R$ Original</Label>}
                        <Input type="number" step="0.01" value={item.original_unit_price} onChange={e => updateItem(i, "original_unit_price", e.target.value)} className="bg-orange-50/50" />
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <Label className="text-xs">R$ Negociado</Label>}
                        <Input type="number" step="0.01" value={item.final_unit_price} onChange={e => updateItem(i, "final_unit_price", e.target.value)} className="bg-green-50/50" />
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
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex-1">
                        <Select
                          value={item.work_order_id || item.client_id || "geral"}
                          onValueChange={v => updateItemDestination(i, v)}
                        >
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Uso Geral / Estoque" /></SelectTrigger>
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
                      <div className="text-[10px] text-muted-foreground flex gap-2">
                        <span>Original: {fmt(itemOriginalTotal)}</span>
                        <span className="text-green-600 font-medium">Final: {fmt(itemFinalTotal)}</span>
                        {itemDiscount > 0 && <span className="text-orange-600">(-{fmt(itemDiscount)} | {itemDiscountPerc.toFixed(1)}%)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-center px-1">
                <p className="text-xs text-muted-foreground">Original: {fmt(calcItemsOriginalTotal())}</p>
                <p className="text-xs text-green-600 font-semibold">Negociado: {fmt(calcItemsFinalTotal())}</p>
              </div>
            </div>

            {/* Summary / Totals */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Informe o <strong>Valor Original</strong> (do pedido antes do desconto) e o <strong>Valor Negociado</strong> (o que você efetivamente pagou). A diferença será registrada como economia.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor Original</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      type="number" step="0.01"
                      className="pl-9 bg-background"
                      value={form.original_total}
                      onChange={e => { setOriginalTotalTouched(true); setForm({ ...form, original_total: e.target.value }); }}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-green-700">Valor Negociado (Pago)</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold text-sm">R$</span>
                    <Input
                      type="number" step="0.01"
                      className={`pl-9 bg-background border-green-200 focus-visible:ring-green-500 font-bold text-green-700 ${isFieldMissing("final_total") ? "ring-2 ring-yellow-400" : ""}`}
                      value={form.final_total}
                      onChange={e => { setFinalTotalTouched(true); setForm({ ...form, final_total: e.target.value }); }}
                    />
                  </div>
                </div>
              </div>

              {Number(form.original_total) > Number(form.final_total) && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-700">
                    <TrendingDown className="h-4 w-4" />
                    <span className="text-sm font-medium">Economia Realizada:</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">
                      {fmt(Number(form.original_total) - Number(form.final_total))}
                    </p>
                    <p className="text-[10px] text-green-600 font-medium">
                      ({(((Number(form.original_total) - Number(form.final_total)) / Number(form.original_total)) * 100).toFixed(1)}% de desconto)
                    </p>
                  </div>
                </div>
              )}
            </div>

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
