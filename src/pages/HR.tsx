import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { BarChart3, DollarSign, Clock, Calendar, PartyPopper, UserMinus, Banknote, Palmtree, Gift, CheckCircle } from "lucide-react";

import { useHRData } from "@/hooks/useHRData";
import { useHRCalculations } from "@/hooks/useHRCalculations";
import { useHRActions } from "@/hooks/useHRActions";
import { localDateString, getNextFriday, getPreviousFriday, monthLabel } from "@/lib/utils";

import HRHeader from "@/components/hr/HRHeader";
import DashboardTab from "@/components/hr/DashboardTab";
import InstallmentsTab from "@/components/hr/InstallmentsTab";
import DailyRatesTab from "@/components/hr/DailyRatesTab";
import OvertimeTab from "@/components/hr/OvertimeTab";
import SaturdaysTab from "@/components/hr/SaturdaysTab";
import HolidaysTab from "@/components/hr/HolidaysTab";
import AbsencesTab from "@/components/hr/AbsencesTab";
import AdvancesTab from "@/components/hr/AdvancesTab";
import VacationsTab from "@/components/hr/VacationsTab";
import ThirteenthTab from "@/components/hr/ThirteenthTab";
import MonthlyClosingsTab from "@/components/hr/MonthlyClosingsTab";
import WeeklyClosingsTab from "@/components/hr/WeeklyClosingsTab";
import WeeklyEditDialog from "@/components/hr/WeeklyEditDialog";
import HREmployeesTab from "@/components/hr/HREmployeesTab";
import HREmployeeSummaryTable from "@/components/hr/HREmployeeSummaryTable";
import HREditDialog from "@/components/hr/HREditDialog";
import HREditSalaryDialog from "@/components/hr/HREditSalaryDialog";
import HRInputDialog from "@/components/hr/HRInputDialog";
import { BulkPayDialog, PayInstallmentDialog } from "@/components/hr/HRPaymentDialogs";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const currentYear = () => new Date().getFullYear();

