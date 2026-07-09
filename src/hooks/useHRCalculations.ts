import { useMemo } from "react";
import { parseLocalDate, daysBetween, fmt, monthLabel } from "@/lib/utils";

export const useHRCalculations = (
  selectedMonth: string,
  selectedYear: number,
  employees: any[],
  advances: any[],
  overtime: any[],
  saturdays: any[],
  holidays: any[],
  absences: any[],
  closings: any[],
  installments: any[],
  weeklyClosings: any[],
  vacations: any[],
  thirteenths: any[]
) => {
  const totalAdvances = useMemo(() => advances.reduce((s, a) => s + Number(a.amount), 0), [advances]);
  const totalOvertime = useMemo(() => overtime.reduce((s, o) => s + Number(o.calculated_value), 0), [overtime]);
  const totalSaturdays = useMemo(() => saturdays.reduce((s, sat) => s + Number(sat.calculated_value), 0), [saturdays]);
  const totalHolidays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.calculated_value), 0), [holidays]);
  const totalHolidayDays = useMemo(() => holidays.reduce((s: number, h: any) => s + Number(h.day_quantity), 0), [holidays]);
  const totalAbsences = useMemo(() => absences.reduce((s: number, a: any) => s + Number(a.calculated_value), 0), [absences]);
  const totalAbsenceDays = useMemo(() => absences.reduce((s: number, a: any) => s + Number(a.day_quantity), 0), [absences]);
  
  const total13thProvision = useMemo(() => {
    const parts = selectedMonth?.split("-");
    const currentMonthNum = parts && parts.length > 1 ? parseInt(parts[1]) : 1;
    return thirteenths.reduce((s, t) => s + (Number(t.monthly_provision) * (currentMonthNum || 1)), 0);
  }, [thirteenths, selectedMonth]);

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
    }).filter(Boolean) as { emp: any; status: "vencida" | "a_vencer"; days: number }[];
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
      
      const isWeekly = (() => {
        if (!emp.payment_type_change_date) return emp.payment_type === "semanal";
        
        const [selYear, selMonth] = selectedMonth.split("-").map(Number);
        const [transYear, transMonth] = emp.payment_type_change_date.split("-").map(Number);
        
        if (selYear < transYear) return true;
        if (selYear > transYear) return emp.payment_type === "semanal";
        if (selMonth < transMonth) return true;
        return emp.payment_type === "semanal";
      })();
      const weeklyTotal = isWeekly ? weeklyClosings.filter((wc: any) => wc.employee_id === emp.id).reduce((s: number, wc: any) => s + Number(wc.net_pay), 0) : 0;
      
      const netPay = isWeekly ? weeklyTotal : (baseSalary + empOvertime + empSaturdays + empHolidays - empAdvances - empAbsences);
      const totalPaid = isWeekly 
        ? weeklyClosings.filter((wc: any) => wc.employee_id === emp.id && wc.status === "pago").reduce((s: number, wc: any) => s + (Number(wc.net_pay) || 0), 0)
        : closing?.paid ? Number(closing.net_pay) || netPay : 0;
      const remaining = netPay - totalPaid;
      return { ...emp, baseSalary, empAdvances, empExpenses, empOvertime, empSaturdays, empHolidays, empAbsences, netPay, closing, totalPaid, remaining, isWeekly };
    });
  }, [employees, advances, overtime, saturdays, holidays, absences, closings, installments, weeklyClosings]);

  const totalPayroll = useMemo(() => employeeSummary.reduce((s, e) => s + e.netPay, 0), [employeeSummary]);

  return {
    totalAdvances,
    totalOvertime,
    totalSaturdays,
    totalHolidays,
    totalHolidayDays,
    totalAbsences,
    totalAbsenceDays,
    total13thProvision,
    vacationAlerts,
    employeeSummary,
    totalPayroll
  };
};
