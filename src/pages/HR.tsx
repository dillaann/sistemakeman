import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, DollarSign, Receipt, CheckCircle, BarChart3 } from "lucide-react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(mo) - 1]}/${y}`;
};

const HR = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  // Queries
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const { data: advances = [] } = useQuery({
    queryKey: ["employee-advances", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_advances").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["employee-expenses", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_expenses").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: closings = [] } = useQuery({
    queryKey: ["monthly-closings", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_closings").select("*, employees(name)").eq("month_ref", selectedMonth);
      return data ?? [];
    },
  });

  // Advance dialog
  const [advOpen, setAdvOpen] = useState(false);
  const [advForm, setAdvForm] = useState({ employee_id: "", amount: "", type: "adiantamento", description: "", date: new Date().toISOString().slice(0, 10) });

  const advMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_advances").insert({
        employee_id: advForm.employee_id,
        amount: parseFloat(advForm.amount),
        type: advForm.type,
        description: advForm.description || null,
        date: advForm.date,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-advances"] });
      setAdvOpen(false);
      setAdvForm({ employee_id: "", amount: "", type: "adiantamento", description: "", date: new Date().toISOString().slice(0, 10) });
      toast({ title: "Adiantamento/vale registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Expense dialog
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState({ employee_id: "", amount: "", category: "EPI", description: "", date: new Date().toISOString().slice(0, 10) });

  const expMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_expenses").insert({
        employee_id: expForm.employee_id,
        amount: parseFloat(expForm.amount),
        category: expForm.category,
        description: expForm.description || null,
        date: expForm.date,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-expenses"] });
      setExpOpen(false);
      setExpForm({ employee_id: "", amount: "", category: "EPI", description: "", date: new Date().toISOString().slice(0, 10) });
      toast({ title: "Gasto registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Closing mutation
  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error("Funcionário não encontrado");

      const baseSalary = Number(emp.salary) || 0;
      const totalAdv = advances.filter(a => a.employee_id === employeeId).reduce((s, a) => s + Number(a.amount), 0);
      const totalExp = expenses.filter(e => e.employee_id === employeeId).reduce((s, e) => s + Number(e.amount), 0);
      const netPay = baseSalary - totalAdv - totalExp;

      const { error } = await supabase.from("monthly_closings").upsert({
        employee_id: employeeId,
        month_ref: selectedMonth,
        base_salary: baseSalary,
        total_advances: totalAdv,
        total_expenses: totalExp,
        net_pay: netPay,
      }, { onConflict: "employee_id,month_ref" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      toast({ title: "Fechamento calculado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (closingId: string) => {
      const { error } = await supabase.from("monthly_closings").update({ paid: true, paid_date: new Date().toISOString().slice(0, 10) }).eq("id", closingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      toast({ title: "Marcado como pago!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Dashboard calculations
  const totalPayroll = useMemo(() => employees.reduce((s, e) => s + (Number(e.salary) || 0), 0), [employees]);
  const totalAdvances = useMemo(() => advances.reduce((s, a) => s + Number(a.amount), 0), [advances]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  // Closing summary per employee
  const employeeSummary = useMemo(() => {
    return employees.map(emp => {
      const empAdvances = advances.filter(a => a.employee_id === emp.id).reduce((s, a) => s + Number(a.amount), 0);
      const empExpenses = expenses.filter(e => e.employee_id === emp.id).reduce((s, e) => s + Number(e.amount), 0);
      const baseSalary = Number(emp.salary) || 0;
      const closing = closings.find(c => c.employee_id === emp.id);
      return { ...emp, baseSalary, empAdvances, empExpenses, netPay: baseSalary - empAdvances - empExpenses, closing };
    });
  }, [employees, advances, expenses, closings]);

  const categories = ["EPI", "Uniforme", "Ferramentas", "Combustível", "Outro"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Recursos Humanos</h1>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Mês:</Label>
          <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44" />
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
          <TabsTrigger value="salarios"><DollarSign className="h-4 w-4 mr-1" />Salários</TabsTrigger>
          <TabsTrigger value="gastos"><Receipt className="h-4 w-4 mr-1" />Gastos</TabsTrigger>
          <TabsTrigger value="fechamento"><CheckCircle className="h-4 w-4 mr-1" />Fechamento</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Folha do Mês</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(totalPayroll)}</div>
                <p className="text-xs text-muted-foreground">{employees.length} funcionários ativos</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vales/Adiantamentos</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{fmt(totalAdvances)}</div>
                <p className="text-xs text-muted-foreground">{monthLabel(selectedMonth)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Gastos com Funcionários</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{fmt(totalExpenses)}</div>
                <p className="text-xs text-muted-foreground">{monthLabel(selectedMonth)}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Salários / Adiantamentos */}
        <TabsContent value="salarios" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={advOpen} onOpenChange={setAdvOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Novo Adiantamento/Vale</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Adiantamento/Vale</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); advMutation.mutate(); }} className="space-y-3">
                  <div>
                    <Label>Funcionário *</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={advForm.employee_id} onChange={e => setAdvForm({ ...advForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo *</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={advForm.type} onChange={e => setAdvForm({ ...advForm, type: e.target.value })}>
                        <option value="adiantamento">Adiantamento</option>
                        <option value="vale">Vale</option>
                      </select>
                    </div>
                    <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} required /></div>
                  </div>
                  <div><Label>Descrição</Label><Input value={advForm.description} onChange={e => setAdvForm({ ...advForm, description: e.target.value })} /></div>
                  <div><Label>Data</Label><Input type="date" value={advForm.date} onChange={e => setAdvForm({ ...advForm, date: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={advMutation.isPending}>Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Salários base dos funcionários */}
          <Card>
            <CardHeader><CardTitle className="text-base">Salários Base</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Salário Base</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{e.role || "-"}</TableCell>
                      <TableCell>{e.salary ? fmt(Number(e.salary)) : "-"}</TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Lista de adiantamentos/vales do mês */}
          <Card>
            <CardHeader><CardTitle className="text-base">Adiantamentos/Vales - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{(a.employees as any)?.name}</TableCell>
                      <TableCell><Badge variant={a.type === "vale" ? "destructive" : "secondary"}>{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell>
                      <TableCell>{fmt(Number(a.amount))}</TableCell>
                      <TableCell>{new Date(a.date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {advances.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum registro neste mês.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gastos */}
        <TabsContent value="gastos" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Novo Gasto</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Gasto</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); expMutation.mutate(); }} className="space-y-3">
                  <div>
                    <Label>Funcionário *</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={expForm.employee_id} onChange={e => setExpForm({ ...expForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Categoria *</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} required /></div>
                  </div>
                  <div><Label>Descrição</Label><Input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} /></div>
                  <div><Label>Data</Label><Input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={expMutation.isPending}>Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Gastos por Funcionário - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{(e.employees as any)?.name}</TableCell>
                      <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                      <TableCell>{fmt(Number(e.amount))}</TableCell>
                      <TableCell>{new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="hidden md:table-cell">{e.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {expenses.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum gasto neste mês.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fechamento Mensal */}
        <TabsContent value="fechamento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fechamento - {monthLabel(selectedMonth)}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Salário Base</TableHead>
                    <TableHead>Vales/Adiant.</TableHead>
                    <TableHead>Gastos</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeSummary.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{fmt(e.baseSalary)}</TableCell>
                      <TableCell className="text-amber-600">{fmt(e.empAdvances)}</TableCell>
                      <TableCell className="text-red-600">{fmt(e.empExpenses)}</TableCell>
                      <TableCell className="font-bold">{fmt(e.netPay)}</TableCell>
                      <TableCell>
                        {e.closing?.paid ? (
                          <Badge variant="default">Pago</Badge>
                        ) : e.closing ? (
                          <Badge variant="secondary">Calculado</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!e.closing && (
                            <Button size="sm" variant="outline" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending}>
                              Calcular
                            </Button>
                          )}
                          {e.closing && !e.closing.paid && (
                            <Button size="sm" onClick={() => markPaidMutation.mutate(e.closing!.id)} disabled={markPaidMutation.isPending}>
                              Pagar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeeSummary.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HR;