const HR = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const canEdit = userRole === "admin" || userRole === "financeiro";
  const isAdmin = userRole === "admin";

  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear());
  const [viewQuinzenaDate, setViewQuinzenaDate] = useState(getNextFriday(new Date()));

  const hrData = useHRData(selectedMonth, selectedYear);
  const { deleteMutation } = useHRActions();
  
  const calcs = useHRCalculations(
    selectedMonth, selectedYear, hrData.employees, hrData.advances, 
    hrData.overtime, hrData.saturdays, hrData.holidays, hrData.absences, 
    hrData.closings, hrData.installments, hrData.weeklyClosings, 
    hrData.vacations, hrData.thirteenths
  );

  // ── States for Dialogs ──
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id: string; label: string } | null>(null);
  const [deleteWeekTarget, setDeleteWeekTarget] = useState<{ wc: any; employeeName: string } | null>(null);
  const [weekEdit, setWeekEdit] = useState<{ open: boolean; mode: "edit" | "create"; wc: any | null; employee: any | null }>({ open: false, mode: "create", wc: null, employee: null });
  const [editCtx, setEditCtx] = useState<any | null>(null);
  const [editEmpOpen, setEditEmpOpen] = useState(false);
  const [editEmpForm, setEditEmpForm] = useState({ id: "", name: "", salary: "", saturday_value: "", overtime_hourly_rate: "" });
  const [inputDialog, setInputDialog] = useState<any | null>(null);
  const [inputDialogValues, setInputDialogValues] = useState<Record<string, string>>({});
  const [payInstOpen, setPayInstOpen] = useState(false);
  const [payInstForm, setPayInstForm] = useState({ id: "", amount: "", payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" });
  const [payInstContext, setPayInstContext] = useState<any>(null);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkPayInsts, setBulkPayInsts] = useState<any[]>([]);
  const [bulkPayForm, setBulkPayForm] = useState({ payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" });

  // ── Mutations ──
  const editEmpMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").update({
        salary: parseFloat(editEmpForm.salary) || 0,
        saturday_value: parseFloat(editEmpForm.saturday_value) || 0,
        overtime_hourly_rate: parseFloat(editEmpForm.overtime_hourly_rate) || 0,
      }).eq("id", editEmpForm.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); setEditEmpOpen(false); toast({ title: "Salário atualizado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteWeeklyClosingMutation = useMutation({
    mutationFn: async ({ wc }: { wc: any }) => {
      if (wc.status === 'pago') {
        const emp = hrData.employees.find(e => e.id === wc.employee_id);
        const desc = `Salário Semanal — ${emp?.name} — Semana ${wc.week_number} — Referência ${monthLabel(wc.month_ref)}`;
        await supabase.from("financial_transactions").delete().eq("description", desc).eq("sync_origin", "payroll");
      }
      const { error } = await supabase.from("weekly_closings").delete().eq("id", wc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      setDeleteWeekTarget(null);
      toast({ title: "Semana excluída!" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const payInstallmentMutation = useMutation({
    mutationFn: async () => {
      const inst = payInstContext;
      if (!inst) throw new Error("Quinzena não encontrada");
      const amount = parseFloat(payInstForm.amount);
      const emp = hrData.employees.find(e => e.id === inst.employee_id);
      const empName = emp?.name ?? "Funcionário";
      const desc = `Salário ${empName} — Referência ${monthLabel(inst.month_ref)} — ${inst.installment_number}ª Quinzena`;

      let ftId = inst.payable_transaction_id;
      if (ftId) {
        await supabase.from("financial_transactions").update({ 
          status: "pago" as any, 
          amount, 
          paid_date: payInstForm.payment_date, 
          payment_method: payInstForm.payment_method, 
          account_id: payInstForm.account_id || null, 
          description: desc 
        }).eq("id", ftId);
      } else {
        const { data: ft } = await supabase.from("financial_transactions").insert({ 
          type: "a_pagar" as any, 
          description: desc, 
          amount, 
          due_date: payInstForm.payment_date, 
          paid_date: payInstForm.payment_date, 
          status: "pago" as any, 
          category: "Folha de Pagamento", 
          payment_method: payInstForm.payment_method, 
          account_id: payInstForm.account_id || null, 
          sync_origin: "payroll" 
        }).select("id").single();
        ftId = ft?.id;
      }

      const { error } = await supabase.from("salary_installments" as any).update({ 
        status: "pago", 
        amount, 
        payment_date: payInstForm.payment_date, 
        payment_method: payInstForm.payment_method, 
        account_id: payInstForm.account_id || null, 
        notes: payInstForm.notes || null, 
        financial_transaction_id: ftId, 
        payable_transaction_id: ftId 
      }).eq("id", inst.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      setPayInstOpen(false);
      toast({ title: "Pagamento efetuado!" });
    },
    onError: (e: any) => toast({ title: "Erro ao pagar", description: e.message, variant: "destructive" }),
  });

  const payBulkMutation = useMutation({
    mutationFn: async () => {
      for (const inst of bulkPayInsts) {
        const emp = hrData.employees.find(e => e.id === inst.employee_id);
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
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      setBulkPayOpen(false);
      toast({ title: "Pagamentos processados!" });
    },
    onError: (e: any) => toast({ title: "Erro ao processar", description: e.message, variant: "destructive" }),
  });

  const editClosingMonthMutation = useMutation({
    mutationFn: async ({ closingId, employeeId, newMonthRef }: { closingId: string; employeeId: string; newMonthRef: string }) => {
      const { error: cErr } = await supabase.from("monthly_closings").update({ month_ref: newMonthRef }).eq("id", closingId);
      if (cErr) throw cErr;
      const { error: iErr } = await supabase.from("salary_installments" as any).update({ month_ref: newMonthRef }).eq("employee_id", employeeId).eq("month_ref", selectedMonth);
      if (iErr) throw iErr;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["monthly-closings"] }); queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Mês de referência alterado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <HRHeader 
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} 
        selectedYear={selectedYear} setSelectedYear={setSelectedYear} 
      />

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

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab 
            {...calcs} employeesCount={hrData.employees.length} 
            overtimeCount={hrData.overtime.length} saturdaysCount={hrData.saturdays.length} 
            holidayDaysCount={calcs.totalHolidayDays} advancesCount={hrData.advances.length} 
            absencesCount={hrData.absences.length} selectedMonth={selectedMonth} 
            selectedYear={selectedYear} 
          />
        </TabsContent>

        <TabsContent value="salarios" className="space-y-6">
          <InstallmentsTab 
            installments={hrData.installments} employees={hrData.employees} accounts={hrData.accounts}
            selectedMonth={selectedMonth} canEdit={canEdit} viewQuinzenaDate={viewQuinzenaDate}
            setViewQuinzenaDate={setViewQuinzenaDate} getNextFriday={getNextFriday} getPreviousFriday={getPreviousFriday}
            onOpenPayInstallment={(inst) => {
              setPayInstContext(inst);
              setPayInstForm({ id: inst.id, amount: String(Number(inst.amount) || 0), payment_date: localDateString(), payment_method: inst.payment_method || "pix", account_id: inst.account_id || "", notes: inst.notes || "" });
              setPayInstOpen(true);
            }}
            openInputDialog={(cfg) => {
              const init: Record<string, string> = {};
              cfg.fields.forEach((f: any) => { init[f.key] = f.value ?? ""; });
              setInputDialogValues(init);
              setInputDialog(cfg);
            }}
            onBulkPay={(insts) => { setBulkPayInsts(insts); setBulkPayForm({ payment_date: localDateString(), payment_method: "pix", account_id: "", notes: "" }); setBulkPayOpen(true); }}
          />
          <HREmployeeSummaryTable employeeSummary={calcs.employeeSummary} selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="diarias"><DailyRatesTab employees={hrData.employees} canEdit={canEdit} /></TabsContent>
        <TabsContent value="horas"><OvertimeTab overtime={hrData.overtime} employees={hrData.employees} selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="sabados"><SaturdaysTab saturdays={hrData.saturdays} employees={hrData.employees} selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="feriados"><HolidaysTab holidays={hrData.holidays} employees={hrData.employees} selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="faltas"><AbsencesTab absences={hrData.absences} employees={hrData.employees} selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="vales"><AdvancesTab advances={hrData.advances} employees={hrData.employees} selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="ferias"><VacationsTab vacations={hrData.vacations} employees={hrData.employees} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        <TabsContent value="decimo"><ThirteenthTab thirteenths={hrData.thirteenths} employees={hrData.employees} selectedYear={selectedYear} canEdit={canEdit} onEdit={setEditCtx} onDelete={(table, id, label) => setDeleteTarget({ table, id, label })} /></TabsContent>
        
        <TabsContent value="fechamento" className="space-y-6">
          <div className="space-y-6">
            <WeeklyClosingsTab
              weeklyClosings={hrData.weeklyClosings}
              employees={hrData.employees}
              selectedMonth={selectedMonth}
              canEdit={canEdit}
              onDeleteWeek={(wc, employeeName) => setDeleteWeekTarget({ wc, employeeName })}
              onEditWeek={(wc, employee) => setWeekEdit({ open: true, mode: "edit", wc, employee })}
              onAddWeek={(employee) => setWeekEdit({ open: true, mode: "create", wc: null, employee })}
            />
            <MonthlyClosingsTab 
              closings={hrData.closings} employees={hrData.employees} employeeSummary={calcs.employeeSummary} 
              selectedMonth={selectedMonth} canEdit={canEdit} onEdit={setEditCtx}
              onEditMonth={(closing) => {
                setInputDialog({
                  title: "Alterar Mês de Referência",
                  description: "Isso mudará a competência deste fechamento e suas quinzenas.",
                  fields: [{ key: "month", label: "Novo Mês (YYYY-MM)", type: "text", value: closing.month_ref }],
                  onSubmit: (vals: any) => editClosingMonthMutation.mutate({ closingId: closing.id, employeeId: closing.employee_id, newMonthRef: vals.month })
                });
              }}
            />
            <HREmployeesTab 
              employees={hrData.employees} canEdit={canEdit} 
              onEditSalary={(emp) => { setEditEmpForm({ id: emp.id, name: emp.name, salary: String(Number(emp.salary) || 0), saturday_value: String(Number(emp.saturday_value) || 0), overtime_hourly_rate: String(Number(emp.overtime_hourly_rate) || 0) }); setEditEmpOpen(true); }} 
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <HREditDialog ctx={editCtx} onClose={() => setEditCtx(null)} />
      <HREditSalaryDialog open={editEmpOpen} onOpenChange={setEditEmpOpen} form={editEmpForm} setForm={setEditEmpForm} onConfirm={() => editEmpMutation.mutate()} isPending={editEmpMutation.isPending} />
      <HRInputDialog config={inputDialog} values={inputDialogValues} setValues={setInputDialogValues} onClose={() => setInputDialog(null)} />
      <BulkPayDialog open={bulkPayOpen} onOpenChange={setBulkPayOpen} count={bulkPayInsts.length} form={bulkPayForm} setForm={setBulkPayForm} accounts={hrData.accounts} onConfirm={() => payBulkMutation.mutate()} isPending={payBulkMutation.isPending} />
      <PayInstallmentDialog 
        open={payInstOpen} onOpenChange={setPayInstOpen} employeeName={hrData.employees.find(e => e.id === payInstContext?.employee_id)?.name || ""}
        form={payInstForm} setForm={setPayInstForm} accounts={hrData.accounts} onConfirm={() => payInstallmentMutation.mutate()} isPending={payInstallmentMutation.isPending}
      />
      <ConfirmDeleteDialog 
        open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} 
        title="Excluir Registro" description={`Tem certeza que deseja excluir ${deleteTarget?.label}?`} 
        onConfirm={() => deleteTarget && deleteMutation.mutate({ table: deleteTarget.table, id: deleteTarget.id })} 
        isPending={deleteMutation.isPending} 
      />
      <ConfirmDeleteDialog
        open={!!deleteWeekTarget}
        onOpenChange={(open) => { if (!open) setDeleteWeekTarget(null); }}
        title="Excluir Semana"
        description={deleteWeekTarget ? `Tem certeza que deseja excluir a Semana ${deleteWeekTarget.wc.week_number} de ${deleteWeekTarget.employeeName}? Esta ação não pode ser desfeita.${deleteWeekTarget.wc.status === 'pago' ? ' ⚠️ Esta semana já foi paga. Excluir irá remover o lançamento correspondente no Financeiro. Confirmar?' : ''}` : ''}
        onConfirm={() => { if (deleteWeekTarget) deleteWeeklyClosingMutation.mutate({ wc: deleteWeekTarget.wc }); }}
        isPending={deleteWeeklyClosingMutation.isPending}
      />
      <WeeklyEditDialog
        open={weekEdit.open}
        mode={weekEdit.mode}
        wc={weekEdit.wc}
        employee={weekEdit.employee}
        monthRef={selectedMonth}
        accounts={hrData.accounts}
        onClose={() => setWeekEdit({ open: false, mode: "create", wc: null, employee: null })}
      />
    </div>
  );
};

export default HR;
