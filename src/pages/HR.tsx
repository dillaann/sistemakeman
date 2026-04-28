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
  // Quinzenas (regime de competência por month_ref)
  const { data: installments = [] } = useQuery({
    queryKey: ["salary-installments", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from("salary_installments" as any)
        .select("*, employees(name)")
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

  // ── Holiday (feriado trabalhado: cada feriado adiciona 1 diária) ──
  const [holOpen, setHolOpen] = useState(false);
  const [holForm, setHolForm] = useState({ employee_id: "", holiday_name: "", description: "", date: localDateString() });
  const holMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === holForm.employee_id);
      if (!emp) throw new Error("Selecione um funcionário");
      const dailyRate = Number(emp.saturday_value) || 0;
      if (dailyRate <= 0) throw new Error(`Cadastre o valor da diária (sábado) de ${emp.name} antes de registrar`);
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

  // ── Closing (gera fechamento + 2 quinzenas 50/50 se ainda não existirem) ──
  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error("Funcionário não encontrado");
      const baseSalary = Number(emp.salary) || 0;
      const totalAdv = advances.filter(a => a.employee_id === employeeId).reduce((s, a) => s + Number(a.amount), 0);
      const totalExp = 0;
      const totalOt = overtime.filter(o => o.employee_id === employeeId).reduce((s, o) => s + Number(o.calculated_value), 0);
      const totalSat = saturdays.filter(s => s.employee_id === employeeId).reduce((s, sat) => s + Number(sat.calculated_value), 0);
      const totalHol = holidays.filter((h: any) => h.employee_id === employeeId).reduce((s: number, h: any) => s + Number(h.calculated_value), 0);
      const netPay = baseSalary + totalOt + totalSat + totalHol - totalAdv - totalExp;
      const { error } = await supabase.from("monthly_closings").upsert({ employee_id: employeeId, month_ref: selectedMonth, base_salary: baseSalary, total_advances: totalAdv, total_expenses: totalExp, total_overtime: totalOt, total_saturdays: totalSat, total_holidays: totalHol, net_pay: netPay } as any, { onConflict: "employee_id,month_ref" });
      if (error) throw error;

      // Cria quinzenas vazias (valor 0) se ainda não existem — admin preenche manualmente.
      // Busca direto no DB para evitar cache desatualizado.
      const { data: existingDb } = await supabase
        .from("salary_installments" as any)
        .select("installment_number")
        .eq("employee_id", employeeId)
        .eq("month_ref", selectedMonth);
      const existingNums = new Set((existingDb || []).map((i: any) => i.installment_number));
      const toInsert = [1, 2].filter(n => !existingNums.has(n)).map(num => ({
        employee_id: employeeId,
        month_ref: selectedMonth,
        installment_number: num,
        amount: 0,
        status: "pendente",
      }));
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("salary_installments" as any).insert(toInsert);
        if (insErr && !insErr.message?.includes("duplicate")) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      toast({ title: "Fechamento gerado!", description: "Preencha o valor de cada quinzena manualmente." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Edit installment value ──
  const editInstMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.from("salary_installments" as any).update({ amount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Valor atualizado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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

  // ── Reabrir quinzena (volta para pendente, remove sa\u00edda do caixa) ──
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

  // ── Editar mês de referência (compet\u00eancia) do fechamento ──
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
  const totalHolidays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.calculated_value), 0), [holidays]);
  const totalHolidayDays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.day_quantity), 0), [holidays]);
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
      const baseSalary = Number(emp.salary) || 0;
      const closing = closings.find(c => c.employee_id === emp.id);
      const netPay = baseSalary + empOvertime + empSaturdays + empHolidays - empAdvances - empExpenses;
      const totalPaid = salaryPayments.filter((p: any) => p.employee_id === emp.id).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const remaining = netPay - totalPaid;
      return { ...emp, baseSalary, empAdvances, empExpenses, empOvertime, empSaturdays, empHolidays, netPay, closing, totalPaid, remaining };
    });
  }, [employees, advances, overtime, saturdays, holidays, closings, salaryPayments]);


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
          <TabsTrigger value="horas"><Clock className="h-4 w-4 mr-1 hidden sm:inline" />Horas Extras</TabsTrigger>
          <TabsTrigger value="sabados"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" />Sábados</TabsTrigger>
          <TabsTrigger value="feriados"><PartyPopper className="h-4 w-4 mr-1 hidden sm:inline" />Feriados</TabsTrigger>
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
              <Dialog open={payInstOpen} onOpenChange={(o) => { setPayInstOpen(o); if (!o) setPayInstContext(null); }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      Pagar {payInstContext?.installment_number === 1 ? "1ª" : "2ª"} Quinzena — {selectedPayEmployee?.name}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={e => { e.preventDefault(); payInstallmentMutation.mutate(); }} className="space-y-3">
                    {selectedPayEmployee && payInstContext && (
                      <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                        <p>Mês de Referência: <span className="font-bold">{monthLabel(payInstContext.month_ref)}</span></p>
                        <p>Líquido total do mês: <span className="font-bold">{fmt(selectedPayEmployee.netPay)}</span></p>
                        <p className="text-xs text-muted-foreground">A data real do pagamento pode ser em outro mês — o registro permanece em {monthLabel(payInstContext.month_ref)}.</p>
                      </div>
                    )}
                    <div><Label>Valor da Quinzena (R$) *</Label>
                      <Input type="number" step="0.01" min="0.01" value={payInstForm.amount} onChange={e => setPayInstForm({ ...payInstForm, amount: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Data Real do Pagamento *</Label><Input type="date" value={payInstForm.payment_date} onChange={e => setPayInstForm({ ...payInstForm, payment_date: e.target.value })} required /></div>
                      <div><Label>Forma de Pagamento *</Label>
                        <select className={selectClass} value={payInstForm.payment_method} onChange={e => setPayInstForm({ ...payInstForm, payment_method: e.target.value })}>
                          <option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                    <div><Label>Conta de Origem</Label>
                      <select className={selectClass} value={payInstForm.account_id} onChange={e => setPayInstForm({ ...payInstForm, account_id: e.target.value })}>
                        <option value="">Selecione (opcional)</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div><Label>Observações</Label><Input value={payInstForm.notes} onChange={e => setPayInstForm({ ...payInstForm, notes: e.target.value })} /></div>
                    <Button type="submit" className="w-full" disabled={payInstallmentMutation.isPending || !payInstForm.amount}>
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
                    <TableHead>Feriados</TableHead>
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
                      <TableCell className="text-primary">{e.empHolidays > 0 ? fmt(e.empHolidays) : "-"}</TableCell>
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
                          {/* Pagamento agora é feito por quinzena na aba Fechamento */}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeeSummary.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-base">Adiantamentos/Vales — {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead><TableHead className="hidden md:table-cell">Descrição</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{advances.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{(a.employees as any)?.name}</TableCell><TableCell><Badge variant={a.type === "vale" ? "destructive" : "secondary"}>{a.type === "vale" ? "Vale" : "Adiantamento"}</Badge></TableCell><TableCell>{fmt(Number(a.amount))}</TableCell><TableCell>{formatDateBR(a.date)}</TableCell><TableCell className="hidden md:table-cell">{a.description || "-"}</TableCell>{canEdit && <TableCell><EditBtn onClick={() => openEdit({ table: 'employee_advances', id: a.id, title: 'Editar Vale/Adiantamento', invalidate: ['employee-advances'], fields: [{ key: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', value: String(Number(a.amount)||0), required: true }, { key: 'type', label: 'Tipo', type: 'select', value: a.type, options: [{value:'adiantamento',label:'Adiantamento'},{value:'vale',label:'Vale'}] }, { key: 'date', label: 'Data', type: 'date', value: a.date }, { key: 'description', label: 'Descrição', type: 'text', value: a.description || '' }, { key: 'month_ref', label: 'Mês de Referência (YYYY-MM)', type: 'text', value: a.month_ref, placeholder: 'AAAA-MM', required: true }], transform: (v) => ({ amount: parseFloat(v.amount)||0, type: v.type, date: v.date, description: v.description||null, month_ref: v.month_ref }) })} /><DeleteBtn table="employee_advances" id={a.id} label={`${a.type} de ${(a.employees as any)?.name}`} /></TableCell>}</TableRow>))}{advances.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhum registro.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>

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
                      {canEdit && <TableCell><EditBtn onClick={() => openEdit({ table: 'salary_payments', id: p.id, title: 'Editar Pagamento', invalidate: ['salary-payments'], fields: [{ key: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', value: String(Number(p.amount)||0), required: true }, { key: 'payment_date', label: 'Data', type: 'date', value: p.payment_date, required: true }, { key: 'payment_method', label: 'Forma', type: 'select', value: p.payment_method, options: [{value:'pix',label:'PIX'},{value:'transferencia',label:'Transferência'},{value:'dinheiro',label:'Dinheiro'},{value:'outro',label:'Outro'}] }, { key: 'notes', label: 'Observações', type: 'text', value: p.notes || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: p.month_ref, required: true }], transform: (v) => ({ amount: parseFloat(v.amount)||0, payment_date: v.payment_date, payment_method: v.payment_method, notes: v.notes||null, month_ref: v.month_ref }) })} /><DeleteBtn table="salary_payments" id={p.id} label={`Pagamento de ${p.employees?.name}`} /></TableCell>}
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
          <Card><CardHeader><CardTitle className="text-base">Horas Extras - {monthLabel(selectedMonth)}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Horas</TableHead><TableHead>%</TableHead><TableHead>Valor</TableHead><TableHead>Data</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader><TableBody>{overtime.map(o => (<TableRow key={o.id}><TableCell className="font-medium">{(o.employees as any)?.name}</TableCell><TableCell>{o.hours}h</TableCell><TableCell><Badge variant="secondary">{o.percentage}%</Badge></TableCell><TableCell>{fmt(Number(o.calculated_value))}</TableCell><TableCell>{formatDateBR(o.date)}</TableCell>{canEdit && <TableCell><EditBtn onClick={() => { const emp = employees.find(e => e.id === o.employee_id); const fixedRate = Number(emp?.overtime_hourly_rate) || 0; openEdit({ table: 'employee_overtime', id: o.id, title: 'Editar Hora Extra', invalidate: ['employee-overtime'], fields: [{ key: 'hours', label: 'Horas', type: 'number', step: '0.5', value: String(Number(o.hours)||0), required: true }, { key: 'percentage', label: 'Percentual', type: 'select', value: String(o.percentage), options: [{value:'50',label:'50% (1.5x)'},{value:'100',label:'100% (2x)'}] }, { key: 'date', label: 'Data', type: 'date', value: o.date }, { key: 'description', label: 'Descrição', type: 'text', value: o.description || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: o.month_ref, required: true }], transform: (v) => { const hrs = parseFloat(v.hours)||0; const pct = parseFloat(v.percentage); const mult = pct === 100 ? 2 : 1.5; return { hours: hrs, percentage: pct, calculated_value: Math.round(fixedRate*mult*hrs*100)/100, date: v.date, description: v.description||null, month_ref: v.month_ref }; } }); }} /><DeleteBtn table="employee_overtime" id={o.id} label={`H.Extra de ${(o.employees as any)?.name}`} /></TableCell>}</TableRow>))}{overtime.length === 0 && <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">Nenhuma hora extra.</TableCell></TableRow>}</TableBody></Table>{overtime.length > 0 && <div className="mt-4 text-right font-bold">Total: {fmt(totalOvertime)} ({overtime.reduce((s, o) => s + Number(o.hours), 0)}h)</div>}</CardContent></Card>
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
                      const dailyRate = Number(emp?.saturday_value) || 0;
                      if (dailyRate <= 0) {
                        return <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">⚠ Cadastre o valor da diária (sábado) de {emp?.name} antes de registrar.</div>;
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
                      {canEdit && <TableCell><EditBtn onClick={() => { const emp = employees.find(e => e.id === h.employee_id); const dailyRate = Number(emp?.saturday_value) || 0; openEdit({ table: 'employee_holidays', id: h.id, title: 'Editar Feriado', invalidate: ['employee-holidays'], fields: [{ key: 'holiday_name', label: 'Nome do Feriado', type: 'text', value: h.holiday_name, required: true }, { key: 'date', label: 'Data', type: 'date', value: h.date, required: true }, { key: 'description', label: 'Descrição', type: 'text', value: h.description || '' }, { key: 'month_ref', label: 'Mês Ref. (YYYY-MM)', type: 'text', value: h.month_ref, required: true }], transform: (v) => ({ holiday_name: v.holiday_name, date: v.date, description: v.description||null, month_ref: v.month_ref, daily_rate: dailyRate, calculated_value: dailyRate }) }); }} /><DeleteBtn table="employee_holidays" id={h.id} label={`Feriado ${h.holiday_name} de ${h.employees?.name}`} /></TableCell>}
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
            <CardHeader>
              <CardTitle className="text-base">Fechamento - {monthLabel(selectedMonth)} <span className="text-xs font-normal text-muted-foreground">(regime de competência)</span></CardTitle>
              <p className="text-xs text-muted-foreground">Cada funcionário é pago em 2 quinzenas. O mês de referência nunca muda — pagamentos podem ocorrer em qualquer data.</p>
            </CardHeader>
            <CardContent className="overflow-auto space-y-4">
              {employeeSummary.map(e => {
                const empInsts = installments.filter((i: any) => i.employee_id === e.id).sort((a: any, b: any) => a.installment_number - b.installment_number);
                const inst1 = empInsts.find((i: any) => i.installment_number === 1);
                const inst2 = empInsts.find((i: any) => i.installment_number === 2);
                const paidCount = empInsts.filter((i: any) => i.status === "pago").length;
                const generalStatus = !e.closing
                  ? <Badge variant="outline">Sem fechamento</Badge>
                  : paidCount === 2
                  ? <Badge variant="default">Pago Total</Badge>
                  : paidCount === 1
                  ? <Badge variant="secondary">Parcialmente Pago</Badge>
                  : <Badge variant="outline">Pendente</Badge>;

                return (
                  <Card key={e.id} className="border-l-4 border-l-primary/40">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="font-bold">{e.name}</p>
                          <p className="text-xs text-muted-foreground">Líquido total do mês: <span className="font-bold text-foreground">{fmt(e.netPay)}</span> · Vales: {fmt(e.empAdvances)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {generalStatus}
                          {canEdit && !e.closing && (
                            <Button size="sm" variant="outline" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending}>
                              Calcular Fechamento
                            </Button>
                          )}
                          {canEdit && e.closing && (
                            <Button size="sm" variant="ghost" onClick={() => closingMutation.mutate(e.id)} disabled={closingMutation.isPending} title="Atualizar líquido total e gerar quinzenas faltantes (não sobrescreve valores manuais)">
                              Atualizar Totais
                            </Button>
                          )}
                          {canEdit && e.closing && (
                            <Button size="sm" variant="ghost" title="Editar mês de competência" onClick={() => {
                              const input = window.prompt("Novo mês de referência (YYYY-MM):", selectedMonth);
                              if (input && /^\d{4}-\d{2}$/.test(input)) {
                                editClosingMonthMutation.mutate({ closingId: e.closing!.id, employeeId: e.id, newMonthRef: input });
                              } else if (input) {
                                toast({ title: "Formato inválido", description: "Use AAAA-MM (ex: 2026-03)", variant: "destructive" });
                              }
                            }}>
                              <Calendar className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && e.closing && <DeleteBtn table="monthly_closings" id={e.closing.id} label={`Fechamento de ${e.name}`} />}
                        </div>
                      </div>

                      {e.closing && (
                        <div className="grid md:grid-cols-2 gap-3">
                          {[inst1, inst2].map((inst, idx) => {
                            const num = (idx + 1) as 1 | 2;
                            if (!inst) return (
                              <div key={num} className="p-3 rounded-md border border-dashed text-sm text-muted-foreground">
                                {num}ª Quinzena ainda não gerada — recalcule.
                              </div>
                            );
                            const isPaid = inst.status === "pago";
                            return (
                              <div key={inst.id} className={`p-3 rounded-md border space-y-2 ${isPaid ? "bg-green-500/5 border-green-500/30" : "bg-muted/30"}`}>
                                <div className="flex items-center justify-between">
                                  <p className="font-bold text-sm">{num}ª Quinzena</p>
                                  {isPaid ? <Badge variant="default">Paga</Badge> : <Badge variant="outline">Pendente</Badge>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs whitespace-nowrap">Valor:</Label>
                                  {canEdit ? (
                                    <Input
                                      type="number" step="0.01" min="0"
                                      defaultValue={String(Number(inst.amount) || 0)}
                                      key={`${inst.id}-${inst.amount}`}
                                      className="h-8 text-sm"
                                      onBlur={(ev) => {
                                        const v = parseFloat(ev.target.value);
                                        if (!isNaN(v) && v !== Number(inst.amount)) {
                                          if (isPaid) {
                                            editPaidInstallmentMutation.mutate({
                                              inst, amount: v,
                                              payment_date: inst.payment_date,
                                              payment_method: inst.payment_method || "pix",
                                              account_id: inst.account_id || null,
                                              notes: inst.notes || null,
                                            });
                                          } else {
                                            editInstMutation.mutate({ id: inst.id, amount: v });
                                          }
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span className="font-bold text-sm">{fmt(Number(inst.amount))}</span>
                                  )}
                                </div>
                                {isPaid ? (
                                  <div className="text-xs space-y-0.5">
                                    <p>Pago em: <span className="font-medium">{formatDateBR(inst.payment_date)}</span></p>
                                    <p>Forma: {inst.payment_method?.toUpperCase() || "—"}</p>
                                  </div>
                                ) : (
                                  <div className="text-xs space-y-0.5">
                                    <p className="text-muted-foreground">Data prevista: {inst.expected_date ? formatDateBR(inst.expected_date) : "—"}</p>
                                  </div>
                                )}
                                {canEdit && !isPaid && (
                                  <div className="flex gap-1 flex-wrap">
                                    <Button size="sm" onClick={() => openPayInstallment(inst)}>
                                      <Banknote className="h-3 w-3 mr-1" /> Pagar
                                    </Button>
                                    <Button
                                      size="sm" variant="outline"
                                      onClick={() => {
                                        const today = localDateString();
                                        const expected = inst.expected_date || today;
                                        const input = window.prompt("Data prevista de pagamento (YYYY-MM-DD):", expected);
                                        if (input) sendToPayableMutation.mutate({ inst, expectedDate: input });
                                      }}
                                    >
                                      {inst.payable_transaction_id ? "Atualizar Conta a Pagar" : "Lançar em Contas a Pagar"}
                                    </Button>
                                  </div>
                                )}
                                {canEdit && isPaid && (
                                  <div className="flex gap-1 flex-wrap">
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const newDate = window.prompt("Nova data real de pagamento (YYYY-MM-DD):", inst.payment_date || localDateString());
                                      if (!newDate) return;
                                      const newMethod = window.prompt("Forma de pagamento (pix/transferencia/dinheiro/outro):", inst.payment_method || "pix");
                                      if (!newMethod) return;
                                      editPaidInstallmentMutation.mutate({
                                        inst,
                                        amount: Number(inst.amount),
                                        payment_date: newDate,
                                        payment_method: newMethod,
                                        account_id: inst.account_id || null,
                                        notes: inst.notes || null,
                                      });
                                    }}>
                                      <Pencil className="h-3 w-3 mr-1" /> Editar Pagamento
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => {
                                      if (window.confirm(`Reabrir esta quinzena? A saída no Financeiro será REMOVIDA. Você poderá pagar novamente depois.`)) {
                                        reopenInstallmentMutation.mutate(inst);
                                      }
                                    }}>
                                      Reabrir
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
