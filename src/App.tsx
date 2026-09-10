import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Quotes from "@/pages/Quotes";
import WorkOrders from "@/pages/WorkOrders";
import Financial from "@/pages/Financial";
import Production from "@/pages/Production";
import Employees from "@/pages/Employees";
import HR from "@/pages/HR";
import Billing from "@/pages/Billing";
import DREPage from "@/pages/DRE";
import UserManagement from "@/pages/UserManagement";
import Sales from "@/pages/Sales";
import Purchases from "@/pages/Purchases";
import Marketing from "@/pages/Marketing";
import ServiceCalculator from "@/pages/ServiceCalculator";
import Receipts from "@/pages/Receipts";
import Painting from "@/pages/Painting";
import Warehouse from "@/pages/Warehouse";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const PendingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <div className="max-w-md text-center space-y-4">
      <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center mx-auto">
        <span className="text-3xl">⏳</span>
      </div>
      <h1 className="text-2xl font-bold text-foreground">Conta Pendente</h1>
      <p className="text-muted-foreground">
        Sua conta está aguardando liberação pelo administrador. Entre em contato para solicitar acesso.
      </p>
      <button
        onClick={async () => { await (await import("@/integrations/supabase/client")).supabase.auth.signOut(); window.location.href = "/auth"; }}
        className="text-sm text-primary hover:underline"
      >
        Sair e voltar ao login
      </button>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, userRole } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  // User has no role = pending
  if (userRole === null) return <PendingScreen />;
  return <>{children}</>;
};

const AuthRoute = () => {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
};

const DefaultRedirect = () => {
  const { userRole, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (userRole === "financeiro") return <Navigate to="/financeiro" replace />;
  if (userRole === "producao") return <Navigate to="/producao" replace />;
  if (userRole === "vendedor") return <Navigate to="/vendas" replace />;
  if (userRole === "compras") return <Navigate to="/compras" replace />;
  if (userRole === "marketing") return <Navigate to="/marketing" replace />;
  if (userRole === "almoxarifado") return <Navigate to="/almoxarifado" replace />;
  return <Dashboard />;
};

const RoleGuard = ({ allowed, children }: { allowed: string[]; children: React.ReactNode }) => {
  const { userRole, loading } = useAuth();
  if (loading) return null;
  if (userRole && allowed.includes(userRole)) return <>{children}</>;
  return <Navigate to="/" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<DefaultRedirect />} />
                <Route path="clientes" element={<RoleGuard allowed={["admin", "vendedor"]}><Clients /></RoleGuard>} />
                <Route path="orcamentos" element={<RoleGuard allowed={["admin", "vendedor", "producao"]}><Quotes /></RoleGuard>} />
                <Route path="producao" element={<RoleGuard allowed={["admin", "vendedor", "producao"]}><Production /></RoleGuard>} />
                <Route path="pintura" element={<RoleGuard allowed={["admin", "producao"]}><Painting /></RoleGuard>} />
                <Route path="almoxarifado" element={<RoleGuard allowed={["admin", "almoxarifado"]}><Warehouse /></RoleGuard>} />
                <Route path="ordens" element={<RoleGuard allowed={["admin", "producao", "financeiro", "vendedor", "compras"]}><WorkOrders /></RoleGuard>} />
                <Route path="financeiro" element={<RoleGuard allowed={["admin", "financeiro"]}><Financial /></RoleGuard>} />
                <Route path="faturamento" element={<RoleGuard allowed={["admin", "financeiro"]}><Billing /></RoleGuard>} />
                <Route path="dre" element={<RoleGuard allowed={["admin", "financeiro"]}><DREPage /></RoleGuard>} />
                <Route path="funcionarios" element={<RoleGuard allowed={["admin", "financeiro"]}><Employees /></RoleGuard>} />
                <Route path="rh" element={<RoleGuard allowed={["admin", "financeiro"]}><HR /></RoleGuard>} />
                <Route path="vendas" element={<RoleGuard allowed={["admin", "vendedor"]}><Sales /></RoleGuard>} />
                <Route path="compras" element={<RoleGuard allowed={["admin", "compras"]}><Purchases /></RoleGuard>} />
                <Route path="marketing" element={<RoleGuard allowed={["admin", "marketing"]}><Marketing /></RoleGuard>} />
                <Route path="calculadora" element={<RoleGuard allowed={["admin", "vendedor"]}><ServiceCalculator /></RoleGuard>} />
                <Route path="recibos" element={<RoleGuard allowed={["admin", "vendedor", "financeiro"]}><Receipts /></RoleGuard>} />
                <Route path="usuarios" element={<RoleGuard allowed={["admin"]}><UserManagement /></RoleGuard>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
