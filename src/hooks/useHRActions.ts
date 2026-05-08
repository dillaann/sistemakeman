import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useHRActions = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({ title: "Registro excluído!" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  return {
    deleteMutation
  };
};
