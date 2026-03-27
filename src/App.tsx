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
                <Route index element={<Dashboard />} />
                <Route path="clientes" element={<Clients />} />
                <Route path="orcamentos" element={<Quotes />} />
                <Route path="ordens" element={<WorkOrders />} />
                <Route path="producao" element={<Production />} />
                <Route path="financeiro" element={<Financial />} />
                <Route path="faturamento" element={<Billing />} />
                <Route path="funcionarios" element={<Employees />} />
                <Route path="rh" element={<HR />} />
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
