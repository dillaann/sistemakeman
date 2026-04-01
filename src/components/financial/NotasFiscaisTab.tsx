import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Pencil, FileText, Upload, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { isInRange } from "@/components/MonthFilter";
import { formatDateBR } from "@/lib/utils";

interface NotasFiscaisTabProps {
  dateRange?: { start: Date; end: Date };
}

const typeLabels: Record<string, string> = {
  nfe_entrada: "NF-e Entrada",
  nfe_saida: "NF-e Saída",
  nfse_emitida: "NFS-e Emitida",
  nfse_recebida: "NFS-e Recebida",
};

const statusColors: Record<string, string> = {
  ativa: "bg-green-500/10 text-green-700 border-green-500/20",
  cancelada: "bg-red-500/10 text-red-700 border-red-500/20",
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
};

const paymentStatusColors: Record<string, string> = {
  pago: "bg-green-500/10 text-green-700 border-green-500/20",
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const emptyForm = {
  type: "nfe_saida",
  invoice_number: "",
  issue_date: "",
  entity_name: "",
  entity_cnpj: "",
  description: "",
  service_description: "",
  amount: "",
  icms_amount: "",
  taxes: "",
  status: "ativa",
  payment_status: "pendente",
};

export default function NotasFiscaisTab({ dateRange }: NotasFiscaisTabProps) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [file, setFile] = useState<File | null>(null);

  const { data: invoices = [] } = useQuery({
    queryKey: ["fiscal-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (vals: typeof form & { file_url?: string }) => {
      let fileUrl = vals.file_url || null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${Date.now()}_${vals.invoice_number}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fiscal-invoices")
          .upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage
          .from("fiscal-invoices")
          .getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      }

      const payload = {
        type: vals.type,
        invoice_number: vals.invoice_number,
        issue_date: vals.issue_date,
        entity_name: vals.entity_name,
        entity_cnpj: vals.entity_cnpj || null,
        description: vals.description || null,
        service_description: vals.service_description || null,
        amount: Number(vals.amount),
        icms_amount: Number(vals.icms_amount) || 0,
        taxes: vals.taxes || null,
        status: vals.status,
        payment_status: vals.payment_status,
        ...(fileUrl ? { file_url: fileUrl } : {}),
      };

      if (editId) {
        const { error } = await supabase.from("fiscal_invoices").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fiscal_invoices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
      setOpen(false);
      setEditId(null);
      setForm({ ...emptyForm });
      setFile(null);
      toast({ title: editId ? "Nota atualizada" : "Nota cadastrada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fiscal_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
      setDeleteTarget(null);
      setDeleteReason("");
      toast({ title: "Nota excluída" });
    },
  });

  const filtered = useMemo(() => {
    let list = invoices;
    if (dateRange) {
      list = list.filter((i: any) => isInRange(i.issue_date, dateRange));
    }
    if (typeFilter !== "all") list = list.filter((i: any) => i.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((i: any) => i.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (i: any) =>
          i.invoice_number?.toLowerCase().includes(s) ||
          i.entity_name?.toLowerCase().includes(s) ||
          i.description?.toLowerCase().includes(s) ||
          i.service_description?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, dateRange, typeFilter, statusFilter, search]);

  const nfeItems = filtered.filter((i: any) => i.type === "nfe_entrada" || i.type === "nfe_saida");
  const nfseItems = filtered.filter((i: any) => i.type === "nfse_emitida" || i.type === "nfse_recebida");

  const summaryCards = useMemo(() => {
    const calc = (type: string) => {
      const items = filtered.filter((i: any) => i.type === type);
      return { count: items.length, total: items.reduce((s: number, i: any) => s + Number(i.amount), 0) };
    };
    return {
      nfe_saida: calc("nfe_saida"),
      nfe_entrada: calc("nfe_entrada"),
      nfse_emitida: calc("nfse_emitida"),
      nfse_recebida: calc("nfse_recebida"),
    };
  }, [filtered]);

  const openEdit = (inv: any) => {
    setEditId(inv.id);
    setForm({
      type: inv.type,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      entity_name: inv.entity_name,
      entity_cnpj: inv.entity_cnpj || "",
      description: inv.description || "",
      service_description: inv.service_description || "",
      amount: String(inv.amount),
      icms_amount: String(inv.icms_amount || 0),
      taxes: inv.taxes || "",
      status: inv.status,
      payment_status: inv.payment_status || "pendente",
    });
    setOpen(true);
  };

  const renderTable = (items: any[]) => (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº Nota</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Serviço</TableHead>
            <TableHead className="text-right">Valor da Nota</TableHead>
            <TableHead className="text-right">ICMS</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Arquivo</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                Nenhuma nota fiscal encontrada
              </TableCell>
            </TableRow>
          ) : (
            items.map((inv: any) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{typeLabels[inv.type]}</Badge>
                </TableCell>
                <TableCell>{inv.entity_name}</TableCell>
                <TableCell className="max-w-[200px] truncate">{inv.service_description || inv.description || "—"}</TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(inv.amount))}</TableCell>
                <TableCell className="text-right">{fmt(Number(inv.icms_amount || 0))}</TableCell>
                <TableCell>{formatDateBR(inv.issue_date)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={paymentStatusColors[inv.payment_status] || ""}>
                    {inv.payment_status === "pago" ? "Pago" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[inv.status] || ""}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {inv.file_url ? (
                    <a href={inv.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 text-primary" />
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(inv)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {userRole === "admin" && (
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(inv.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: "NF-e Emitidas", data: summaryCards.nfe_saida },
          { label: "NF-e Recebidas", data: summaryCards.nfe_entrada },
          { label: "NFS-e Emitidas", data: summaryCards.nfse_emitida },
          { label: "NFS-e Recebidas", data: summaryCards.nfse_recebida },
        ]).map(({ label, data }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold">{fmt(data.total)}</p>
              <p className="text-xs text-muted-foreground">{data.count} nota(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº, emitente, descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="nfe_entrada">NF-e Entrada</SelectItem>
            <SelectItem value="nfe_saida">NF-e Saída</SelectItem>
            <SelectItem value="nfse_emitida">NFS-e Emitida</SelectItem>
            <SelectItem value="nfse_recebida">NFS-e Recebida</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ativa">Ativa</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={v => { if (!v) { setEditId(null); setForm({ ...emptyForm }); setFile(null); } setOpen(v); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Nota Fiscal</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nfe_entrada">NF-e Entrada</SelectItem>
                      <SelectItem value="nfe_saida">NF-e Saída</SelectItem>
                      <SelectItem value="nfse_emitida">NFS-e Emitida</SelectItem>
                      <SelectItem value="nfse_recebida">NFS-e Recebida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nº da Nota</Label>
                  <Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} required />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Cliente / Emitente</Label>
                <Input value={form.entity_name} onChange={e => setForm(f => ({ ...f, entity_name: e.target.value }))} required />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={form.entity_cnpj} onChange={e => setForm(f => ({ ...f, entity_cnpj: e.target.value }))} />
              </div>
              <div>
                <Label>Serviço / Produto</Label>
                <Input value={form.service_description} onChange={e => setForm(f => ({ ...f, service_description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor da Nota (R$)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div>
                  <Label>ICMS (R$)</Label>
                  <Input type="number" step="0.01" value={form.icms_amount} onChange={e => setForm(f => ({ ...f, icms_amount: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Outros Impostos (ISS, PIS, COFINS...)</Label>
                <Input value={form.taxes} onChange={e => setForm(f => ({ ...f, taxes: e.target.value }))} placeholder="Ex: ISS 5%, PIS 0.65%" />
              </div>
              <div>
                <Label>Status de Pagamento</Label>
                <Select value={form.payment_status} onValueChange={v => setForm(f => ({ ...f, payment_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição / Observações</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Arquivo (XML ou PDF)</Label>
                <Input type="file" accept=".xml,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button type="submit" className="w-full" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Salvando..." : editId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* NF-e / NFS-e Tabs */}
      <Tabs defaultValue="nfe" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="nfe" className="flex items-center gap-1">
            <FileText className="h-4 w-4" /> NF-e (Comércio) ({nfeItems.length})
          </TabsTrigger>
          <TabsTrigger value="nfse" className="flex items-center gap-1">
            <FileText className="h-4 w-4" /> NFS-e (Serviço) ({nfseItems.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="nfe">{renderTable(nfeItems)}</TabsContent>
        <TabsContent value="nfse">{renderTable(nfseItems)}</TabsContent>
      </Tabs>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={v => { if (!v) { setDeleteTarget(null); setDeleteReason(""); } }}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
        title="Excluir Nota Fiscal"
        description="Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita."
        requireReason
        reason={deleteReason}
        onReasonChange={setDeleteReason}
      />
    </div>
  );
}
