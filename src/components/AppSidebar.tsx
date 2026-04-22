import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Users, FileText, ClipboardList, DollarSign,
  Factory, UserCog, LogOut, Moon, Sun, Wrench, Briefcase, Receipt, BarChart3, Shield, ShoppingBag, ShoppingCart, Megaphone, Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AppRole = "admin" | "funcionario" | "financeiro" | "producao" | "vendedor" | "compras" | "marketing";

type MenuItem = { title: string; url: string; icon: any; roles: AppRole[] };
type MenuGroup = { label: string; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin"] },
    ],
  },
  {
    label: "Comercial",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "vendedor"] },
      { title: "Orçamentos", url: "/orcamentos", icon: FileText, roles: ["admin", "vendedor"] },
      { title: "Vendas", url: "/vendas", icon: ShoppingBag, roles: ["admin", "vendedor"] },
      { title: "Calculadora", url: "/calculadora", icon: Calculator, roles: ["admin", "vendedor"] },
    ],
  },
  {
    label: "Operacional",
    items: [
      { title: "Ordens de Serviço", url: "/ordens", icon: ClipboardList, roles: ["admin", "producao", "financeiro", "vendedor", "compras"] },
      { title: "Produção", url: "/producao", icon: Factory, roles: ["admin", "producao"] },
      { title: "Compras", url: "/compras", icon: ShoppingCart, roles: ["admin", "compras"] },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Financeiro", url: "/financeiro", icon: DollarSign, roles: ["admin", "financeiro"] },
      { title: "Faturamento", url: "/faturamento", icon: Receipt, roles: ["admin", "financeiro"] },
      { title: "DRE", url: "/dre", icon: BarChart3, roles: ["admin", "financeiro"] },
      { title: "Funcionários", url: "/funcionarios", icon: UserCog, roles: ["admin", "financeiro"] },
      { title: "RH", url: "/rh", icon: Briefcase, roles: ["admin", "financeiro"] },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { title: "Marketing", url: "/marketing", icon: Megaphone, roles: ["admin", "marketing"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Usuários", url: "/usuarios", icon: Shield, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { state, setOpenMobile, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, userRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isMobile = useIsMobile();

  const closeSidebar = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-users-count"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id");
      const { data: roles } = await supabase.from("user_roles").select("user_id");
      const roleUserIds = new Set(roles?.map((r) => r.user_id) ?? []);
      return (profiles ?? []).filter((p) => !roleUserIds.has(p.id)).length;
    },
    enabled: userRole === "admin",
    refetchInterval: 30000,
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="gradient-sidebar">
        {/* Brand */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-sidebar-border ${collapsed ? "justify-center px-2" : ""}`}>
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <Wrench className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-display font-bold text-sm text-sidebar-accent-foreground tracking-tight">SERRALHERIA</span>
              <span className="font-display font-extrabold text-base text-gradient-gold -mt-0.5">KEMAN</span>
            </div>
          )}
        </div>

        {menuGroups.map((group) => {
          const visibleItems = group.items.filter((item) => userRole && item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="px-2 py-1">
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/50 px-3 mb-1">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.url || (item.url !== "/" && location.pathname.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild className="h-10 group">
                          <NavLink
                            to={item.url}
                            end={item.url === "/"}
                            className="relative flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
                            activeClassName="!bg-sidebar-accent !text-sidebar-accent-foreground"
                            onClick={closeSidebar}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary shadow-glow" />
                            )}
                            <item.icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? "text-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"}`} strokeWidth={2} />
                            {!collapsed && <span className="truncate">{item.title}</span>}
                            {item.url === "/usuarios" && pendingCount > 0 && !collapsed && (
                              <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1.5 font-bold">{pendingCount}</Badge>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gradient-sidebar border-t border-sidebar-border p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 rounded-lg"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4 mr-2.5" /> : <Moon className="h-4 w-4 mr-2.5" />}
          {!collapsed && <span className="text-sm">{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive h-9 rounded-lg"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2.5" />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
