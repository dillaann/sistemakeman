import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface DailyRatesTabProps {
  employees: any[];
  canEdit: boolean;
}

export default function DailyRatesTab({ employees, canEdit }: DailyRatesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    employees.forEach((e) => {
      map[e.id] = String(Number(e.daily_rate) || 0);
    });
    setValues(map);
  }, [employees]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase.from("employees").update({ daily_rate: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Diária atualizada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diárias dos Funcionários</CardTitle>
        <p className="text-sm text-muted-foreground">
          Defina o valor da diária de cada funcionário. Esse valor é usado no cálculo de feriados trabalhados.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="w-48">Valor da Diária (R$)</TableHead>
              <TableHead>Atual</TableHead>
              {canEdit && <TableHead className="w-24"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => {
              const current = Number(emp.daily_rate) || 0;
              const inputVal = values[emp.id] ?? "";
              const parsed = parseFloat(inputVal);
              const changed = !isNaN(parsed) && parsed !== current;
              return (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.role || "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputVal}
                      disabled={!canEdit}
                      onChange={(e) => setValues({ ...values, [emp.id]: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className={current > 0 ? "font-semibold text-primary" : "text-muted-foreground"}>
                    {fmt(current)}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={!changed || saveMutation.isPending}
                        onClick={() => saveMutation.mutate({ id: emp.id, value: parsed })}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Salvar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">
                  Nenhum funcionário ativo.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
