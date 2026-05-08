import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useHRData = (selectedMonth: string, selectedYear: number) => {
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const advancesQuery = useQuery({
    queryKey: ["employee-advances", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_advances").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const overtimeQuery = useQuery({
    queryKey: ["employee-overtime", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_overtime").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const saturdaysQuery = useQuery({
    queryKey: ["employee-saturdays", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_saturdays").select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return data ?? [];
    },
  });

  const holidaysQuery = useQuery({
    queryKey: ["employee-holidays", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_holidays" as any).select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const absencesQuery = useQuery({
    queryKey: ["employee-absences", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("employee_absences" as any).select("*, employees(name)").eq("month_ref", selectedMonth).order("date", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const closingsQuery = useQuery({
    queryKey: ["monthly-closings", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_closings").select("*, employees(name)").eq("month_ref", selectedMonth);
      return data ?? [];
    },
  });

  const vacationsQuery = useQuery({
    queryKey: ["employee-vacations"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_vacations").select("*, employees(name)").order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  const thirteenthsQuery = useQuery({
    queryKey: ["thirteenth-salary", selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from("thirteenth_salary").select("*, employees(name)").eq("year", selectedYear);
      return data ?? [];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const installmentsQuery = useQuery({
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

  const weeklyClosingsQuery = useQuery({
    queryKey: ["weekly-closings", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from("weekly_closings")
        .select("*, employees(name)")
        .eq("month_ref", selectedMonth)
        .order("week_number");
      return data ?? [];
    },
  });

  return {
    employees: employeesQuery.data ?? [],
    advances: advancesQuery.data ?? [],
    overtime: overtimeQuery.data ?? [],
    saturdays: saturdaysQuery.data ?? [],
    holidays: holidaysQuery.data ?? [],
    absences: absencesQuery.data ?? [],
    closings: closingsQuery.data ?? [],
    vacations: vacationsQuery.data ?? [],
    thirteenths: thirteenthsQuery.data ?? [],
    accounts: accountsQuery.data ?? [],
    installments: installmentsQuery.data ?? [],
    weeklyClosings: weeklyClosingsQuery.data ?? [],
    isLoading: 
      employeesQuery.isLoading || 
      advancesQuery.isLoading || 
      overtimeQuery.isLoading || 
      saturdaysQuery.isLoading || 
      holidaysQuery.isLoading || 
      absencesQuery.isLoading || 
      closingsQuery.isLoading || 
      vacationsQuery.isLoading || 
      thirteenthsQuery.isLoading || 
      accountsQuery.isLoading || 
      installmentsQuery.isLoading || 
      weeklyClosingsQuery.isLoading
  };
};
