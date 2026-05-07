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
import { Plus, DollarSign, CheckCircle, BarChart3, Clock, Calendar, Palmtree, Gift, AlertTriangle, Banknote, Trash2, Pencil, PartyPopper, UserMinus } from "lucide-react";
import DailyRatesTab from "@/components/hr/DailyRatesTab";

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
  const { data: absences = [] } = useQuery({
    queryKey: ["employee-absences", selectedMonth],
    queryFn: async () => { const { data } = await supabase.from("employee_absences" as any).select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false }); return (data as any[]) ?? []; },
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
  // salaryPayments query removed — replaced by salary_installments with status pago

  // Quinzenas (regime de competência por month_ref)
  const { data: installments = [] } = useQuery({
    queryKey: ["salary-installments", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from("salary_installments" as any)
        .select("*")
        .eq("month_ref", selectedMonth)
        .order("installment_number");
      return (data as any[]) ?? [];
    },
  });

  // ── Generic edit dialog state ──
  type EditCtx = {
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
    /** Optional callback to recompute derived fields (e.g. calculated_value) before saving. */
    transform?: (values: Record<string, string>) => Record<string, any>;
    /** Optional callback after successful save (e.g. to also sync a financial transaction). */
    afterSave?: (values: Record<string, string>) => Promise<void>;
    invalidate: string[];
  };
  const [editCtx, setEditCtx] = useState<EditCtx | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const openEdit = (ctx: EditCtx) => {
    const initial: Record<string, string> = {};
    for (const f of ctx.fields) initial[f.key] = f.value;
    setEditValues(initial);
    setEditCtx(ctx);
  };

  const editGenericMutation = useMutation({
    mutationFn: async () => {
      if (!editCtx) throw new Error("Sem contexto");
      const payload = editCtx.transform ? editCtx.transform(editValues) : { ...editValues };
      const { error } = await supabase.from(editCtx.table as any).update(payload).eq("id", editCtx.id);
      if (error) throw error;
      if (editCtx.afterSave) await editCtx.afterSave(editValues);
    },
    onSuccess: () => {
      if (editCtx) {
        for (const k of editCtx.invalidate) queryClient.invalidateQueries({ queryKey: [k] });
      }
      setEditCtx(null);
      setEditValues({});
      toast({ title: "Registro atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["employee-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["employee-absences"] });
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
  const [otForm, setOtForm] = useState({ employee_id: "", hours: "", description: "", date: localDateString() });
  const otMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === otForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const fixedRate = Number(emp.overtime_hourly_rate) || 0;
      if (fixedRate <= 0) throw new Error(`Cadastre o valor hora extra de ${emp.name} antes de registrar`);
      const hrs = parseFloat(otForm.hours);
      if (!hrs || hrs <= 0) throw new Error("Informe a quantidade de horas");
      const value = fixedRate * hrs;
      const { error } = await supabase.from("employee_overtime").insert({ employee_id: otForm.employee_id, hours: hrs, percentage: 0, calculated_value: Math.round(value * 100) / 100, description: otForm.description || null, date: otForm.date, month_ref: selectedMonth });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-overtime"] }); setOtOpen(false); setOtForm({ employee_id: "", hours: "", description: "", date: localDateString() }); toast({ title: "Hora extra registrada!" }); },
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

  // ── Holiday (feriado trabalhado: cada feriado adiciona 1 diária) ──
  const [holOpen, setHolOpen] = useState(false);
  const [holForm, setHolForm] = useState({ employee_id: "", holiday_name: "", description: "", date: localDateString() });
  const holMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === holForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const dailyRate = Number(emp.daily_rate) || 0;
      if (dailyRate <= 0) throw new Error(`Cadastre o valor da diária de ${emp.name} na aba Diárias antes de registrar`);
      if (!holForm.holiday_name.trim()) throw new Error("Informe o nome do feriado");
      const total = dailyRate; // 1 diária por feriado
      const { error } = await supabase.from("employee_holidays" as any).insert({
        employee_id: holForm.employee_id,
        date: holForm.date,
        holiday_name: holForm.holiday_name,
        hours: 0,
        day_quantity: 1,
        daily_rate: dailyRate,
        calculated_value: Math.round(total * 100) / 100,
        description: holForm.description || null,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-holidays"] }); setHolOpen(false); setHolForm({ employee_id: "", holiday_name: "", description: "", date: localDateString() }); toast({ title: "Feriado registrado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Absence (Faltas) ──
  const [absOpen, setAbsOpen] = useState(false);
  const [absForm, setAbsForm] = useState({ employee_id: "", day_quantity: "1", reason: "", date: localDateString() });
  const absMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === absForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const salary = Number(emp.salary) || 0;
      if (salary <= 0) throw new Error(`Cadastre o salário base de ${emp.name} antes de registrar`);
      const days = parseFloat(absForm.day_quantity);
      if (!days || days <= 0) throw new Error("Informe a quantidade de faltas (decimais permitidos)");
      const dailyRate = salary / 20;
      const total = dailyRate * days;
      const { error } = await supabase.from("employee_absences" as any).insert({
        employee_id: absForm.employee_id,
        date: absForm.date,
        day_quantity: days,
        reason: absForm.reason || null,
        daily_rate: Math.round(dailyRate * 100) / 100,
        calculated_value: Math.round(total * 100) / 100,
        month_ref: selectedMonth,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-absences"] }); setAbsOpen(false); setAbsForm({ employee_id: "", day_quantity: "1", reason: "", date: localDateString() }); toast({ title: "Falta registrada!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const [vacOpen, setVacOpen] = useState(false);
  const [vacForm, setVacForm] = useState({ employee_id: "", start_date: "", end_date: "", days: "", vacation_value: "", notes: "" });
  const vacMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === vacForm.employee_id);
      const salary = Number(emp?.salary) || 0;
      const days = parseInt(vacForm.days);
      // Valor de férias: usa o digitado se informado, senão calcula automaticamente
      const manualVal = parseFloat(vacForm.vacation_value);
      const vacValue = !isNaN(manualVal) && manualVal > 0 ? manualVal : (salary / 30) * days;
      const third = vacValue / 3;
      const { error } = await supabase.from("employee_vacations").insert({
        employee_id: vacForm.employee_id, start_date: vacForm.start_date, end_date: vacForm.end_date, days,
        base_salary: salary, vacation_value: Math.round(vacValue * 100) / 100,
        constitutional_third: Math.round(third * 100) / 100, total_value: Math.round((vacValue + third) * 100) / 100,
        notes: vacForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employee-vacations"] }); setVacOpen(false); setVacForm({ employee_id: "", start_date: "", end_date: "", days: "", vacation_value: "", notes: "" }); toast({ title: "Férias registradas!" }); },
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

  // Mutation antiga removida — substituída por pay13thInstallmentMutation (mais abaixo)

  // ── Helpers para cálculo de quinzena dinâmica ──
  const getNextFriday = (date: Date): string => {
    const d = new Date(date.getTime());
    const target = new Date(d.getTime());
    target.setDate(target.getDate() + 15);
    let day = target.getDay();
    let diff = (5 - day + 7) % 7;
    target.setDate(target.getDate() + diff);
    return localDateString(target);
  };

  const getPreviousFriday = (dateStr: string): string => {
    const d = parseLocalDate(dateStr) || new Date();
    d.setDate(d.getDate() - 14);
    let day = d.getDay();
    let diff = (day - 5 + 7) % 7;
    d.setDate(d.getDate() - diff);
    return localDateString(d);
  };

  const [viewQuinzenaDate, setViewQuinzenaDate] = useState(getNextFriday(new Date()));


  // ── Closing (gera fechamento + quinzenas dinâmicas) ──
  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error("Funcionário não encontrado");
      const baseSalary = Number(emp.salary) || 0;
      const totalOt = overtime.filter(o => o.employee_id === employeeId).reduce((s, o) => s + Number(o.calculated_value), 0);
      const totalSat = saturdays.filter(s => s.employee_id === employeeId).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const totalHol = holidays.filter((h: any) => h.employee_id === employeeId).reduce((s: number, h: any) => s + Number(h.calculated_value), 0);
      const totalAdv = advances.filter(a => a.employee_id === employeeId).reduce((s, a) => s + Number(a.amount), 0);
      const totalExp = 0;
      const totalAbs = absences.filter((a: any) => a.employee_id === employeeId).reduce((s: number, a: any) => s + Number(a.calculated_value), 0);
      const netPay = baseSalary + totalOt + totalSat + totalHol - totalAdv - totalExp - totalAbs;
      
      const { error } = await supabase.from("monthly_closings").upsert({ 
        employee_id: employeeId, 
        month_ref: selectedMonth, 
        base_salary: baseSalary, 
        total_advances: totalAdv, 
        total_expenses: totalExp, 
        total_overtime: totalOt, 
        total_saturdays: totalSat, 
        total_holidays: totalHol, 
        total_absences: totalAbs, 
        net_pay: netPay 
      } as any, { onConflict: "employee_id,month_ref" });
      if (error) throw error;

      // Busca o último pagamento ou usa data atual como base
      const { data: lastInst } = await supabase
        .from("salary_installments" as any)
        .select("period_end, expected_date")
        .eq("employee_id", employeeId)
        .order("expected_date", { ascending: false })
        .limit(1);

      const baseDate = (lastInst as any)?.[0]?.expected_date ? parseLocalDate((lastInst as any)[0].expected_date)! : new Date();
      const nextClosingDate = getNextFriday(baseDate);
      const periodStart = (lastInst as any)?.[0]?.period_end || localDateString(baseDate);

      const { data: existingDb } = await supabase
        .from("salary_installments" as any)
        .select("id")
        .eq("employee_id", employeeId)
        .eq("month_ref", selectedMonth)
        .eq("expected_date", nextClosingDate);
      
      if (!existingDb || existingDb.length === 0) {
        const { error: insErr } = await supabase.from("salary_installments" as any).insert({
          employee_id: employeeId,
          month_ref: selectedMonth,
          installment_number: 1, // Número sequencial será ajustado na UI se necessário
          amount: 0,
          status: "pendente",
          period_start: periodStart,
          period_end: nextClosingDate,
          expected_date: nextClosingDate,
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      toast({ title: "Fechamento atualizado!", description: "Próxima quinzena gerada com base na última data de fechamento." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Edit installment value ──
  const editInstMutation = useMutation({
    mutationFn: async ({ id, amount, period_start, period_end, expected_date, month_ref }: { id: string; amount?: number; period_start?: string; period_end?: string; expected_date?: string; month_ref?: string }) => {
      const payload: any = {};
      if (amount !== undefined) payload.amount = amount;
      if (period_start !== undefined) payload.period_start = period_start;
      if (period_end !== undefined) payload.period_end = period_end;
      if (expected_date !== undefined) payload.expected_date = expected_date;
      if (month_ref !== undefined) payload.month_ref = month_ref;
      
      const { error } = await supabase.from("salary_installments" as any).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena atualizada!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteInstMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salary_installments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena removida!" }); },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const addInstMutation = useMutation({
    mutationFn: async ({ employeeId, monthRef, installmentNumber, expectedDate, periodStart, periodEnd }: { employeeId: string; monthRef: string; installmentNumber: number; expectedDate?: string; periodStart?: string | null; periodEnd?: string | null }) => {
      const { error } = await supabase.from("salary_installments" as any).insert({
        employee_id: employeeId,
        month_ref: monthRef,
        installment_number: installmentNumber,
        amount: 0,
        status: "pendente",
        expected_date: expectedDate || localDateString(),
        period_start: periodStart,
        period_end: periodEnd,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena adicionada!" }); },
    onError: (e: any) => toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" }),
  });


  // ── Lançar quinzena em Contas a Pagar (status pendente) ──
  const sendToPayableMutation = useMutation({
    mutationFn: async ({ inst, expectedDate }: { inst: any; expectedDate: string }) => {
      const emp = employees.find(e => e.id === inst.employee_id);
      const empName = emp?.name ?? "Funcionário";
      const desc = `Salário ${empName} — Referência ${monthLabel(inst.month_ref)} — ${inst.installment_number}ª Quinzena`;

      if (inst.payable_transaction_id) {
        // Atualiza data prevista do lançamento existente
        const { error } = await supabase.from("financial_transactions").update({
          due_date: expectedDate,
          amount: Number(inst.amount),
          description: desc,
        }).eq("id", inst.payable_transaction_id);
        if (error) throw error;
      } else {
        const { data: ft, error: ftErr } = await supabase.from("financial_transactions").insert({
          type: "a_pagar" as any,
          description: desc,
          amount: Number(inst.amount),
          due_date: expectedDate,
          status: "pendente" as any,
          category: "Folha de Pagamento",
          sync_origin: "payroll",
        }).select("id").single();
        if (ftErr) throw ftErr;
        const { error: updErr } = await supabase.from("salary_installments" as any).update({
          expected_date: expectedDate,
          payable_transaction_id: ft!.id,
        }).eq("id", inst.id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-saidas"] });
      toast({ title: "Lançado em Contas a Pagar!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Editar quinzena PAGA (valor / data / forma / conta) — sincroniza Financeiro ──
  const editPaidInstallmentMutation = useMutation({
    mutationFn: async ({ inst, amount, payment_date, payment_method, account_id, notes }: {
      inst: any; amount: number; payment_date: string; payment_method: string; account_id: string | null; notes: string | null;
    }) => {
      const emp = employees.find(e => e.id === inst.employee_id);
      const empName = emp?.name ?? "Funcionário";
      const desc = `Salário ${empName} — Referência ${monthLabel(inst.month_ref)} — ${inst.installment_number}ª Quinzena`;

      // Atualiza a transação financeira vinculada (se existir)
      const ftId = inst.financial_transaction_id || inst.payable_transaction_id;
      if (ftId) {
        const { error: ftErr } = await supabase.from("financial_transactions").update({
          amount,
          due_date: payment_date,
          paid_date: payment_date,
          payment_method,
          account_id: account_id || null,
          description: desc,
        }).eq("id", ftId);
        if (ftErr) throw ftErr;
      }

      const { error } = await supabase.from("salary_installments" as any).update({
        amount,
        payment_date,
        payment_method,
        account_id: account_id || null,
        notes,
      }).eq("id", inst.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-saidas"] });
      toast({ title: "Quinzena paga atualizada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Reabrir quinzena (volta para pendente, remove saída do caixa) ──
  const reopenInstallmentMutation = useMutation({
    mutationFn: async (inst: any) => {
      const ftId = inst.financial_transaction_id || inst.payable_transaction_id;
      if (ftId) {
        // Apaga a transação financeira correspondente (saída de caixa)
        const { error: delErr } = await supabase.from("financial_transactions").delete().eq("id", ftId);
        if (delErr) throw delErr;
      }
      const { error } = await supabase.from("salary_installments" as any).update({
        status: "pendente",
        payment_date: null,
        financial_transaction_id: null,
        payable_transaction_id: null,
      }).eq("id", inst.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-saidas"] });
      toast({ title: "Quinzena reaberta — saída financeira removida." });
    },
    onError: (e: any) => toast({ title: "Erro ao reabrir", description: e.message, variant: "destructive" }),
  });

  // ── Editar mês de referência (competência) do fechamento ──
  const editClosingMonthMutation = useMutation({
    mutationFn: async ({ closingId, employeeId, newMonthRef }: { closingId: string; employeeId: string; newMonthRef: string }) => {
      if (!/^\d{4}-\d{2}$/.test(newMonthRef)) throw new Error("Formato inválido (use YYYY-MM)");
      // Atualiza o fechamento
      const { error: cErr } = await supabase.from("monthly_closings").update({ month_ref: newMonthRef }).eq("id", closingId);
      if (cErr) throw cErr;
      // Atualiza as quinzenas do mesmo funcionário/mês
      const { error: iErr } = await supabase.from("salary_installments" as any).update({ month_ref: newMonthRef }).eq("employee_id", employeeId).eq("month_ref", selectedMonth);
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      toast({ title: "Mês de referência alterado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payInstFormInitial = { id: "", amount: "", payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" };
  const [payInstOpen, setPayInstOpen] = useState(false);
  const [payInstForm, setPayInstForm] = useState(payInstFormInitial);
  const [payInstContext, setPayInstContext] = useState<any>(null);

  const [bulkPayInsts, setBulkPayInsts] = useState<any[] | null>(null);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPayForm, setBulkPayForm] = useState({ payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" });

  const payBulkMutation = useMutation({
    mutationFn: async () => {
      if (!bulkPayInsts || bulkPayInsts.length === 0) throw new Error("Nenhuma quinzena selecionada");
      for (const inst of bulkPayInsts) {
        const emp = employees.find(e => e.id === inst.employee_id);
        const empName = emp?.name ?? "Funcionário";
        const desc = `Salário ${empName} — Referência ${monthLabel(inst.month_ref)} — ${inst.installment_number}ª Quinzena`;
        const amount = Number(inst.amount) || 0;
        let ftId = inst.payable_transaction_id;
        if (ftId) {
          await supabase.from("financial_transactions").update({ status: "pago" as any, paid_date: bulkPayForm.payment_date, payment_method: bulkPayForm.payment_method, account_id: bulkPayForm.account_id || null, description: desc }).eq("id", ftId);
        } else {
          const { data: ft } = await supabase.from("financial_transactions").insert({ type: "a_pagar" as any, description: desc, amount, due_date: bulkPayForm.payment_date, paid_date: bulkPayForm.payment_date, status: "pago" as any, category: "Folha de Pagamento", payment_method: bulkPayForm.payment_method, account_id: bulkPayForm.account_id || null, sync_origin: "payroll" }).select("id").single();
          ftId = ft?.id;
        }
        await supabase.from("salary_installments" as any).update({ status: "pago", payment_date: bulkPayForm.payment_date, payment_method: bulkPayForm.payment_method, account_id: bulkPayForm.account_id || null, notes: bulkPayForm.notes || null, financial_transaction_id: ftId, payable_transaction_id: ftId }).eq("id", inst.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      setBulkPayOpen(false); setBulkPayInsts(null);
      toast({ title: "Pagamentos processados!" });
    },
    onError: (e: any) => toast({ title: "Erro ao processar", description: e.message, variant: "destructive" }),
  });

  const payInstallmentMutation = useMutation({
    mutationFn: async () => {
      const inst = payInstContext;
      if (!inst) throw new Error("Quinzena não encontrada");
      const amount = parseFloat(payInstForm.amount);
      if (!amount || amount <= 0) throw new Error("Informe um valor válido");
      const emp = employees.find(e => e.id === inst.employee_id);
      const empName = emp?.name ?? "Funcionário";
      const desc = `Salário ${empName} — Referência ${monthLabel(inst.month_ref)} — ${inst.installment_number}ª Quinzena`;

      let ftId = inst.payable_transaction_id as string | null;
      if (ftId) {
        // Já existia em Contas a Pagar → marca como pago
        const { error } = await supabase.from("financial_transactions").update({
          status: "pago" as any,
          paid_date: payInstForm.payment_date,
          amount,
          payment_method: payInstForm.payment_method,
          account_id: payInstForm.account_id || null,
          description: desc,
        }).eq("id", ftId);
        if (error) throw error;
      } else {
        // Cria direto como pago
        const { data: ft, error: ftErr } = await supabase.from("financial_transactions").insert({
          type: "a_pagar" as any,
          description: desc,
          amount,
          due_date: payInstForm.payment_date,
          paid_date: payInstForm.payment_date,
          status: "pago" as any,
          category: "Folha de Pagamento",
          payment_method: payInstForm.payment_method,
          account_id: payInstForm.account_id || null,
          sync_origin: "payroll",
        }).select("id").single();
        if (ftErr) throw ftErr;
        ftId = ft!.id;
      }

      const { error: updErr } = await supabase.from("salary_installments" as any).update({
        status: "pago",
        amount,
        payment_date: payInstForm.payment_date,
        payment_method: payInstForm.payment_method,
        account_id: payInstForm.account_id || null,
        notes: payInstForm.notes || null,
        financial_transaction_id: ftId,
        payable_transaction_id: ftId,
      }).eq("id", inst.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-saidas"] });
      setPayInstOpen(false);
      setPayInstForm(payInstFormInitial);
      setPayInstContext(null);
      toast({ title: "Quinzena paga e lançada no Financeiro!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Helpers para abrir dialog de pagamento de quinzena
  const openPayInstallment = (inst: any) => {
    setPayInstContext(inst);
    setPayInstForm({
      id: inst.id,
      amount: String(Number(inst.amount) || 0),
      payment_date: localDateString(),
      payment_method: inst.payment_method || "pix",
      account_id: inst.account_id || "",
      notes: inst.notes || "",
    });
    setPayInstOpen(true);
  };

  // Mutation antiga para 13º salário (mantida) — renomeada pra evitar conflito
  const pay13thInstallmentMutation = useMutation({
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

  // ── Edit Employee Salary ──
  const [editEmpOpen, setEditEmpOpen] = useState(false);
  const [editEmpForm, setEditEmpForm] = useState({ id: "", name: "", salary: "", saturday_value: "", overtime_hourly_rate: "" });

  // ── Generic Input Dialog (substitui window.prompt) ──
  type InputDialogField = { key: string; label: string; type: "date" | "month" | "text" | "select"; value: string; options?: { value: string; label: string }[] };
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    description?: string;
    fields: InputDialogField[];
    submitLabel?: string;
    onSubmit: (values: Record<string, string>) => void;
  } | null>(null);
  const [inputDialogValues, setInputDialogValues] = useState<Record<string, string>>({});
  const openInputDialog = (cfg: NonNullable<typeof inputDialog>) => {
    const init: Record<string, string> = {};
    cfg.fields.forEach(f => { init[f.key] = f.value ?? ""; });
    setInputDialogValues(init);
    setInputDialog(cfg);
  };
  const closeInputDialog = () => { setInputDialog(null); setInputDialogValues({}); };

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
  const totalAdvances = useMemo(() => advances.reduce((s, a) => s + Number(a.amount), 0), [advances]);
  const totalExpenses = 0;
  const totalOvertime = useMemo(() => overtime.reduce((s, o) => s + Number(o.calculated_value), 0), [overtime]);
  const totalSaturdays = useMemo(() => saturdays.reduce((s, sat) => s + Number(sat.calculated_value), 0), [saturdays]);
  const totalHolidays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.calculated_value), 0), [holidays]);
  const totalHolidayDays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.day_quantity), 0), [holidays]);
  const totalAbsences = useMemo(() => absences.reduce((s: number, a: any) => s + Number(a.calculated_value), 0), [absences]);
  const totalAbsenceDays = useMemo(() => absences.reduce((s: number, a: any) => s + Number(a.day_quantity), 0), [absences]);
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
      const empHolidays = holidays.filter((h: any) => h.employee_id === emp.id).reduce((s: number, h: any) => s + Number(h.calculated_value), 0);
      const empAbsences = absences.filter((a: any) => a.employee_id === emp.id).reduce((s: number, a: any) => s + Number(a.calculated_value), 0);
      const baseSalary = Number(emp.salary) || 0;
      const closing = closings.find(c => c.employee_id === emp.id);
      const netPay = baseSalary + empOvertime + empSaturdays + empHolidays - empAdvances - empExpenses - empAbsences;
      const totalPaid = installments.filter((i: any) => i.employee_id === emp.id && i.status === "pago").reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
      const remaining = netPay - totalPaid;
      return { ...emp, baseSalary, empAdvances, empExpenses, empOvertime, empSaturdays, empHolidays, empAbsences, netPay, closing, totalPaid, remaining };
    });
  }, [employees, advances, overtime, saturdays, holidays, absences, closings, installments]);

  const totalPayroll = useMemo(() => employeeSummary.reduce((s, e) => s + e.netPay, 0), [employeeSummary]);


  // categories removed — no longer used

  const selectedPayEmployee = payInstContext ? employeeSummary.find(e => e.id === payInstContext.employee_id) : null;

  // Delete button helper
  const DeleteBtn = ({ table, id, label }: { table: string; id: string; label: string }) => {
    if (!canEdit) return null;
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ table, id, label })}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  };

  // Edit button helper — opens the generic edit dialog with the row's current values
  const EditBtn = ({ onClick, title = "Editar" }: { onClick: () => void; title?: string }) => {
    if (!canEdit) return null;
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} title={title}>
        <Pencil className="h-3.5 w-3.5" />
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

      {/* Generic Input Dialog (data/mês/forma) — substitui window.prompt */}
      <Dialog open={!!inputDialog} onOpenChange={(o) => { if (!o) closeInputDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{inputDialog?.title}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inputDialog) return;
              inputDialog.onSubmit(inputDialogValues);
              closeInputDialog();
            }}
            className="space-y-3"
          >
            {inputDialog?.description && <p className="text-sm text-muted-foreground">{inputDialog.description}</p>}
            {inputDialog?.fields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                {f.type === "select" ? (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={inputDialogValues[f.key] ?? ""}
                    onChange={(e) => setInputDialogValues(v => ({ ...v, [f.key]: e.target.value }))}
                    required
                  >
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    type={f.type}
                    value={inputDialogValues[f.key] ?? ""}
                    onChange={(e) => setInputDialogValues(v => ({ ...v, [f.key]: e.target.value }))}
                    required
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="ghost" onClick={closeInputDialog}>Cancelar</Button>
              <Button type="submit">{inputDialog?.submitLabel || "Confirmar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generic edit dialog (used by every table row's "Editar" button) */}
      <Dialog open={!!editCtx} onOpenChange={(o) => { if (!o) { setEditCtx(null); setEditValues({}); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editCtx?.title}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editGenericMutation.mutate(); }} className="space-y-3">
            {editCtx?.fields.map(f => (
              <div key={f.key}>
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                {f.type === "select" ? (
                  <select className={selectClass} value={editValues[f.key] ?? ""} onChange={e => setEditValues({ ...editValues, [f.key]: e.target.value })} required={f.required}>
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    type={f.type}
                    step={f.step}
                    min={f.min}
                    placeholder={f.placeholder}
                    value={editValues[f.key] ?? ""}
                    onChange={e => setEditValues({ ...editValues, [f.key]: e.target.value })}
                    required={f.required}
                  />
                )}
              </div>
            ))}
            <Button type="submit" className="w-full" disabled={editGenericMutation.isPending}>Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />Dashboard</TabsTrigger>
          <TabsTrigger value="salarios"><DollarSign className="h-4 w-4 mr-1 hidden sm:inline" />Salários</TabsTrigger>
          <TabsTrigger value="diarias"><Banknote className="h-4 w-4 mr-1 hidden sm:inline" />Diárias</TabsTrigger>
          <TabsTrigger value="horas"><Clock className="h-4 w-4 mr-1 hidden sm:inline" />Horas Extras</TabsTrigger>
          <TabsTrigger value="sabados"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" />Sábados</TabsTrigger>
          <TabsTrigger value="feriados"><PartyPopper className="h-4 w-4 mr-1 hidden sm:inline" />Feriados</TabsTrigger>
          <TabsTrigger value="faltas"><UserMinus className="h-4 w-4 mr-1 hidden sm:inline" />Faltas</TabsTrigger>
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
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Feriados</CardTitle><PartyPopper className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{fmt(totalHolidays)}</div><p className="text-xs text-muted-foreground">{holidays.length} feriado(s) trabalhado(s)</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Vales/Adiant.</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{fmt(totalAdvances)}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Vales</CardTitle><Banknote className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{fmt(totalAdvances)}</div><p className="text-xs text-muted-foreground">{advances.length} registros</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Faltas do Mês</CardTitle><UserMinus className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{fmt(totalAbsences)}</div><p className="text-xs text-muted-foreground">{totalAbsenceDays} dia(s) — {absences.length} registro(s)</p></CardContent></Card>
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

        {/* ── Salários (Quinzenas) ── */}
        <TabsContent value="salarios" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg">Gestão de Quinzenas</CardTitle>
                <div className="text-sm font-medium text-primary">
                  {(() => {
                    const instsOnDate = installments.filter((i: any) => i.expected_date === viewQuinzenaDate);
                    if (instsOnDate.length === 0) return "Nenhuma quinzena programada para esta data.";
                    const start = instsOnDate[0].period_start ? formatDateBR(instsOnDate[0].period_start) : "?";
                    const end = instsOnDate[0].period_end ? formatDateBR(instsOnDate[0].period_end) : "?";
                    return `Período: ${start} a ${end}`;
                  })()}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                  Fechamento: Sexta-feira {formatDateBR(viewQuinzenaDate)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewQuinzenaDate(getPreviousFriday(viewQuinzenaDate))}>
                  <Calendar className="h-4 w-4 mr-1" /> {"< Anterior"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewQuinzenaDate(getNextFriday(parseLocalDate(viewQuinzenaDate)!))}>
                  {"Próxima >"} <Calendar className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Funcionário</TableHead>
                      <TableHead className="hidden md:table-cell">Cargo</TableHead>
                      <TableHead>Valor para essa quinzena</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const filtered = installments.filter((i: any) => i.expected_date === viewQuinzenaDate);
                      if (filtered.length === 0) return <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma quinzena para esta data. Use o botão + Adicionar ou gere pelo Dashboard.</TableCell></TableRow>;
                      
                      return filtered.map((inst: any) => {
                        const isPaid = inst.status === "pago";
                        const emp = employees.find(e => e.id === inst.employee_id);
                        
                        return (
                          <TableRow key={inst.id} className={isPaid ? "bg-green-500/5" : ""}>
                            <TableCell className="font-medium">{emp?.name || "Funcionário"}</TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">{emp?.role || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 max-w-[150px]">
                                <span className="text-xs font-bold text-muted-foreground">R$</span>
                                <Input
                                  defaultValue={Number(inst.amount) || ""}
                                  className="h-8 font-bold"
                                  placeholder="0,00"
                                  disabled={isPaid || editInstMutation.isPending}
                                  onBlur={(e) => {
                                    const v = parseFloat(e.target.value.replace(",", "."));
                                    if (!isNaN(v) && v !== Number(inst.amount)) {
                                      editInstMutation.mutate({ id: inst.id, amount: v });
                                    }
                                  }}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              {isPaid ? <Badge variant="default">PAGO</Badge> : <Badge variant="outline">PENDENTE</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {!isPaid && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => openPayInstallment(inst)}>
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                  openInputDialog({
                                    title: `Editar Quinzena — ${emp?.name}`,
                                    fields: [
                                      { key: "start", label: "Início Período", type: "date", value: inst.period_start || "" },
                                      { key: "end", label: "Fim Período", type: "date", value: inst.period_end || "" },
                                      { key: "pay", label: "Data Fechamento", type: "date", value: inst.expected_date || "" },
                                    ],
                                    onSubmit: (vals) => editInstMutation.mutate({ id: inst.id, period_start: vals.start, period_end: vals.end, expected_date: vals.pay })
                                  });
                                }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="text-lg font-bold flex items-center gap-2">
                  <span className="text-muted-foreground text-sm uppercase">Total da Quinzena:</span>
                  {fmt(installments.filter((i: any) => i.expected_date === viewQuinzenaDate).reduce((s, i) => s + (Number(i.amount) || 0), 0))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    openInputDialog({
                      title: "Adicionar Funcionário nesta Quinzena",
                      description: "Escolha o funcionário para adicionar à data " + formatDateBR(viewQuinzenaDate),
                      fields: [
                        { key: "emp_id", label: "Funcionário", type: "select", value: "", options: employees.map(e => ({ value: e.id, label: e.name })) }
                      ],
                      onSubmit: (vals) => {
                        const instsOnDate = installments.filter((i: any) => i.expected_date === viewQuinzenaDate);
                        const pStart = instsOnDate.length > 0 ? instsOnDate[0].period_start : null;
                        const pEnd = instsOnDate.length > 0 ? instsOnDate[0].period_end : null;
                        
                        addInstMutation.mutate({ 
                          employeeId: vals.emp_id, 
                          monthRef: selectedMonth, 
                          installmentNumber: 1,
                          expectedDate: viewQuinzenaDate,
                          periodStart: pStart,
                          periodEnd: pEnd
                        } as any);
                      }
                    });
                  }}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar Funcionário
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                    const toPay = installments.filter((i: any) => i.expected_date === viewQuinzenaDate && i.status !== "pago");
                    if (toPay.length === 0) {
                      toast({ title: "Nada para pagar", description: "Todas as quinzenas desta data já estão pagas ou não existem." });
                      return;
                    }
                    if (window.confirm(`Deseja confirmar o pagamento de ${toPay.length} funcionários nesta quinzena?`)) {
                      // Implementation of bulk pay could be added here or just individual
                      toPay.forEach(inst => openPayInstallment(inst));
                    }
                  }}>
                    <CheckCircle className="h-4 w-4 mr-2" /> Confirmar Pagamento
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Resumo Mensal do Mês — {monthLabel(selectedMonth)}
                <Badge variant="outline">{selectedMonth}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Salário Base</TableHead>
                    <TableHead>Acréscimos</TableHead>
                    <TableHead>Descontos</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeSummary.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{fmt(e.baseSalary)}</TableCell>
                      <TableCell className="text-primary">{fmt(e.empOvertime + e.empSaturdays + e.empHolidays)}</TableCell>
                      <TableCell className="text-destructive">{fmt(e.empAdvances + e.empAbsences)}</TableCell>
                      <TableCell className="font-bold">{fmt(e.netPay)}</TableCell>
                      <TableCell className="text-green-600">{fmt(e.totalPaid)}</TableCell>
                      <TableCell className="font-bold text-amber-600">{fmt(e.remaining)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>


          <Card>
            <CardHeader><CardTitle className="text-base">Adiantamentos/Vales do Mês — {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{(a.employees as any)?.name}</TableCell>
                      <TableCell><Badge variant={a.type === "vale" ? "destructive" : "secondary"}>{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell>
                      <TableCell>{fmt(Number(a.amount))}</TableCell>
                      <TableCell>{formatDateBR(a.date)}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <EditBtn onClick={() => openEdit({ table: 'employee_advances', id: a.id, title: 'Editar Vale/Adiantamento', invalidate: ['employee-advances'], fields: [{ key: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', value: String(Number(a.amount)||0), required: true }, { key: 'type', label: 'Tipo', type: 'select', value: a.type, options: [{value:'adiantamento',label:'Adiantamento'},{value:'vale',label:'Vale'}] }, { key: 'date', label: 'Data', type: 'date', value: a.date }, { key: 'description', label: 'Descrição', type: 'text', value: a.description || '' }, { key: 'month_ref', label: 'Mês de Referência (YYYY-MM)', type: 'text', value: a.month_ref, placeholder: 'AAAA-MM', required: true }], transform: (v) => ({ amount: parseFloat(v.amount)||0, type: v.type, date: v.date, description: v.description||null, month_ref: v.month_ref }) })} />
                            <DeleteBtn table="employee_advances" id={a.id} label={`${a.type} de ${(a.employees as any)?.name}`} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {advances.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum vale ou adiantamento registrado.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Diárias ── */}
        <TabsContent value="diarias" className="space-y-4">
          <DailyRatesTab employees={employees} canEdit={canEdit} />
        </TabsContent>

        {/* ── Horas Extras ── */}
        <TabsContent value="horas" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={otOpen} onOpenChange={setOtOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Hora Extra</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Registrar Hora Extra</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); otMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label><select className={selectClass} value={otForm.employee_id} onChange={e => setOtForm({ ...otForm, employee_id: e.target.value })} required><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                    <div><Label>Horas *</Label><Input type="number" step="0.5" min="0.5" value={otForm.hours} onChange={e => setOtForm({ ...otForm, hours: e.target.value })} required /></div>
                    {otForm.employee_id && (() => {
                      const emp = employees.find(e => e.id === otForm.employee_id);
                      const fixedRate = Number(emp?.overtime_hourly_rate) || 0;
                      if (fixedRate <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o valor hora extra de {emp?.name} antes de registrar.</div>;
                      }
                      const hrs = parseFloat(otForm.hours) || 0;
                      return (
                        <div className="p-3 rounded-md bg-muted text-sm">
                          <p>Valor hora cadastrado: <strong>{fmt(fixedRate)}</strong></p>
                          {hrs > 0 && <p className="font-bold mt-1">Total ({hrs}h): {fmt(fixedRate * hrs)}</p>}
                        </div>
                      );
                    })()}
                    <div><Label>Descrição</Label><Input value={otForm.description} onChange={e => setOtForm({ ...otForm, description: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={otForm.date} onChange={e => setOtForm({ ...otForm, date: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={otMutation.isPending}>Salvar</Button>
                  </form></DialogContent></Dialog>
            </div>
          )}
          <Card><CardHeader><CardTitle className="text-base">Horas Extras - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Horas</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{overtime.map(o => (<TableRow key={o.id}><TableCell className="font-medium">{(o.employees as any)?.name}</TableCell><TableCell>{o.hours}h</TableCell><TableCell>{fmt(Number(o.calculated_value))}</TableCell><TableCell>{formatDateBR(o.date)}</TableCell>{canEdit && <TableCell><EditBtn onClick={() => { const emp = employees.find(e => e.id === o.employee_id); const fixedRate = Number(emp?.overtime_hourly_rate) || 0; openEdit({ table: 'employee_overtime', id: o.id, title: 'Editar Hora Extra', invalidate: ['employee-overtime'], fields: [{ key: 'hours', label: 'Horas', type: 'number', step: '0.5', value: String(Number(o.hours)||0), required: true }, { key: 'date', label: 'Data', type: 'date', value: o.date }, { key: 'description', label: 'Descrição', type: 'text', value: o.description || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: o.month_ref, required: true }], transform: (v) => { const hrs = parseFloat(v.hours)||0; return { hours: hrs, percentage: 0, calculated_value: Math.round(fixedRate*hrs*100)/100, date: v.date, description: v.description||null, month_ref: v.month_ref }; } }); }} /><DeleteBtn table="employee_overtime" id={o.id} label={`H.Extra de ${(o.employees as any)?.name}`} /></TableCell>}</TableRow>))}{overtime.length === 0 && <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">Nenhuma hora extra.</TableCell></TableRow>}</TableBody></Table>{overtime.length > 0 && <div className="mt-4 text-right font-bold">Total: {fmt(totalOvertime)} ({overtime.reduce((s, o) => s + Number(o.hours), 0)}h)</div>}</CardContent></Card>
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
          <Card><CardHeader><CardTitle className="text-base">Sábados - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Qtd Sábados</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{saturdays.map(s => (<TableRow key={s.id}><TableCell className="font-medium">{(s.employees as any)?.name}</TableCell><TableCell>{s.hours}</TableCell><TableCell>{fmt(Number(s.calculated_value))}</TableCell><TableCell>{formatDateBR(s.date)}</TableCell>{canEdit && <TableCell><EditBtn onClick={() => { const emp = employees.find(e => e.id === s.employee_id); const satValue = Number(emp?.saturday_value) || 0; openEdit({ table: 'employee_saturdays', id: s.id, title: 'Editar Sábado', invalidate: ['employee-saturdays'], fields: [{ key: 'hours', label: 'Quantidade de Sábados', type: 'number', step: '0.5', value: String(Number(s.hours)||0), required: true }, { key: 'date', label: 'Data', type: 'date', value: s.date }, { key: 'description', label: 'Descrição', type: 'text', value: s.description || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: s.month_ref, required: true }], transform: (v) => { const days = parseFloat(v.hours)||0; return { hours: days, calculated_value: Math.round(satValue*days*100)/100, date: v.date, description: v.description||null, month_ref: v.month_ref }; } }); }} /><DeleteBtn table="employee_saturdays" id={s.id} label={`Sábado de ${(s.employees as any)?.name}`} /></TableCell>}</TableRow>))}{saturdays.length === 0 && <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">Nenhum sábado.</TableCell></TableRow>}</TableBody></Table>{saturdays.length > 0 && <div className="mt-4 text-right font-bold">Total: {fmt(totalSaturdays)} ({saturdays.reduce((s, sat) => s + Number(sat.hours), 0)} sábados)</div>}</CardContent></Card>
        </TabsContent>

        {/* ── Feriados ── */}
        <TabsContent value="feriados" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={holOpen} onOpenChange={setHolOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Feriado</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Feriado Trabalhado (pagamento em dobro)</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); holMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label>
                      <select className={selectClass} value={holForm.employee_id} onChange={e => setHolForm({ ...holForm, employee_id: e.target.value })} required>
                        <option value="">Selecione</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Data do Feriado *</Label><Input type="date" value={holForm.date} onChange={e => setHolForm({ ...holForm, date: e.target.value })} required /></div>
                      <div><Label>Nome do Feriado *</Label><Input value={holForm.holiday_name} onChange={e => setHolForm({ ...holForm, holiday_name: e.target.value })} placeholder="Ex: Tiradentes, Natal" required /></div>
                    </div>
                    {holForm.employee_id && (() => {
                      const emp = employees.find(e => e.id === holForm.employee_id);
                      const dailyRate = Number(emp?.daily_rate) || 0;
                      if (dailyRate <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o valor da diária de {emp?.name} na aba "Diárias" antes de registrar.</div>;
                      }
                      return (
                        <div className="p-3 rounded-md bg-muted text-sm">
                          <p>Valor diária cadastrado: <strong>{fmt(dailyRate)}</strong></p>
                          <p className="font-bold mt-1">Cada feriado adiciona +1 diária ao salário: {fmt(dailyRate)}</p>
                        </div>
                      );
                    })()}
                    <div><Label>Descrição</Label><Input value={holForm.description} onChange={e => setHolForm({ ...holForm, description: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={holMutation.isPending}>Salvar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Feriados Trabalhados — {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Feriado</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Diária</TableHead>
                    <TableHead>Valor (+1 diária)</TableHead>
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.employees?.name}</TableCell>
                      <TableCell>{h.holiday_name}</TableCell>
                      <TableCell>{formatDateBR(h.date)}</TableCell>
                      <TableCell>{fmt(Number(h.daily_rate))}</TableCell>
                      <TableCell className="font-bold text-primary">{fmt(Number(h.calculated_value))}</TableCell>
                      {canEdit && <TableCell><EditBtn onClick={() => { const emp = employees.find(e => e.id === h.employee_id); const dailyRate = Number(emp?.daily_rate) || 0; openEdit({ table: 'employee_holidays', id: h.id, title: 'Editar Feriado', invalidate: ['employee-holidays'], fields: [{ key: 'holiday_name', label: 'Nome do Feriado', type: 'text', value: h.holiday_name, required: true }, { key: 'date', label: 'Data', type: 'date', value: h.date, required: true }, { key: 'description', label: 'Descrição', type: 'text', value: h.description || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: h.month_ref, required: true }], transform: (v) => ({ holiday_name: v.holiday_name, date: v.date, description: v.description||null, month_ref: v.month_ref, daily_rate: dailyRate, calculated_value: dailyRate }) }); }} /><DeleteBtn table="employee_holidays" id={h.id} label={`Feriado ${h.holiday_name} de ${h.employees?.name}`} /></TableCell>}
                    </TableRow>
                  ))}
                  {holidays.length === 0 && (
                    <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum feriado trabalhado neste mês.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {holidays.length > 0 && (
                <div className="mt-4 text-right font-bold">Total: {fmt(totalHolidays)} ({holidays.length} feriado{holidays.length !== 1 ? "s" : ""})</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vales ── */}
        {/* ── Faltas ── */}
        <TabsContent value="faltas" className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={absOpen} onOpenChange={setAbsOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Registrar Falta</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Registrar Falta</DialogTitle></DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); absMutation.mutate(); }} className="space-y-3">
                    <div><Label>Funcionário *</Label>
                      <select className={selectClass} value={absForm.employee_id} onChange={e => setAbsForm({ ...absForm, employee_id: e.target.value })} required>
                        <option value="">Selecione</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Data da Falta *</Label><Input type="date" value={absForm.date} onChange={e => setAbsForm({ ...absForm, date: e.target.value })} required /></div>
                      <div><Label>Quantidade *</Label><Input type="number" step="0.5" min="0.5" value={absForm.day_quantity} onChange={e => setAbsForm({ ...absForm, day_quantity: e.target.value })} required placeholder="0.5, 1, 1.5, 2…" /></div>
                    </div>
                    <div><Label>Motivo (opcional)</Label><Input value={absForm.reason} onChange={e => setAbsForm({ ...absForm, reason: e.target.value })} placeholder="Ex: Atestado, falta injustificada" /></div>
                    {absForm.employee_id && (() => {
                      const emp = employees.find(e => e.id === absForm.employee_id);
                      const salary = Number(emp?.salary) || 0;
                      if (salary <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o salário base de {emp?.name} antes de registrar.</div>;
                      }
                      const dailyRate = salary / 20;
                      const days = parseFloat(absForm.day_quantity) || 0;
                      return (
                        <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                          <p>Salário base: <strong>{fmt(salary)}</strong></p>
                          <p>Valor diária (salário ÷ 20): <strong>{fmt(dailyRate)}</strong></p>
                          {days > 0 && <p className="font-bold mt-1 text-destructive">Desconto ({days} dia{days !== 1 ? "s" : ""}): {fmt(dailyRate * days)}</p>}
                        </div>
                      );
                    })()}
                    <Button type="submit" className="w-full" disabled={absMutation.isPending}>Salvar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Faltas - {monthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Diária</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Motivo</TableHead>
                    {canEdit && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absences.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.employees?.name}</TableCell>
                      <TableCell>{formatDateBR(a.date)}</TableCell>
                      <TableCell>{Number(a.day_quantity)} dia{Number(a.day_quantity) !== 1 ? "s" : ""}</TableCell>
                      <TableCell>{fmt(Number(a.daily_rate))}</TableCell>
                      <TableCell className="font-bold text-destructive">{fmt(Number(a.calculated_value))}</TableCell>
                      <TableCell>{a.reason || "-"}</TableCell>
                      {canEdit && <TableCell>
                        <EditBtn onClick={() => {
                          const emp = employees.find(e => e.id === a.employee_id);
                          const salary = Number(emp?.salary) || 0;
                          const dailyRate = salary / 20;
                          openEdit({
                            table: 'employee_absences',
                            id: a.id,
                            title: 'Editar Falta',
                            invalidate: ['employee-absences'],
                            fields: [
                              { key: 'date', label: 'Data', type: 'date', value: a.date, required: true },
                              { key: 'day_quantity', label: 'Quantidade (dias)', type: 'number', step: '0.5', value: String(Number(a.day_quantity)||0), required: true },
                              { key: 'reason', label: 'Motivo', type: 'text', value: a.reason || '' },
                              { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: a.month_ref, required: true },
                            ],
                            transform: (v) => {
                              const days = parseFloat(v.day_quantity) || 0;
                              return {
                                date: v.date,
                                day_quantity: days,
                                reason: v.reason || null,
                                month_ref: v.month_ref,
                                daily_rate: Math.round(dailyRate * 100) / 100,
                                calculated_value: Math.round(dailyRate * days * 100) / 100,
                              };
                            },
                          });
                        }} />
                        <DeleteBtn table="employee_absences" id={a.id} label={`Falta de ${a.employees?.name}`} />
                      </TableCell>}
                    </TableRow>
                  ))}
                  {absences.length === 0 && (
                    <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-8">Nenhuma falta registrada neste mês.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {absences.length > 0 && (
                <div className="mt-4 text-right font-bold text-destructive">Total descontado: {fmt(totalAbsences)} ({totalAbsenceDays} dia{totalAbsenceDays !== 1 ? "s" : ""})</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
          <Card><CardHeader><CardTitle className="text-base">Vales - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{advances.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{(a.employees as any)?.name}</TableCell><TableCell><Badge variant="outline">{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell><TableCell>{fmt(Number(a.amount))}</TableCell><TableCell>{formatDateBR(a.date)}</TableCell><TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>{canEdit && <TableCell><EditBtn onClick={() => openEdit({ table: 'employee_advances', id: a.id, title: 'Editar Vale/Adiantamento', invalidate: ['employee-advances'], fields: [{ key: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', value: String(Number(a.amount)||0), required: true }, { key: 'type', label: 'Tipo', type: 'select', value: a.type, options: [{value:'adiantamento',label:'Adiantamento'},{value:'vale',label:'Vale'}] }, { key: 'date', label: 'Data', type: 'date', value: a.date }, { key: 'description', label: 'Descrição', type: 'text', value: a.description || '' }, { key: 'month_ref', label: 'Mês de Referência (YYYY-MM)', type: 'text', value: a.month_ref, placeholder: 'AAAA-MM', required: true }], transform: (v) => ({ amount: parseFloat(v.amount)||0, type: v.type, date: v.date, description: v.description||null, month_ref: v.month_ref }) })} /><DeleteBtn table="employee_advances" id={a.id} label={`Vale de ${(a.employees as any)?.name}`} /></TableCell>}</TableRow>))}{advances.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum vale registrado.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
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
                    <div><Label>Valor das Férias (R$)</Label><Input type="number" step="0.01" min="0" value={vacForm.vacation_value} onChange={e => setVacForm({ ...vacForm, vacation_value: e.target.value })} placeholder="Deixe em branco para calcular automaticamente" /><p className="text-xs text-muted-foreground mt-1">Se preenchido, sobrescreve o cálculo automático (salário/30 × dias).</p></div>
                    {vacForm.employee_id && vacForm.days && (() => { const emp = employees.find(e => e.id === vacForm.employee_id); const salary = Number(emp?.salary) || 0; const days = parseInt(vacForm.days) || 0; const manualVal = parseFloat(vacForm.vacation_value); const vacValue = !isNaN(manualVal) && manualVal > 0 ? manualVal : (salary / 30) * days; const third = vacValue / 3; const isManual = !isNaN(manualVal) && manualVal > 0; return (<div className="p-3 rounded-md bg-muted text-sm space-y-1"><p>Salário/dia: {fmt(salary / 30)}</p><p>Valor férias ({days}d){isManual ? " — manual" : " — automático"}: {fmt(vacValue)}</p><p>1/3 constitucional: {fmt(third)}</p><p className="font-bold">Total: {fmt(vacValue + third)}</p></div>); })()}
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
                      {canEdit && <TableCell><EditBtn onClick={() => openEdit({ table: 'employee_vacations', id: v.id, title: 'Editar Férias', invalidate: ['employee-vacations'], fields: [{ key: 'start_date', label: 'Início', type: 'date', value: v.start_date, required: true }, { key: 'end_date', label: 'Fim', type: 'date', value: v.end_date, required: true }, { key: 'days', label: 'Dias', type: 'number', value: String(v.days), required: true }, { key: 'vacation_value', label: 'Valor das Férias (R$)', type: 'number', step: '0.01', value: String(Number(v.vacation_value)||0) }, { key: 'notes', label: 'Observações', type: 'text', value: v.notes || '' }], transform: (val) => { const vac = parseFloat(val.vacation_value)||0; const third = vac/3; return { start_date: val.start_date, end_date: val.end_date, days: parseInt(val.days)||0, vacation_value: Math.round(vac*100)/100, constitutional_third: Math.round(third*100)/100, total_value: Math.round((vac+third)*100)/100, notes: val.notes||null }; } })} /><DeleteBtn table="employee_vacations" id={v.id} label={`Férias de ${(v.employees as any)?.name}`} /></TableCell>}
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
                            {canEdit && t && !t.first_installment_paid && <Button size="sm" variant="outline" onClick={() => pay13thInstallmentMutation.mutate({ id: t.id, installment: 1 })} disabled={pay13thInstallmentMutation.isPending}>Pagar 1ª</Button>}
                            {canEdit && t && t.first_installment_paid && !t.second_installment_paid && <Button size="sm" onClick={() => pay13thInstallmentMutation.mutate({ id: t.id, installment: 2 })} disabled={pay13thInstallmentMutation.isPending}>Pagar 2ª</Button>}
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

        {/* ── Fechamento (com quinzenas) ── */}
        <TabsContent value="fechamento" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Fechamento de Quinzenas</CardTitle>
                <p className="text-xs text-muted-foreground">Ciclos dinâmicos de 15 dias com fechamento na sexta-feira.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedMonth(prev => {
                  const [y, m] = prev.split("-").map(Number);
                  const d = new Date(y, m - 2, 1);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                })}>
                  Anterior
                </Button>
                <Badge variant="secondary" className="px-3 py-1">
                  {monthLabel(selectedMonth)}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setSelectedMonth(prev => {
                  const [y, m] = prev.split("-").map(Number);
                  const d = new Date(y, m, 1);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                })}>
                  Próxima
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto space-y-4">
              {employeeSummary.map(e => {
                const empInsts = installments.filter((i: any) => i.employee_id === e.id).sort((a: any, b: any) => (a.expected_date || "").localeCompare(b.expected_date || ""));
                const nextInstDate = empInsts.length > 0 ? (empInsts[empInsts.length - 1].expected_date || getNextFriday(new Date())) : getNextFriday(new Date());
                
                const paidCount = empInsts.filter((i: any) => i.status === "pago").length;
                const generalStatus = !e.closing
                  ? <Badge variant="outline">Pendente</Badge>
                  : paidCount === empInsts.length && empInsts.length > 0
                  ? <Badge variant="default">Quitado</Badge>
                  : paidCount > 0
                  ? <Badge variant="secondary">Parcial</Badge>
                  : <Badge variant="outline">Em aberto</Badge>;

                return (
                  <Card key={e.id} className="border-l-4 border-l-primary/40">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="font-bold text-lg">{e.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground font-semibold">Líquido total estimado: <span className="font-bold text-foreground">{fmt(e.netPay)}</span></p>
                            <p className="text-[10px] text-primary font-bold">Próximo fechamento: {formatDateBR(nextInstDate)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {generalStatus}
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending}>
                              <Plus className="h-3 w-3 mr-1" /> Gerar Próxima
                            </Button>
                          )}
                          {canEdit && e.closing && (
                            <Button size="sm" variant="ghost" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending} title="Recalcular salário base + acréscimos">
                              Recalcular Salário
                            </Button>
                          )}
                          {canEdit && e.closing && (
                            <Button size="sm" variant="ghost" title="Editar mês de competência" onClick={() => {
                              const closing = e.closing!;
                              openInputDialog({
                                title: "Alterar mês de competência",
                                description: "Selecione qualquer dia do mês desejado. O mês de referência (competência) será atualizado.",
                                fields: [{ key: "date", label: "Dia / Mês / Ano", type: "date", value: `${selectedMonth}-01` }],
                                submitLabel: "Salvar",
                                onSubmit: (vals) => {
                                  const d = vals.date;
                                  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                                    toast({ title: "Data inválida", variant: "destructive" });
                                    return;
                                  }
                                  const newMonthRef = d.slice(0, 7);
                                  editClosingMonthMutation.mutate({ closingId: closing.id, employeeId: e.id, newMonthRef });
                                },
                              });
                            }}>
                              <Calendar className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && e.closing && <DeleteBtn table="monthly_closings" id={e.closing.id} label={`Fechamento de ${e.name}`} />}
                        </div>
                      </div>

                      {e.closing && (
                        <div className="space-y-3">
                          {(() => {
                            const totalInsts = empInsts.reduce((sum: number, inst: any) => sum + (Number(inst.amount) || 0), 0);
                            const isSumCorrect = Math.abs(totalInsts - e.netPay) < 0.05;
                            
                            const overlaps: string[] = [];
                            const sortedInsts = [...empInsts].filter(i => i.period_start && i.period_end).sort((a, b) => a.period_start.localeCompare(b.period_start));
                            for (let i = 0; i < sortedInsts.length - 1; i++) {
                              if (sortedInsts[i].period_end > sortedInsts[i+1].period_start) {
                                overlaps.push(`${sortedInsts[i].installment_number}ª e ${sortedInsts[i+1].installment_number}ª`);
                              }
                            }

                            return (
                              <div className="space-y-2">
                                {/* Sem alertas rígidos de soma ou sobreposição para permitir flexibilidade total */}
                              </div>
                            );
                          })()}
                          
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {empInsts.map((inst) => {
                              const isPaid = inst.status === "pago";
                              const payMonth = inst.expected_date ? inst.expected_date.slice(0, 7) : "";
                              const isDiffMonth = payMonth && payMonth !== inst.month_ref;

                              return (
                                <div key={inst.id} className={`p-3 rounded-md border space-y-2 relative group ${isPaid ? "bg-green-500/5 border-green-500/30" : "bg-muted/30"}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="space-y-0.5 text-left">
                                      <p className="font-bold text-sm">Quinzena ({formatDateBR(inst.expected_date)})</p>
                                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                        Período: {inst.period_start ? formatDateBR(inst.period_start) : "?"} a {inst.period_end ? formatDateBR(inst.period_end) : "?"}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground font-semibold">
                                        Fechamento: <span className={isDiffMonth ? "text-amber-600" : ""}>{inst.expected_date ? formatDateBR(inst.expected_date) : "?"}</span>
                                      </p>
                                      <Badge variant="outline" className="text-[9px] h-3.5 px-1">Ref: {monthLabel(inst.month_ref)}</Badge>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      {isPaid ? <Badge variant="default" className="text-[10px]">Paga</Badge> : <Badge variant="outline" className="text-[10px]">Pendente</Badge>}
                                      
                                      <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                                          openInputDialog({
                                            title: `Editar ${inst.installment_number}ª Quinzena`,
                                            fields: [
                                              { key: "num", label: "Número", type: "text", value: String(inst.installment_number) },
                                              { key: "start", label: "Início Período", type: "date", value: inst.period_start || "" },
                                              { key: "end", label: "Fim Período", type: "date", value: inst.period_end || "" },
                                              { key: "pay", label: "Data Pagamento", type: "date", value: inst.expected_date || "" },
                                              { key: "ref", label: "Mês Referência", type: "month", value: inst.month_ref },
                                            ],
                                            onSubmit: (vals) => {
                                              editInstMutation.mutate({
                                                id: inst.id,
                                                installment_number: parseInt(vals.num),
                                                period_start: vals.start,
                                                period_end: vals.end,
                                                expected_date: vals.pay,
                                                month_ref: vals.ref
                                              } as any);
                                            }
                                          });
                                        }}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => {
                                          if (window.confirm("Deseja remover esta quinzena?")) {
                                            deleteInstMutation.mutate(inst.id);
                                          }
                                        }}>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  <form
                                    className="grid gap-1.5"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const form = event.currentTarget;
                                      const raw = new FormData(form).get("amount")?.toString() ?? "";
                                      const v = parseFloat(raw.replace(",", "."));
                                      if (isNaN(v) || v < 0) {
                                        toast({ title: "Valor inválido", variant: "destructive" });
                                        return;
                                      }
                                      if (isPaid) {
                                        editPaidInstallmentMutation.mutate({
                                          inst,
                                          amount: v,
                                          payment_date: inst.payment_date,
                                          payment_method: inst.payment_method || "pix",
                                          account_id: inst.account_id || null,
                                          notes: inst.notes || null,
                                        });
                                      } else {
                                        editInstMutation.mutate({ id: inst.id, amount: v });
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">R$</span>
                                        <Input
                                          name="amount"
                                          defaultValue={Number(inst.amount) || ""}
                                          className="h-8 pl-7 text-sm font-bold"
                                          placeholder="0,00"
                                          disabled={editInstMutation.isPending || editPaidInstallmentMutation.isPending}
                                        />
                                      </div>
                                      <Button size="sm" type="submit" className="h-8 px-2" disabled={editInstMutation.isPending || editPaidInstallmentMutation.isPending}>
                                        <DollarSign className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </form>
                                  
                                  <div className="flex gap-1">
                                    {isPaid ? (
                                      <>
                                        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => openPayInstallment(inst)}>
                                          Editar Pagto
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-amber-600" onClick={() => { if(window.confirm("Reabrir quinzena? A saída financeira será excluída.")) reopenInstallmentMutation.mutate(inst); }}>
                                          Reabrir
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => {
                                          openInputDialog({
                                            title: "Confirmar data prevista",
                                            fields: [{ key: "date", label: "Data prevista", type: "date", value: inst.expected_date || localDateString() }],
                                            onSubmit: (vals) => sendToPayableMutation.mutate({ inst, expectedDate: vals.date })
                                          });
                                        }}>
                                          {inst.payable_transaction_id ? "Atualizar Pagar" : "Lançar em Contas a Pagar"}
                                        </Button>
                                        <Button variant="default" size="sm" className="h-7 text-[10px] flex-1" onClick={() => openPayInstallment(inst)}>
                                          Pagar Agora
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            
                            {canEdit && (
                              <Button 
                                variant="outline" 
                                className="h-auto py-6 border-dashed border-2 flex flex-col gap-2 items-center justify-center text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  const nextNum = empInsts.length > 0 ? Math.max(...empInsts.map((i: any) => i.installment_number)) + 1 : 1;
                                  addInstMutation.mutate({ employeeId: e.id, monthRef: selectedMonth, installmentNumber: nextNum });
                                }}
                              >
                                <Plus className="h-5 w-5" />
                                <span className="text-xs font-medium">Adicionar Quinzena</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {employeeSummary.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum funcionário.</p>}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default HR;
