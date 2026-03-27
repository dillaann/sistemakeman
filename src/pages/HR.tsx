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
import { Plus, DollarSign, Receipt, CheckCircle, BarChart3, Clock, Calendar } from "lucide-react";

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

// Valor da hora = salário / 220 (padrão CLT)
const hourlyRate = (salary: number) => salary / 220;

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

  const { data: overtime = [] } = useQuery({
    queryKey: ["employee-overtime", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_overtime").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: saturdays = [] } = useQuery({
    queryKey: ["employee-saturdays", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_saturdays").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
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
        employee_id: advForm.employee_id, amount: parseFloat(advForm.amount), type: advForm.type,
        description: advForm.description || null, date: advForm.date, month_ref: selectedMonth,
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
        employee_id: expForm.employee_id, amount: parseFloat(expForm.amount), category: expForm.category,
        description: expForm.description || null, date: expForm.date, month_ref: selectedMonth,
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

  // Overtime dialog
  const [otOpen, setOtOpen] = useState(false);
  const [otForm, setOtForm] = useState({ employee_id: "", hours: "", percentage: "50", description: "", date: new Date().toISOString().slice(0, 10) });

  const otMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === otForm.employee_id);
      const salary = Number(emp?.salary) || 0;
      const rate = hourlyRate(salary);
      const pct = parseFloat(otForm.percentage) / 100;
      const hrs = parseFloat(otForm.hours);
      const value = rate * (1 + pct) * hrs;

      const { error } = await supabase.from("employee_overtime").insert({
        employee_id: otForm.employee_id, hours: hrs, percentage: parseFloat(otForm.percentage),
        calculated_value: Math.round(value * 100) / 100,
        description: otForm.description || null, date: otForm.date, month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-overtime"] });
      setOtOpen(false);
      setOtForm({ employee_id: "", hours: "", percentage: "50", description: "", date: new Date().toISOString().slice(0, 10) });
      toast({ title: "Hora extra registrada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Saturday dialog
  const [satOpen, setSatOpen] = useState(false);
  const [satForm, setSatForm] = useState({ employee_id: "", hours: "", description: "", date: new Date().toISOString().slice(0, 10) });

  const satMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === satForm.employee_id);
      const salary = Number(emp?.salary) || 0;
      const rate = hourlyRate(salary);
      const hrs = parseFloat(satForm.hours);
      const value = rate * 1.5 * hrs; // sábado = 50% extra

      const { error } = await supabase.from("employee_saturdays").insert({
        employee_id: satForm.employee_id, hours: hrs,
        calculated_value: Math.round(value * 100) / 100,
        description: satForm.description || null, date: satForm.date, month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-saturdays"] });
      setSatOpen(false);
      setSatForm({ employee_id: "", hours: "", description: "", date: new Date().toISOString().slice(0, 10) });
      toast({ title: "Sábado registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Closing mutation — updated formula
  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error("Funcionário não encontrado");

      const baseSalary = Number(emp.salary) || 0;
      const totalAdv = advances.filter(a => a.employee_id === employeeId).reduce((s, a) => s + Number(a.amount), 0);
      const totalExp = expenses.filter(e => e.employee_id === employeeId).reduce((s, e) => s + Number(e.amount), 0);
      const totalOt = overtime.filter(o => o.employee_id === employeeId).reduce((s, o) => s + Number(o.calculated_value), 0);
      const totalSat = saturdays.filter(s => s.employee_id === employeeId).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const netPay = baseSalary + totalOt + totalSat - totalAdv - totalExp;

      const { error } = await supabase.from("monthly_closings").upsert({
        employee_id: employeeId, month_ref: selectedMonth,
        base_salary: baseSalary, total_advances: totalAdv, total_expenses: totalExp,
        total_overtime: totalOt, total_saturdays: totalSat, net_pay: netPay,
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
  const totalOvertime = useMemo(() => overtime.reduce((s, o) => s + Number(o.calculated_value), 0), [overtime]);
  const totalSaturdays = useMemo(() => saturdays.reduce((s, sat) => s + Number(sat.calculated_value), 0), [saturdays]);

  // Closing summary per employee
  const employeeSummary = useMemo(() => {
    return employees.map(emp => {
      const empAdvances = advances.filter(a => a.employee_id === emp.id).reduce((s, a) => s + Number(a.amount), 0);
      const empExpenses = expenses.filter(e => e.employee_id === emp.id).reduce((s, e) => s + Number(e.amount), 0);
      const empOvertime = overtime.filter(o => o.employee_id === emp.id).reduce((s, o) => s + Number(o.calculated_value), 0);
      const empSaturdays = saturdays.filter(s => s.employee_id === emp.id).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const baseSalary = Number(emp.salary) || 0;
      const closing = closings.find(c => c.employee_id === emp.id);
      const netPay = baseSalary + empOvertime + empSaturdays - empAdvances - empExpenses;
      return { ...emp, baseSalary, empAdvances, empExpenses, empOvertime, empSaturdays, netPay, closing };
    });
  }, [employees, advances, expenses, overtime, saturdays, closings]);

  const categories = ["EPI", "Uniforme", "Ferramentas", "Combustível", "Outro"];
  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />Dashboard</TabsTrigger>
          <TabsTrigger value="salarios"><DollarSign className="h-4 w-4 mr-1 hidden sm:inline" />Salários</TabsTrigger>
          <TabsTrigger value="horas"><Clock className="h-4 w-4 mr-1 hidden sm:inline" />Horas Extras</TabsTrigger>
          <TabsTrigger value="sabados"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" />Sábados</TabsTrigger>
          <TabsTrigger value="gastos"><Receipt className="h-4 w-4 mr-1 hidden sm:inline" />Gastos</TabsTrigger>
          <TabsTrigger value="fechamento"><CheckCircle className="h-4 w-4 mr-1 hidden sm:inline" />Fechamento</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
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
                <CardTitle className="text-sm font-medium">Horas Extras</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{fmt(totalOvertime)}</div>
                <p className="text-xs text-muted-foreground">{overtime.length} registros</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Sábados</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{fmt(totalSaturdays)}</div>
                <p className="text-xs text-muted-foreground">{saturdays.length} registros</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vales/Adiant.</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{fmt(totalAdvances)}</div>
                <p className="text-xs text-muted-foreground">{monthLabel(selectedMonth)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Gastos Func.</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{fmt(totalExpenses)}</div>
                <p className="text-xs text-muted-foreground">{monthLabel(selectedMonth)}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Salários / Adiantamentos */}
        <TabsContent value="salarios" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={advOpen} onOpenChange={setAdvOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Adiantamento/Vale</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Adiantamento/Vale</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); advMutation.mutate(); }} className="space-y-3">
                  <div><Label>Funcionário *</Label>
                    <select className={selectClass} value={advForm.employee_id} onChange={e => setAdvForm({ ...advForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Tipo *</Label>
                      <select className={selectClass} value={advForm.type} onChange={e => setAdvForm({ ...advForm, type: e.target.value })}>
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
          <Card>
            <CardHeader><CardTitle className="text-base">Salários Base</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Função</TableHead><TableHead>Salário Base</TableHead><TableHead>Valor/Hora</TableHead></TableRow></TableHeader>
                <TableBody>
                  {employees.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{e.role || "-"}</TableCell>
                      <TableCell>{e.salary ? fmt(Number(e.salary)) : "-"}</TableCell>
                      <TableCell>{e.salary ? fmt(hourlyRate(Number(e.salary))) : "-"}</TableCell>
                    </TableRow>
                  ))}
                  {employees.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Adiantamentos/Vales - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead></TableRow></TableHeader>
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

        {/* Horas Extras */}
        <TabsContent value="horas" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={otOpen} onOpenChange={setOtOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Hora Extra</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Hora Extra</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); otMutation.mutate(); }} className="space-y-3">
                  <div><Label>Funcionário *</Label>
                    <select className={selectClass} value={otForm.employee_id} onChange={e => setOtForm({ ...otForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Horas *</Label><Input type="number" step="0.5" min="0.5" value={otForm.hours} onChange={e => setOtForm({ ...otForm, hours: e.target.value })} required /></div>
                    <div><Label>Percentual *</Label>
                      <select className={selectClass} value={otForm.percentage} onChange={e => setOtForm({ ...otForm, percentage: e.target.value })}>
                        <option value="50">50% (Dia útil)</option>
                        <option value="100">100% (Feriado/Domingo)</option>
                      </select>
                    </div>
                  </div>
                  {otForm.employee_id && otForm.hours && (() => {
                    const emp = employees.find(e => e.id === otForm.employee_id);
                    const salary = Number(emp?.salary) || 0;
                    const rate = hourlyRate(salary);
                    const pct = parseFloat(otForm.percentage) / 100;
                    const hrs = parseFloat(otForm.hours) || 0;
                    const value = rate * (1 + pct) * hrs;
                    return (
                      <div className="p-3 rounded-md bg-muted text-sm">
                        <p>Valor/hora: {fmt(rate)} → Com {otForm.percentage}%: {fmt(rate * (1 + pct))}</p>
                        <p className="font-bold mt-1">Total: {fmt(value)}</p>
                      </div>
                    );
                  })()}
                  <div><Label>Descrição</Label><Input value={otForm.description} onChange={e => setOtForm({ ...otForm, description: e.target.value })} /></div>
                  <div><Label>Data</Label><Input type="date" value={otForm.date} onChange={e => setOtForm({ ...otForm, date: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={otMutation.isPending}>Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Horas Extras - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Horas</TableHead><TableHead>%</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overtime.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{(o.employees as any)?.name}</TableCell>
                      <TableCell>{o.hours}h</TableCell>
                      <TableCell><Badge variant="secondary">{o.percentage}%</Badge></TableCell>
                      <TableCell>{fmt(Number(o.calculated_value))}</TableCell>
                      <TableCell>{new Date(o.date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="hidden md:table-cell">{o.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {overtime.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma hora extra neste mês.</TableCell></TableRow>}
                </TableBody>
              </Table>
              {overtime.length > 0 && (
                <div className="mt-4 text-right font-bold">Total: {fmt(totalOvertime)} ({overtime.reduce((s, o) => s + Number(o.hours), 0)}h)</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sábados */}
        <TabsContent value="sabados" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={satOpen} onOpenChange={setSatOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Sábado</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Sábado Trabalhado</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); satMutation.mutate(); }} className="space-y-3">
                  <div><Label>Funcionário *</Label>
                    <select className={selectClass} value={satForm.employee_id} onChange={e => setSatForm({ ...satForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div><Label>Horas trabalhadas *</Label><Input type="number" step="0.5" min="0.5" value={satForm.hours} onChange={e => setSatForm({ ...satForm, hours: e.target.value })} required /></div>
                  {satForm.employee_id && satForm.hours && (() => {
                    const emp = employees.find(e => e.id === satForm.employee_id);
                    const salary = Number(emp?.salary) || 0;
                    const rate = hourlyRate(salary);
                    const hrs = parseFloat(satForm.hours) || 0;
                    const value = rate * 1.5 * hrs;
                    return (
                      <div className="p-3 rounded-md bg-muted text-sm">
                        <p>Valor/hora normal: {fmt(rate)} → Sábado (50%): {fmt(rate * 1.5)}</p>
                        <p className="font-bold mt-1">Total: {fmt(value)}</p>
                      </div>
                    );
                  })()}
                  <div><Label>Descrição</Label><Input value={satForm.description} onChange={e => setSatForm({ ...satForm, description: e.target.value })} /></div>
                  <div><Label>Data</Label><Input type="date" value={satForm.date} onChange={e => setSatForm({ ...satForm, date: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={satMutation.isPending}>Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Sábados Trabalhados - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Horas</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead></TableRow></TableHeader>
                <TableBody>
                  {saturdays.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{(s.employees as any)?.name}</TableCell>
                      <TableCell>{s.hours}h</TableCell>
                      <TableCell>{fmt(Number(s.calculated_value))}</TableCell>
                      <TableCell>{new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="hidden md:table-cell">{s.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {saturdays.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum sábado neste mês.</TableCell></TableRow>}
                </TableBody>
              </Table>
              {saturdays.length > 0 && (
                <div className="mt-4 text-right font-bold">Total: {fmt(totalSaturdays)} ({saturdays.reduce((s, sat) => s + Number(sat.hours), 0)}h)</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gastos */}
        <TabsContent value="gastos" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Gasto</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar Gasto</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); expMutation.mutate(); }} className="space-y-3">
                  <div><Label>Funcionário *</Label>
                    <select className={selectClass} value={expForm.employee_id} onChange={e => setExpForm({ ...expForm, employee_id: e.target.value })} required>
                      <option value="">Selecione</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Categoria *</Label>
                      <select className={selectClass} value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
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
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Categoria</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead></TableRow></TableHeader>
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
              <p className="text-xs text-muted-foreground">Fórmula: Salário Base + Horas Extras + Sábados - Vales/Adiant. - Gastos = Líquido</p>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Salário</TableHead>
                    <TableHead>H. Extras</TableHead>
                    <TableHead>Sábados</TableHead>
                    <TableHead>Vales</TableHead>
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
                      <TableCell className="text-primary">{fmt(e.empOvertime)}</TableCell>
                      <TableCell className="text-primary">{fmt(e.empSaturdays)}</TableCell>
                      <TableCell className="text-amber-600">{fmt(e.empAdvances)}</TableCell>
                      <TableCell className="text-destructive">{fmt(e.empExpenses)}</TableCell>
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
                            <Button size="sm" variant="outline" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending}>Calcular</Button>
                          )}
                          {e.closing && !e.closing.paid && (
                            <Button size="sm" onClick={() => markPaidMutation.mutate(e.closing!.id)} disabled={markPaidMutation.isPending}>Pagar</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeeSummary.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
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
