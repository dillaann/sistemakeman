import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImportDialog } from "./ImportDialog";
import { SessionView } from "./SessionView";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { Upload, Trash2, FileText } from "lucide-react";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function ReconciliationTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [deleteSession, setDeleteSession] = useState<any>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => (await supabase.from("financial_accounts").select("id, name").eq("active", true).order("name")).data ?? [],
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["recon-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_reconciliation_sessions").select("*, account:financial_accounts(name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (selectedSession) {
    return <SessionView sessionId={selectedSession} onBack={() => { setSelectedSession(null); qc.invalidateQueries({ queryKey: ["recon-sessions"] }); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Conciliação Bancária</h2>
          <p className="text-sm text-muted-foreground">Importe extratos e concilie com seus lançamentos. Nada é alterado sem sua confirmação.</p>
        </div>
        <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-1" /> Nova Conciliação</Button>
      </div>

      {sessions.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma sessão de conciliação ainda.</p>
          <p className="text-xs mt-1">Clique em "Nova Conciliação" para importar um extrato OFX, CSV ou XLSX.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any) => (
            <Card key={s.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{s.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.account?.name ?? "sem conta"} · {formatDateBR(s.period_start)} → {formatDateBR(s.period_end)} · importado {formatDateTimeBR(s.created_at)}
                </div>
              </div>
              <Badge variant={s.status === "aberta" ? "default" : "secondary"}>{s.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => setSelectedSession(s.id)}>Abrir</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteSession(s)}><Trash2 className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} accounts={accounts} onCreated={(id) => setSelectedSession(id)} />

      <ConfirmActionDialog
        open={!!deleteSession}
        onOpenChange={(o) => { if (!o) setDeleteSession(null); }}
        title="Excluir sessão de conciliação"
        destructive
        description={
          <div className="mt-2 text-sm space-y-1">
            <p className="text-destructive font-medium">Ação destrutiva.</p>
            <p>A sessão <strong>{deleteSession?.file_name}</strong> e todas as linhas do extrato serão removidas.</p>
            <p className="text-xs text-muted-foreground">Os lançamentos financeiros que já foram conciliados <strong>NÃO</strong> serão alterados ou excluídos.</p>
          </div>
        }
        onConfirm={async () => {
          if (!deleteSession) return;
          try {
            await supabase.from("bank_reconciliation_actions").insert({
              session_id: deleteSession.id, actor_id: user?.id ?? null, action: "delete_session", before: deleteSession,
            });
            const { error } = await supabase.from("bank_reconciliation_sessions").delete().eq("id", deleteSession.id);
            if (error) throw error;
            toast({ title: "Sessão excluída" });
            qc.invalidateQueries({ queryKey: ["recon-sessions"] });
          } catch (err) {
            toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
          }
          setDeleteSession(null);
        }}
      />
    </div>
  );
}
