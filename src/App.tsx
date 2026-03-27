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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
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
                <Route path="clientes" element={<RoleGuard allowed={["admin"]}><Clients /></RoleGuard>} />
                <Route path="orcamentos" element={<RoleGuard allowed={["admin", "vendedor"]}><Quotes /></RoleGuard>} />
                <Route path="ordens" element={<RoleGuard allowed={["admin", "producao", "financeiro", "vendedor"]}><WorkOrders /></RoleGuard>} />
                <Route path="producao" element={<RoleGuard allowed={["admin", "producao"]}><Production /></RoleGuard>} />
                <Route path="financeiro" element={<RoleGuard allowed={["admin", "financeiro"]}><Financial /></RoleGuard>} />
                <Route path="faturamento" element={<RoleGuard allowed={["admin", "financeiro"]}><Billing /></RoleGuard>} />
                <Route path="dre" element={<RoleGuard allowed={["admin", "financeiro"]}><DREPage /></RoleGuard>} />
                <Route path="funcionarios" element={<RoleGuard allowed={["admin", "financeiro"]}><Employees /></RoleGuard>} />
                <Route path="rh" element={<RoleGuard allowed={["admin", "financeiro"]}><HR /></RoleGuard>} />
                <Route path="vendas" element={<RoleGuard allowed={["admin", "vendedor"]}><Sales /></RoleGuard>} />
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
