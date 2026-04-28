import { formatDateBR, localDateString, parseLocalDate } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { Plus, DollarSign, CheckCircle, BarChart3, Clock, Calendar, Palmtree, Gift, AlertTriangle, Banknote, Trash2, Pencil, PartyPopper } from "lucide-react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const currentYear = () => new Date().getFullYear();
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(mo) - 1]}/${y}`;
};
const hourlyRate = (salary: number) => salary / 220;
const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

const HR = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const canEdit = userRole === "admin" || userRole === "financeiro";
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear());

  // ── Delete state ──
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id: string; label: string } | null>(null);

  // ── Queries ──
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => { const { data } = await supabase.from("employees").select("*").eq("active", true).order("name"); return data ?? []; },
  });
  const { data: advances = [] } = useQuery({
    queryKey: ["employee-advances", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("employee_advances").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false }); return data ?? []; },
  });
  // expenses query removed — replaced by vales (employee_advances)
  const { data: overtime = [] } = useQuery({
    queryKey: ["employee-overtime", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("employee_overtime").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false }); return data ?? []; },
  });
  const { data: saturdays = [] } = useQuery({
    queryKey: ["employee-saturdays", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("employee_saturdays").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false }); return data ?? []; },
  });
  const { data: holidays = [] } = useQuery({
    queryKey: ["employee-holidays", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("employee_holidays" as any).select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false }); return (data as any[]) ?? []; },
  });
  const { data: closings = [] } = useQuery({
    queryKey: ["monthly-closings", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("monthly_closings").select("*, employees(name)").eq("month_ref", selectedMonth); return data ?? []; },
  });
  const { data: vacations = [] } = useQuery({
    queryKey: ["employee-vacations"],
    queryFn: async () => { const { data } = await supabase.from("employee_vacations").select("*, employees(name)").order("start_date", { ascending: false }); return data ?? []; },
  });
  const { data: thirteenths = [] } = useQuery({
    queryKey: ["thirteenth-salary", selectedYear],
    queryFn: async () => { const { data } = await supabase.from("thirteenth_salary").select("*, employees(name)").eq("year", selectedYear); return data ?? []; },
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => { const { data } = await supabase.from("financial_accounts").select("*").eq("active", true).order("name"); return data ?? []; },
  });
  const { data: salaryPayments = [] } = useQuery({
    queryKey: ["salary-payments", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("salary_payments").select("*, employees(name)").eq("month_ref", selectedMonth).order("payment_date", { ascending: false }); return data ?? []; },
  });

  // ── Generic delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-advances"] });
      queryClient.invalidateQueries({ queryKey: ["employee-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["employee-overtime"] });
      queryClient.invalidateQueries({ queryKey: ["employee-saturdays"] });
      queryClient.invalidateQueries({ queryKey: ["employee-vacations"] });
      queryClient.invalidateQueries({ queryKey: ["thirteenth-salary"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-payments"] });
      setDeleteTarget(null);
      toast({ title: "Registro excluído!" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  // ── Advance ──
  const [advOpen, setAdvOpen] = useState(false);
  const [advForm, setAdvForm] = useState({ employee_id: "", amount: "", type: "adiantamento", description: "", date: localDateString() });
  const advMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_advances").insert({ employee_id: advForm.employee_id, amount: parseFloat(advForm.amount), type: advForm.type, description: advForm.description || null, date: advForm.date, month_ref: selectedMonth });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-advances"] }); setAdvOpen(false); setAdvForm({ employee_id: "", amount: "", type: "adiantamento", description: "", date: localDateString() }); toast({ title: "Registrado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Expense section removed — replaced by Vales tab using employee_advances

  // ── Overtime ──
  const [otOpen, setOtOpen] = useState(false);
  const [otForm, setOtForm] = useState({ employee_id: "", hours: "", percentage: "50", description: "", date: localDateString() });
  const otMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === otForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const fixedRate = Number(emp.overtime_hourly_rate) || 0;
      if (fixedRate <= 0) throw new Error(`Cadastre o valor hora extra de ${emp.name} antes de registrar`);
      const hrs = parseFloat(otForm.hours);
      if (!hrs || hrs <= 0) throw new Error("Informe a quantidade de horas");
      const pct = parseFloat(otForm.percentage);
      const multiplier = pct === 100 ? 2 : 1.5; // 50% → 1.5x, 100% → 2x
      const value = fixedRate * multiplier * hrs;
      const { error } = await supabase.from("employee_overtime").insert({ employee_id: otForm.employee_id, hours: hrs, percentage: pct, calculated_value: Math.round(value * 100) / 100, description: otForm.description || null, date: otForm.date, month_ref: selectedMonth });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-overtime"] }); setOtOpen(false); setOtForm({ employee_id: "", hours: "", percentage: "50", description: "", date: localDateString() }); toast({ title: "Hora extra registrada!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Saturday (contagem por dias trabalhados, aceita decimais) ──
  const [satOpen, setSatOpen] = useState(false);
  const [satForm, setSatForm] = useState({ employee_id: "", hours: "", description: "", date: localDateString() });
  const satMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === satForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const satValue = Number(emp.saturday_value) || 0;
      if (satValue <= 0) throw new Error(`Cadastre o valor do sábado de ${emp.name} antes de registrar`);
      const days = parseFloat(satForm.hours);
      if (!days || days <= 0) throw new Error("Informe a quantidade de sábados");
      const total = satValue * days;
      // Campo "hours" reaproveitado para armazenar quantidade de sábados (decimal)
      const { error } = await supabase.from("employee_saturdays").insert({ employee_id: satForm.employee_id, hours: days, calculated_value: Math.round(total * 100) / 100, description: satForm.description || null, date: satForm.date, month_ref: selectedMonth });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-saturdays"] }); setSatOpen(false); setSatForm({ employee_id: "", hours: "", description: "", date: localDateString() }); toast({ title: "Sábado registrado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Vacation ──
  const [vacOpen, setVacOpen] = useState(false);
  const [vacForm, setVacForm] = useState({ employee_id: "", start_date: "", end_date: "", days: "", notes: "" });
  const vacMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === vacForm.employee_id);
      const salary = Number(emp?.salary) || 0;
      const days = parseInt(vacForm.days);
      const vacValue = (salary / 30) * days;
      const third = vacValue / 3;
      const { error } = await supabase.from("employee_vacations").insert({
        employee_id: vacForm.employee_id, start_date: vacForm.start_date, end_date: vacForm.end_date, days,
        base_salary: salary, vacation_value: Math.round(vacValue * 100) / 100,
        constitutional_third: Math.round(third * 100) / 100, total_value: Math.round((vacValue + third) * 100) / 100,
        notes: vacForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-vacations"] }); setVacOpen(false); setVacForm({ employee_id: "", start_date: "", end_date: "", days: "", notes: "" }); toast({ title: "Férias registradas!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── 13th salary ──
  const thirteenthMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      const salary = Number(emp?.salary) || 0;
      const hireDate = parseLocalDate(emp?.hire_date);
      const now = new Date();
      let monthsWorked = 12;
      if (hireDate && hireDate.getFullYear() === selectedYear) {
        monthsWorked = now.getMonth() - hireDate.getMonth() + 1;
        if (monthsWorked < 1) monthsWorked = 1;
      }
      const provision = salary / 12;
      const total = (salary / 12) * monthsWorked;
      const firstInstallment = Math.round((total / 2) * 100) / 100;
      const secondInstallment = Math.round((total - firstInstallment) * 100) / 100;

      const { error } = await supabase.from("thirteenth_salary").upsert({
        employee_id: employeeId, year: selectedYear, monthly_provision: Math.round(provision * 100) / 100,
        first_installment: firstInstallment, second_installment: secondInstallment,
      }, { onConflict: "employee_id,year" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["thirteenth-salary"] }); toast({ title: "13º calculado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payInstallmentMutation = useMutation({
    mutationFn: async ({ id, installment }: { id: string; installment: 1 | 2 }) => {
      const update = installment === 1
        ? { first_installment_paid: true, first_installment_date: localDateString() }
        : { second_installment_paid: true, second_installment_date: localDateString() };
      const { error } = await supabase.from("thirteenth_salary").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["thirteenth-salary"] }); toast({ title: "Parcela paga!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Closing ──
  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error("Funcionário não encontrado");
      const baseSalary = Number(emp.salary) || 0;
      const totalAdv = advances.filter(a => a.employee_id === employeeId).reduce((s, a) => s + Number(a.amount), 0);
      const totalExp = 0;
      const totalOt = overtime.filter(o => o.employee_id === employeeId).reduce((s, o) => s + Number(o.calculated_value), 0);
      const totalSat = saturdays.filter(s => s.employee_id === employeeId).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const netPay = baseSalary + totalOt + totalSat - totalAdv - totalExp;
      const { error } = await supabase.from("monthly_closings").upsert({ employee_id: employeeId, month_ref: selectedMonth, base_salary: baseSalary, total_advances: totalAdv, total_expenses: totalExp, total_overtime: totalOt, total_saturdays: totalSat, net_pay: netPay }, { onConflict: "employee_id,month_ref" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); toast({ title: "Fechamento calculado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Salary Payment ──
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ employee_id: "", amount: "", payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" });

  const salaryPayMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === payForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const payAmount = parseFloat(payForm.amount);
      if (!payAmount || payAmount <= 0) throw new Error("Informe um valor válido");

      // Create financial transaction
      const { data: ftData, error: ftError } = await supabase.from("financial_transactions").insert({
        type: "a_pagar" as any,
        description: `Salário — ${emp.name} — ${monthLabel(selectedMonth)}`,
        amount: payAmount,
        due_date: payForm.payment_date,
        paid_date: payForm.payment_date,
        status: "pago" as any,
        category: "Folha de Pagamento",
        account_id: payForm.account_id || null,
        sync_origin: "payroll",
      }).select("id").single();
      if (ftError) throw ftError;

      // Record in salary_payments — month_ref derived from the payment date entered
      const payMonthRef = payForm.payment_date.substring(0, 7); // "YYYY-MM"
      const { error: spError } = await supabase.from("salary_payments" as any).insert({
        employee_id: payForm.employee_id,
        month_ref: payMonthRef,
        amount: payAmount,
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        account_id: payForm.account_id || null,
        notes: payForm.notes || null,
        financial_transaction_id: ftData?.id || null,
      });
      if (spError) throw spError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-payments"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-saidas"] });
      setPayOpen(false);
      setPayForm({ employee_id: "", amount: "", payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" });
      toast({ title: "Pagamento registrado e lançado no Financeiro!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (closingId: string) => {
      const closing = closings.find(c => c.id === closingId);
      if (!closing) throw new Error("Fechamento não encontrado");
      const today = localDateString();
      const { error } = await supabase.from("monthly_closings").update({ paid: true, paid_date: today }).eq("id", closingId);
      if (error) throw error;

      const empName = (closing as any).employees?.name ?? employees.find(e => e.id === closing.employee_id)?.name ?? "Funcionário";
      await supabase.from("financial_transactions").insert({
        type: "a_pagar" as any,
        description: `Folha de Pagamento - ${empName} (${monthLabel(closing.month_ref)})`,
        amount: Number(closing.net_pay),
        due_date: today,
        paid_date: today,
        status: "pago" as any,
        category: "Folha de Pagamento",
        sync_origin: "payroll",
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); queryClient.invalidateQueries({ queryKey: ["financial"] }); queryClient.invalidateQueries({ queryKey: ["financial-saidas"] }); toast({ title: "Marcado como pago!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Edit Employee Salary ──
  const [editEmpOpen, setEditEmpOpen] = useState(false);
  const [editEmpForm, setEditEmpForm] = useState({ id: "", name: "", salary: "", saturday_value: "", overtime_hourly_rate: "" });

  const editEmpMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").update({
        salary: parseFloat(editEmpForm.salary) || 0,
        saturday_value: parseFloat(editEmpForm.saturday_value) || 0,
        overtime_hourly_rate: parseFloat(editEmpForm.overtime_hourly_rate) || 0,
      }).eq("id", editEmpForm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditEmpOpen(false);
      toast({ title: "Salário atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEditEmp = (emp: any) => {
    setEditEmpForm({
      id: emp.id,
      name: emp.name,
      salary: String(Number(emp.salary) || 0),
      saturday_value: String(Number(emp.saturday_value) || 0),
      overtime_hourly_rate: String(Number(emp.overtime_hourly_rate) || 0),
    });
    setEditEmpOpen(true);
  };

  // ── Dashboard calcs ──
  const totalPayroll = useMemo(() => employees.reduce((s, e) => s + (Number(e.salary) || 0), 0), [employees]);
  const totalAdvances = useMemo(() => advances.reduce((s, a) => s + Number(a.amount), 0), [advances]);
  const totalExpenses = 0;
  const totalOvertime = useMemo(() => overtime.reduce((s, o) => s + Number(o.calculated_value), 0), [overtime]);
  const totalSaturdays = useMemo(() => saturdays.reduce((s, sat) => s + Number(sat.calculated_value), 0), [saturdays]);
  const total13thProvision = useMemo(() => thirteenths.reduce((s, t) => s + Number(t.monthly_provision) * (new Date().getMonth() + 1), 0), [thirteenths]);

  const vacationAlerts = useMemo(() => {
    const today = new Date();
    return employees.map(emp => {
      if (!emp.hire_date) return null;
      const hire = parseLocalDate(emp.hire_date);
      if (!hire) return null;
      const empVacs = vacations.filter(v => v.employee_id === emp.id);
      const vacationEndDates = empVacs.map(v => parseLocalDate(v.end_date)).filter((date): date is Date => date !== null);
      const lastVacEnd = vacationEndDates.length > 0 ? new Date(Math.max(...vacationEndDates.map(date => date.getTime()))) : hire;
      const daysSinceLast = daysBetween(lastVacEnd, today);
      const daysUntilDue = 365 - daysSinceLast;
      if (daysSinceLast >= 365) return { emp, status: "vencida" as const, days: daysSinceLast - 365 };
      if (daysUntilDue <= 30) return { emp, status: "a_vencer" as const, days: daysUntilDue };
      return null;
    }).filter(Boolean) as { emp: typeof employees[0]; status: "vencida" | "a_vencer"; days: number }[];
  }, [employees, vacations]);

  const employeeSummary = useMemo(() => {
    return employees.map(emp => {
      const empAdvances = advances.filter(a => a.employee_id === emp.id).reduce((s, a) => s + Number(a.amount), 0);
      const empExpenses = 0;
      const empOvertime = overtime.filter(o => o.employee_id === emp.id).reduce((s, o) => s + Number(o.calculated_value), 0);
      const empSaturdays = saturdays.filter(s => s.employee_id === emp.id).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const baseSalary = Number(emp.salary) || 0;
      const closing = closings.find(c => c.employee_id === emp.id);
      const netPay = baseSalary + empOvertime + empSaturdays - empAdvances - empExpenses;
      const totalPaid = salaryPayments.filter((p: any) => p.employee_id === emp.id).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const remaining = netPay - totalPaid;
      return { ...emp, baseSalary, empAdvances, empExpenses, empOvertime, empSaturdays, netPay, closing, totalPaid, remaining };
    });
  }, [employees, advances, overtime, saturdays, closings, salaryPayments]);

  // categories removed — no longer used

  const selectedPayEmployee = employeeSummary.find(e => e.id === payForm.employee_id);

  // Delete button helper
  const DeleteBtn = ({ table, id, label }: { table: string; id: string; label: string }) => {
    if (!canEdit) return null;
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ table, id, label })}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Recursos Humanos</h1>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Mês:</Label>
          <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44" />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Confirmar Exclusão"
        description={`Tem certeza que deseja excluir "${deleteTarget?.label}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ table: deleteTarget.table, id: deleteTarget.id }); }}
        isPending={deleteMutation.isPending}
      />

      {/* Edit Employee Salary Dialog */}
      <Dialog open={editEmpOpen} onOpenChange={setEditEmpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Salário — {editEmpForm.name}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editEmpMutation.mutate(); }} className="space-y-3">
            <div><Label>Salário Base (R$)</Label><Input type="number" step="0.01" min="0" value={editEmpForm.salary} onChange={e => setEditEmpForm({ ...editEmpForm, salary: e.target.value })} required /></div>
            <div><Label>Valor Sábado (R$)</Label><Input type="number" step="0.01" min="0" value={editEmpForm.saturday_value} onChange={e => setEditEmpForm({ ...editEmpForm, saturday_value: e.target.value })} /></div>
            <div><Label>Valor Hora Extra (R$)</Label><Input type="number" step="0.01" min="0" value={editEmpForm.overtime_hourly_rate} onChange={e => setEditEmpForm({ ...editEmpForm, overtime_hourly_rate: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={editEmpMutation.isPending}>Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />Dashboard</TabsTrigger>
          <TabsTrigger value="salarios"><DollarSign className="h-4 w-4 mr-1 hidden sm:inline" />Salários</TabsTrigger>
          <TabsTrigger value="horas"><Clock className="h-4 w-4 mr-1 hidden sm:inline" />Horas Extras</TabsTrigger>
          <TabsTrigger value="sabados"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" />Sábados</TabsTrigger>
          <TabsTrigger value="vales"><Banknote className="h-4 w-4 mr-1 hidden sm:inline" />Vales</TabsTrigger>
          <TabsTrigger value="ferias"><Palmtree className="h-4 w-4 mr-1 hidden sm:inline" />Férias</TabsTrigger>
          <TabsTrigger value="decimo"><Gift className="h-4 w-4 mr-1 hidden sm:inline" />13º</TabsTrigger>
          <TabsTrigger value="fechamento"><CheckCircle className="h-4 w-4 mr-1 hidden sm:inline" />Fechamento</TabsTrigger>
        </TabsList>

        {/* ── Dashboard ── */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Folha do Mês</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(totalPayroll)}</div><p className="text-xs text-muted-foreground">{employees.length} funcionários</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Horas Extras</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalOvertime)}</div><p className="text-xs text-muted-foreground">{overtime.length} registros</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Sábados</CardTitle><Calendar className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalSaturdays)}</div><p className="text-xs text-muted-foreground">{saturdays.length} registros</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Vales/Adiant.</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{fmt(totalAdvances)}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Vales</CardTitle><Banknote className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{fmt(totalAdvances)}</div><p className="text-xs text-muted-foreground">{advances.length} registros</p></CardContent></Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Provisão 13º ({selectedYear})</CardTitle><Gift className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(total13thProvision)}</div>
                <p className="text-xs text-muted-foreground">Acumulado até {monthLabel(selectedMonth)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Alertas de Férias</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent>
                {vacationAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum alerta.</p>
                ) : (
                  <div className="space-y-2">
                    {vacationAlerts.map(a => (
                      <div key={a.emp.id} className="flex items-center justify-between text-sm">
                        <span>{a.emp.name}</span>
                        <Badge variant={a.status === "vencida" ? "destructive" : "secondary"}>
                          {a.status === "vencida" ? `Vencida (${a.days}d)` : `Vence em ${a.days}d`}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Salários ── */}
        <TabsContent value="salarios" className="space-y-4">
          <div className="flex justify-between flex-wrap gap-2">
            {canEdit && (
              <Dialog open={advOpen} onOpenChange={setAdvOpen}><DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2" />Novo Adiantamento/Vale</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Registrar Adiantamento/Vale</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); advMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={advForm.employee_id} onChange={e => setAdvForm({ ...advForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>Tipo *</Label><select className={selectClass} value={advForm.type} onChange={e => setAdvForm({ ...advForm, type: e.target.value })}><option value="adiantamento">Adiantamento</option><option value="vale">Vale</option></select></div><div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} required /></div></div>
                    <div><Label>Descrição</Label><Input value={advForm.description} onChange={e => setAdvForm({ ...advForm, description: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={advForm.date} onChange={e => setAdvForm({ ...advForm, date: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={advMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            )}
            {canEdit && (
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild><Button><Banknote className="h-4 w-4 mr-2" />Registrar Pagamento</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Registrar Pagamento de Salário</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); salaryPayMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label>
                      <select className={selectClass} value={payForm.employee_id} onChange={e => setPayForm({ ...payForm, employee_id: e.target.value })} required>
                        <option value="">Selecione</option>
                        {employeeSummary.map(e => (
                          <option key={e.id} value={e.id}>{e.name} {e.totalPaid > 0 ? `(já pago: ${fmt(e.totalPaid)})` : ""}</option>
                        ))}
                      </select>
                    </div>
                    {selectedPayEmployee && (
                      <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                        <p>Salário Base: {fmt(selectedPayEmployee.baseSalary)}</p>
                        {selectedPayEmployee.empOvertime > 0 && <p className="text-primary">+ Horas Extras: {fmt(selectedPayEmployee.empOvertime)}</p>}
                        {selectedPayEmployee.empSaturdays > 0 && <p className="text-primary">+ Sábados: {fmt(selectedPayEmployee.empSaturdays)}</p>}
                        {selectedPayEmployee.empAdvances > 0 && <p className="text-amber-600">- Vales/Adiant.: {fmt(selectedPayEmployee.empAdvances)}</p>}
                        
                        <hr className="my-1 border-border" />
                        <p className="font-bold">Líquido Total: {fmt(selectedPayEmployee.netPay)}</p>
                        {selectedPayEmployee.totalPaid > 0 && <p className="text-green-600">Já Pago: {fmt(selectedPayEmployee.totalPaid)}</p>}
                        <p className="font-bold text-base">Restante: {fmt(selectedPayEmployee.remaining)}</p>
                      </div>
                    )}
                    <div><Label>Valor do Pagamento (R$) *</Label>
                      <Input type="number" step="0.01" min="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required placeholder={selectedPayEmployee ? String(selectedPayEmployee.remaining) : ""} />
                    </div>
                    <div><Label>Mês de Referência</Label><Input value={monthLabel(selectedMonth)} disabled /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Data do Pagamento *</Label><Input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} required /></div>
                      <div><Label>Forma de Pagamento *</Label>
                        <select className={selectClass} value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                          <option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                    <div><Label>Conta de Origem</Label>
                      <select className={selectClass} value={payForm.account_id} onChange={e => setPayForm({ ...payForm, account_id: e.target.value })}>
                        <option value="">Selecione (opcional)</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div><Label>Observações</Label><Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Ex: Pagamento parcial, 2ª quinzena..." /></div>
                    <Button type="submit" className="w-full" disabled={salaryPayMutation.isPending || !payForm.employee_id || !payForm.amount}>
                      Confirmar Pagamento
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Painel de Salários — {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Salário Base</TableHead>
                    <TableHead>H. Extras</TableHead>
                    <TableHead>Sábados</TableHead>
                    <TableHead>Vales/Adiant.</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Restante</TableHead>
                    <TableHead className="w-40">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeSummary.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{fmt(e.baseSalary)}</TableCell>
                      <TableCell className="text-primary">{e.empOvertime > 0 ? fmt(e.empOvertime) : "-"}</TableCell>
                      <TableCell className="text-primary">{e.empSaturdays > 0 ? fmt(e.empSaturdays) : "-"}</TableCell>
                      <TableCell className="text-amber-600">{e.empAdvances > 0 ? fmt(e.empAdvances) : "-"}</TableCell>
                      
                      <TableCell className="font-bold">{fmt(e.netPay)}</TableCell>
                      <TableCell className="text-green-600">{e.totalPaid > 0 ? fmt(e.totalPaid) : "-"}</TableCell>
                      <TableCell className="font-bold">
                        {e.remaining <= 0
                          ? <Badge variant="default">Quitado</Badge>
                          : <span className="text-amber-600">{fmt(e.remaining)}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => openEditEmp(e)} title="Editar salário">
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => { setPayForm({ ...payForm, employee_id: e.id, amount: String(e.remaining > 0 ? e.remaining : e.netPay) }); setPayOpen(true); }}>
                              <Banknote className="h-3 w-3 mr-1" />Pagar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeeSummary.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-base">Adiantamentos/Vales — {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{advances.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{(a.employees as any)?.name}</TableCell><TableCell><Badge variant={a.type === "vale" ? "destructive" : "secondary"}>{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell><TableCell>{fmt(Number(a.amount))}</TableCell><TableCell>{formatDateBR(a.date)}</TableCell><TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>{canEdit && <TableCell><DeleteBtn table="employee_advances" id={a.id} label={`${a.type} de ${(a.employees as any)?.name}`} /></TableCell>}</TableRow>))}{advances.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum registro.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pagamentos de Salário — {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="hidden md:table-cell">Observações</TableHead>
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaryPayments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.employees?.name}</TableCell>
                      <TableCell className="text-green-600 font-semibold">{fmt(Number(p.amount))}</TableCell>
                      <TableCell>{formatDateBR(p.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {p.payment_method === "pix" ? "PIX" : p.payment_method === "transferencia" ? "Transferência" : p.payment_method === "dinheiro" ? "Dinheiro" : "Outro"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{p.notes || "-"}</TableCell>
                      {canEdit && <TableCell><DeleteBtn table="salary_payments" id={p.id} label={`Pagamento de ${p.employees?.name}`} /></TableCell>}
                    </TableRow>
                  ))}
                  {salaryPayments.length === 0 && (
                    <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum pagamento registrado neste mês.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Horas Extras ── */}
        <TabsContent value="horas" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={otOpen} onOpenChange={setOtOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Hora Extra</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Registrar Hora Extra</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); otMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={otForm.employee_id} onChange={e => setOtForm({ ...otForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>Horas *</Label><Input type="number" step="0.5" min="0.5" value={otForm.hours} onChange={e => setOtForm({ ...otForm, hours: e.target.value })} required /></div><div><Label>Percentual *</Label><select className={selectClass} value={otForm.percentage} onChange={e => setOtForm({ ...otForm, percentage: e.target.value })}><option value="50">50% (Dia útil)</option><option value="100">100% (Feriado)</option></select></div></div>
                    {otForm.employee_id && (() => {
                      const emp = employees.find(e => e.id === otForm.employee_id);
                      const fixedRate = Number(emp?.overtime_hourly_rate) || 0;
                      if (fixedRate <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o valor hora extra de {emp?.name} antes de registrar.</div>;
                      }
                      const pct = parseFloat(otForm.percentage);
                      const multiplier = pct === 100 ? 2 : 1.5;
                      const hrs = parseFloat(otForm.hours) || 0;
                      return (
                        <div className="p-3 rounded-md bg-muted text-sm">
                          <p>Valor hora cadastrado: <strong>{fmt(fixedRate)}</strong></p>
                          <p>Multiplicador {pct}%: ×{multiplier} → {fmt(fixedRate * multiplier)}/h</p>
                          {hrs > 0 && <p className="font-bold mt-1">Total ({hrs}h): {fmt(fixedRate * multiplier * hrs)}</p>}
                        </div>
                      );
                    })()}
                    <div><Label>Descrição</Label><Input value={otForm.description} onChange={e => setOtForm({ ...otForm, description: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={otForm.date} onChange={e => setOtForm({ ...otForm, date: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={otMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            </div>
          )}
          <Card><CardHeader><CardTitle className="text-base">Horas Extras - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Horas</TableHead><TableHead>%</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{overtime.map(o => (<TableRow key={o.id}><TableCell className="font-medium">{(o.employees as any)?.name}</TableCell><TableCell>{o.hours}h</TableCell><TableCell><Badge variant="secondary">{o.percentage}%</Badge></TableCell><TableCell>{fmt(Number(o.calculated_value))}</TableCell><TableCell>{formatDateBR(o.date)}</TableCell>{canEdit && <TableCell><DeleteBtn table="employee_overtime" id={o.id} label={`H.Extra de ${(o.employees as any)?.name}`} /></TableCell>}</TableRow>))}{overtime.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhuma hora extra.</TableCell></TableRow>}</TableBody></Table>{overtime.length > 0 && <div className="mt-4 text-right font-bold">Total: {fmt(totalOvertime)} ({overtime.reduce((s, o) => s + Number(o.hours), 0)}h)</div>}</CardContent></Card>
        </TabsContent>

        {/* ── Sábados ── */}
        <TabsContent value="sabados" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={satOpen} onOpenChange={setSatOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Sábado</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Sábado Trabalhado</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); satMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={satForm.employee_id} onChange={e => setSatForm({ ...satForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div><Label>Quantidade de sábados *</Label><Input type="number" step="0.5" min="0.5" value={satForm.hours} onChange={e => setSatForm({ ...satForm, hours: e.target.value })} required placeholder="Ex: 1, 1.5, 2" /><p className="text-xs text-muted-foreground mt-1">Aceita decimais: 0.5 (meio sábado), 1, 1.5, 2…</p></div>
                    {satForm.employee_id && (() => {
                      const emp = employees.find(e => e.id === satForm.employee_id);
                      const satValue = Number(emp?.saturday_value) || 0;
                      if (satValue <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o valor do sábado de {emp?.name} antes de registrar.</div>;
                      }
                      const days = parseFloat(satForm.hours) || 0;
                      return (
                        <div className="p-3 rounded-md bg-muted text-sm">
                          <p>Valor do sábado cadastrado: <strong>{fmt(satValue)}</strong></p>
                          {days > 0 && <p className="font-bold mt-1">Total ({days} sábado{days !== 1 ? "s" : ""}): {fmt(satValue * days)}</p>}
                        </div>
                      );
                    })()}
                    <div><Label>Descrição</Label><Input value={satForm.description} onChange={e => setSatForm({ ...satForm, description: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={satForm.date} onChange={e => setSatForm({ ...satForm, date: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={satMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            </div>
          )}
          <Card><CardHeader><CardTitle className="text-base">Sábados - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Qtd Sábados</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{saturdays.map(s => (<TableRow key={s.id}><TableCell className="font-medium">{(s.employees as any)?.name}</TableCell><TableCell>{s.hours}</TableCell><TableCell>{fmt(Number(s.calculated_value))}</TableCell><TableCell>{formatDateBR(s.date)}</TableCell>{canEdit && <TableCell><DeleteBtn table="employee_saturdays" id={s.id} label={`Sábado de ${(s.employees as any)?.name}`} /></TableCell>}</TableRow>))}{saturdays.length === 0 && <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">Nenhum sábado.</TableCell></TableRow>}</TableBody></Table>{saturdays.length > 0 && <div className="mt-4 text-right font-bold">Total: {fmt(totalSaturdays)} ({saturdays.reduce((s, sat) => s + Number(sat.hours), 0)} sábados)</div>}</CardContent></Card>
        </TabsContent>

        {/* ── Vales ── */}
        <TabsContent value="vales" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={advOpen} onOpenChange={setAdvOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Vale</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Registrar Vale</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); advMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={advForm.employee_id} onChange={e => setAdvForm({ ...advForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Tipo</Label><select className={selectClass} value={advForm.type} onChange={e => setAdvForm({ ...advForm, type: e.target.value })}><option value="adiantamento">Adiantamento</option><option value="vale">Vale</option></select></div>
                      <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} required /></div>
                    </div>
                    <div><Label>Descrição</Label><Input value={advForm.description} onChange={e => setAdvForm({ ...advForm, description: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={advForm.date} onChange={e => setAdvForm({ ...advForm, date: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={advMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            </div>
          )}
          <Card><CardHeader><CardTitle className="text-base">Vales - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{advances.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{(a.employees as any)?.name}</TableCell><TableCell><Badge variant="outline">{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell><TableCell>{fmt(Number(a.amount))}</TableCell><TableCell>{formatDateBR(a.date)}</TableCell><TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>{canEdit && <TableCell><DeleteBtn table="employee_advances" id={a.id} label={`Vale de ${(a.employees as any)?.name}`} /></TableCell>}</TableRow>))}{advances.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum vale registrado.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        </TabsContent>

        {/* ── Férias ── */}
        <TabsContent value="ferias" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={vacOpen} onOpenChange={setVacOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Férias</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Registrar Férias</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); vacMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={vacForm.employee_id} onChange={e => setVacForm({ ...vacForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label>Data Início *</Label><Input type="date" value={vacForm.start_date} onChange={e => setVacForm({ ...vacForm, start_date: e.target.value })} required /></div><div><Label>Data Fim *</Label><Input type="date" value={vacForm.end_date} onChange={e => setVacForm({ ...vacForm, end_date: e.target.value })} required /></div></div>
                    <div><Label>Dias de Férias *</Label><Input type="number" min="1" max="30" value={vacForm.days} onChange={e => setVacForm({ ...vacForm, days: e.target.value })} required /></div>
                    {vacForm.employee_id && vacForm.days && (() => { const emp = employees.find(e => e.id === vacForm.employee_id); const salary = Number(emp?.salary) || 0; const days = parseInt(vacForm.days) || 0; const vacValue = (salary / 30) * days; const third = vacValue / 3; return (<div className="p-3 rounded-md bg-muted text-sm space-y-1"><p>Salário/dia: {fmt(salary / 30)}</p><p>Valor férias ({days}d): {fmt(vacValue)}</p><p>1/3 constitucional: {fmt(third)}</p><p className="font-bold">Total: {fmt(vacValue + third)}</p></div>); })()}
                    <div><Label>Observações</Label><Input value={vacForm.notes} onChange={e => setVacForm({ ...vacForm, notes: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={vacMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Situação de Férias</CardTitle></CardHeader>
            <CardContent>
              <Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Admissão</TableHead><TableHead>Última Férias</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {employees.map(emp => {
                    const empVacs = vacations.filter(v => v.employee_id === emp.id);
                    const lastVac = empVacs.length > 0 ? empVacs[0] : null;
                    const hireDate = parseLocalDate(emp.hire_date);
                    const refDate = lastVac ? parseLocalDate(lastVac.end_date) : hireDate;
                    const daysSince = refDate ? daysBetween(refDate, new Date()) : 0;
                    const daysUntil = 365 - daysSince;
                    let statusBadge;
                    if (!hireDate) statusBadge = <Badge variant="outline">Sem data admissão</Badge>;
                    else if (daysSince >= 365) statusBadge = <Badge variant="destructive">Vencida ({daysSince - 365}d)</Badge>;
                    else if (daysUntil <= 30) statusBadge = <Badge variant="secondary">Vence em {daysUntil}d</Badge>;
                    else statusBadge = <Badge variant="outline">Em dia ({daysUntil}d)</Badge>;
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>{formatDateBR(hireDate)}</TableCell>
                        <TableCell>{lastVac ? `${formatDateBR(lastVac.start_date)} (${lastVac.days}d)` : "Nunca"}</TableCell>
                        <TableCell>{statusBadge}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Histórico de Férias</CardTitle></CardHeader>
            <CardContent>
              <Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Período</TableHead><TableHead>Dias</TableHead><TableHead>Valor Férias</TableHead><TableHead>1/3</TableHead><TableHead>Total</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader>
                <TableBody>
                  {vacations.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{(v.employees as any)?.name}</TableCell>
                      <TableCell>{formatDateBR(v.start_date)} - {formatDateBR(v.end_date)}</TableCell>
                      <TableCell>{v.days}d</TableCell>
                      <TableCell>{fmt(Number(v.vacation_value))}</TableCell>
                      <TableCell>{fmt(Number(v.constitutional_third))}</TableCell>
                      <TableCell className="font-bold">{fmt(Number(v.total_value))}</TableCell>
                      {canEdit && <TableCell><DeleteBtn table="employee_vacations" id={v.id} label={`Férias de ${(v.employees as any)?.name}`} /></TableCell>}
                    </TableRow>
                  ))}
                  {vacations.length === 0 && <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-8">Nenhuma férias registrada.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 13º Salário ── */}
        <TabsContent value="decimo" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Ano:</Label>
              <Input type="number" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="w-28" min={2020} max={2030} />
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">13º Salário - {selectedYear}</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Provisão/mês</TableHead><TableHead>1ª Parcela</TableHead><TableHead>Status 1ª</TableHead><TableHead>2ª Parcela</TableHead><TableHead>Status 2ª</TableHead><TableHead className="w-40">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {employees.map(emp => {
                    const t = thirteenths.find(t => t.employee_id === emp.id);
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>{t ? fmt(Number(t.monthly_provision)) : fmt((Number(emp.salary) || 0) / 12)}</TableCell>
                        <TableCell>{t ? fmt(Number(t.first_installment)) : "-"}</TableCell>
                        <TableCell>{t ? (t.first_installment_paid ? <Badge variant="default">Pago</Badge> : <Badge variant="secondary">Pendente</Badge>) : <Badge variant="outline">Não calculado</Badge>}</TableCell>
                        <TableCell>{t ? fmt(Number(t.second_installment)) : "-"}</TableCell>
                        <TableCell>{t ? (t.second_installment_paid ? <Badge variant="default">Pago</Badge> : <Badge variant="secondary">Pendente</Badge>) : <Badge variant="outline">Não calculado</Badge>}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {canEdit && !t && <Button size="sm" variant="outline" onClick={() => thirteenthMutation.mutate(emp.id)} disabled={thirteenthMutation.isPending}>Calcular</Button>}
                            {canEdit && t && !t.first_installment_paid && <Button size="sm" variant="outline" onClick={() => payInstallmentMutation.mutate({ id: t.id, installment: 1 })} disabled={payInstallmentMutation.isPending}>Pagar 1ª</Button>}
                            {canEdit && t && t.first_installment_paid && !t.second_installment_paid && <Button size="sm" onClick={() => payInstallmentMutation.mutate({ id: t.id, installment: 2 })} disabled={payInstallmentMutation.isPending}>Pagar 2ª</Button>}
                            {canEdit && t && <DeleteBtn table="thirteenth_salary" id={t.id} label={`13º de ${emp.name}`} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {employees.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum funcionário.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fechamento ── */}
        <TabsContent value="fechamento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fechamento - {monthLabel(selectedMonth)}</CardTitle>
              <p className="text-xs text-muted-foreground">Salário Base + Horas Extras + Sábados - Vales = Líquido</p>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Salário</TableHead><TableHead>H. Extras</TableHead><TableHead>Sábados</TableHead><TableHead>Vales</TableHead><TableHead>Líquido</TableHead><TableHead>Status</TableHead><TableHead className="w-32">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {employeeSummary.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{fmt(e.baseSalary)}</TableCell>
                      <TableCell className="text-primary">{fmt(e.empOvertime)}</TableCell>
                      <TableCell className="text-primary">{fmt(e.empSaturdays)}</TableCell>
                      <TableCell className="text-amber-600">{fmt(e.empAdvances)}</TableCell>
                      
                      <TableCell className="font-bold">{fmt(e.netPay)}</TableCell>
                      <TableCell>{e.closing?.paid ? <Badge variant="default">Pago</Badge> : e.closing ? <Badge variant="secondary">Calculado</Badge> : <Badge variant="outline">Pendente</Badge>}</TableCell>
                      <TableCell>
                        {canEdit && (
                          <div className="flex gap-1">
                            {!e.closing && <Button size="sm" variant="outline" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending}>Calcular</Button>}
                            {e.closing && !e.closing.paid && <Button size="sm" onClick={() => markPaidMutation.mutate(e.closing!.id)} disabled={markPaidMutation.isPending}>Pagar</Button>}
                            {e.closing && <DeleteBtn table="monthly_closings" id={e.closing.id} label={`Fechamento de ${e.name}`} />}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeeSummary.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum funcionário.</TableCell></TableRow>}
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
