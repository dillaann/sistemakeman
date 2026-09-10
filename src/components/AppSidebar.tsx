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
  Factory, UserCog, LogOut, Moon, Sun, Briefcase, Receipt, BarChart3, Shield, ShoppingBag, ShoppingCart, Megaphone, Calculator, Paintbrush, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logoKeman from "@/assets/logo-keman-brand.png";

type AppRole = "admin" | "funcionario" | "financeiro" | "producao" | "vendedor" | "compras" | "marketing" | "almoxarifado";

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
      { title: "Orçamentos", url: "/orcamentos", icon: FileText, roles: ["admin", "vendedor", "producao"] },
      { title: "Vendas", url: "/vendas", icon: ShoppingBag, roles: ["admin", "vendedor"] },
      { title: "Calculadora", url: "/calculadora", icon: Calculator, roles: ["admin", "vendedor"] },
      { title: "Recibos", url: "/recibos", icon: Receipt, roles: ["admin", "vendedor", "financeiro"] },
    ],
  },
  {
    label: "Operacional",
    items: [
      { title: "Ordens de Serviço", url: "/ordens", icon: ClipboardList, roles: ["admin", "producao", "financeiro", "vendedor", "compras"] },
      { title: "Produção", url: "/producao", icon: Factory, roles: ["admin", "producao"] },
      { title: "Pintura", url: "/pintura", icon: Paintbrush, roles: ["admin", "producao"] },
      { title: "Almoxarifado", url: "/almoxarifado", icon: Package, roles: ["admin", "almoxarifado"] },
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
        {/* Brand: KEMAN logo */}
        <div className={`flex items-center justify-center px-4 py-5 border-b border-sidebar-border ${collapsed ? "px-2 py-3" : ""}`}>
          <img
            src={logoKeman}
            alt="Serralheria KEMAN"
            className={`object-contain transition-all dark:invert-0 invert ${collapsed ? "h-10 w-10" : "h-20 w-auto"}`}
          />
        </div>

        {menuGroups.map((group, groupIdx) => {
          const visibleItems = group.items.filter((item) => userRole && item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="px-3 py-2">
              {!collapsed && (
                <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.2em] font-bold text-sidebar-foreground/40 px-3 mb-2 mt-1">
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
                            className="relative flex items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:text-foreground transition-all duration-200"
                            activeClassName="!bg-gradient-to-r !from-primary/15 !to-transparent !text-foreground"
                            onClick={closeSidebar}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                            )}
                            <item.icon
                              className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-primary"}`}
                              strokeWidth={2}
                            />
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

      <SidebarFooter className="gradient-sidebar border-t border-sidebar-border p-3 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground h-9 rounded-md"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4 mr-2.5" /> : <Moon className="h-4 w-4 mr-2.5" />}
          {!collapsed && <span className="text-sm font-medium">{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive h-9 rounded-md"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2.5" />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
