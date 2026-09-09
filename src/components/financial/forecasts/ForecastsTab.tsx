import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, Info } from "lucide-react";
import { ForecastDialog } from "./ForecastDialog";
import type { Forecast, ForecastFormValues } from "./types";
import { MONTH_NAMES, RECURRENCE_LABELS } from "@/lib/forecast-recurrence";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]}/${y}`;
};

type PendingEdit = { forecast: Forecast; values: ForecastFormValues } | null;
type PendingDelete = Forecast | null;

export default function ForecastsTab() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Forecast | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ["financial-forecasts", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_forecasts")
        .select("*")
        .gte("forecast_date", `${year}-01-01`)
        .lte("forecast_date", `${year}-12-31`)
        .order("forecast_date");
      if (error) throw error;
      return (data ?? []) as unknown as Forecast[];
    },
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["financial-forecasts"] });

  const createMutation = useMutation({
    mutationFn: async ({ values, dates }: { values: ForecastFormValues; dates: string[] }) => {
      const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
      const { data: userData } = await supabase.auth.getUser();
      const rows = dates.map((date) => ({
        description: values.description.trim(),
        type: values.type,
        amount: Number(values.amount),
        forecast_date: date,
        category: values.category.trim() || null,
        notes: values.notes.trim() || null,
        recurrence: values.recurrence,
        series_id: seriesId,
        created_by: userData.user?.id ?? null,
      }));
      const { error } = await supabase.from("financial_forecasts").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Previsão criada", description: `${count} ocorrência(s) registrada(s).` });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ forecast, values, scope }: { forecast: Forecast; values: ForecastFormValues; scope: "one" | "future" }) => {
      const payload = {
        description: values.description.trim(),
        type: values.type,
        amount: Number(values.amount),
        category: values.category.trim() || null,
        notes: values.notes.trim() || null,
      };
      if (scope === "one" || !forecast.series_id) {
        const { error } = await supabase
          .from("financial_forecasts")
          .update({ ...payload, forecast_date: values.forecast_date })
          .eq("id", forecast.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("financial_forecasts")
        .update(payload)
        .eq("series_id", forecast.series_id)
        .gte("forecast_date", forecast.forecast_date);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setPendingEdit(null);
      setDialogOpen(false);
      setEditing(null);
      toast({ title: "Previsão atualizada" });
    },
    onError: (e: Error) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ forecast, scope }: { forecast: Forecast; scope: "one" | "series" }) => {
      const query = supabase.from("financial_forecasts").delete();
      const { error } =
        scope === "series" && forecast.series_id
          ? await query.eq("series_id", forecast.series_id)
          : await query.eq("id", forecast.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
      toast({ title: "Previsão excluída" });
    },
    onError: (e: Error) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return forecasts.filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (monthFilter !== "all" && f.forecast_date.slice(5, 7) !== monthFilter) return false;
      if (term && !`${f.description} ${f.category ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [forecasts, typeFilter, monthFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Forecast[]>();
    for (const f of filtered) {
      const key = monthKey(f.forecast_date);
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const annual = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
      const rows = forecasts.filter((f) => monthKey(f.forecast_date) === key);
      const entradas = rows.filter((r) => r.type === "entrada").reduce((s, r) => s + Number(r.amount), 0);
      const saidas = rows.filter((r) => r.type === "saida").reduce((s, r) => s + Number(r.amount), 0);
      return { mes: name.slice(0, 3), entradas, saidas, saldo: entradas - saidas };
    });
  }, [forecasts, year]);

  const totals = useMemo(() => {
    const entradas = filtered.filter((f) => f.type === "entrada").reduce((s, f) => s + Number(f.amount), 0);
    const saidas = filtered.filter((f) => f.type === "saida").reduce((s, f) => s + Number(f.amount), 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [filtered]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Apenas o Administrador tem acesso às Previsões.
        </CardContent>
      </Card>
    );
  }

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Área de planejamento manual. Estes valores não entram em nenhum cálculo do Financeiro, DRE, Fluxo de Caixa ou Dashboard.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {MONTH_NAMES.map((name, idx) => (
              <SelectItem key={name} value={String(idx + 1).padStart(2, "0")}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entradas e saídas</SelectItem>
            <SelectItem value="entrada">Entradas previstas</SelectItem>
            <SelectItem value="saida">Saídas previstas</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-56"
          placeholder="Buscar descrição/categoria"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button className="ml-auto" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Previsão
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /> Entradas previstas</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold">{brl(totals.entradas)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><TrendingDown className="h-4 w-4" /> Saídas previstas</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold">{brl(totals.saidas)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Wallet className="h-4 w-4" /> Saldo previsto</CardTitle></CardHeader>
          <CardContent className={`text-xl font-bold ${totals.saldo < 0 ? "text-destructive" : "text-primary"}`}>{brl(totals.saldo)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Previsão mês a mês — {year}</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={annual}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => brl(Number(v))}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="entradas" name="Entradas previstas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas previstas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="saldo" name="Saldo previsto" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Resumo anual</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {annual.map((row) => (
                <TableRow key={row.mes}>
                  <TableCell>{row.mes}</TableCell>
                  <TableCell className="text-right">{brl(row.entradas)}</TableCell>
                  <TableCell className="text-right">{brl(row.saidas)}</TableCell>
                  <TableCell className={`text-right font-medium ${row.saldo < 0 ? "text-destructive" : ""}`}>{brl(row.saldo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando previsões...</p>}
      {!isLoading && grouped.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma previsão cadastrada para o filtro atual.</CardContent></Card>
      )}

      {grouped.map(([key, rows]) => {
        const entradas = rows.filter((r) => r.type === "entrada").reduce((s, r) => s + Number(r.amount), 0);
        const saidas = rows.filter((r) => r.type === "saida").reduce((s, r) => s + Number(r.amount), 0);
        const saldo = entradas - saidas;
        return (
          <Card key={key}>
            <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base capitalize">{monthLabel(key)}</CardTitle>
              <div className="flex flex-wrap gap-3 text-xs">
                <span>Entradas: <strong>{brl(entradas)}</strong></span>
                <span>Saídas: <strong>{brl(saidas)}</strong></span>
                <span className={saldo < 0 ? "text-destructive" : "text-primary"}>Saldo: <strong>{brl(saldo)}</strong></span>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap">{formatDateBR(f.forecast_date)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{f.description}</div>
                        {f.notes && <div className="text-xs text-muted-foreground">{f.notes}</div>}
                        {f.series_id && (
                          <Badge variant="outline" className="mt-1 text-[10px]">{RECURRENCE_LABELS[f.recurrence]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.category ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={f.type === "entrada" ? "secondary" : "destructive"}>
                          {f.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{brl(Number(f.amount))}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(f); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setPendingDelete(f)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <ForecastDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}
        forecast={editing}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={(values, dates) => {
          if (editing) {
            if (editing.series_id) setPendingEdit({ forecast: editing, values });
            else updateMutation.mutate({ forecast: editing, values, scope: "one" });
            return;
          }
          createMutation.mutate({ values, dates });
        }}
      />

      <AlertDialog open={Boolean(pendingEdit)} onOpenChange={(open) => !open && setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar apenas esta ocorrência ou todas as futuras?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta previsão faz parte de uma recorrência. Escolha o alcance da alteração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => pendingEdit && updateMutation.mutate({ ...pendingEdit, scope: "one" })}
            >
              Apenas esta
            </Button>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (pendingEdit) updateMutation.mutate({ ...pendingEdit, scope: "future" }); }}
            >
              Esta e as futuras
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir previsão</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.series_id
                ? "Esta previsão faz parte de uma recorrência. Excluir apenas esta ocorrência ou todas?"
                : "Tem certeza que deseja excluir esta previsão?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {pendingDelete?.series_id && (
              <Button
                variant="outline"
                onClick={() => pendingDelete && deleteMutation.mutate({ forecast: pendingDelete, scope: "series" })}
              >
                Todas da recorrência
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (pendingDelete) deleteMutation.mutate({ forecast: pendingDelete, scope: "one" }); }}
            >
              Excluir esta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
