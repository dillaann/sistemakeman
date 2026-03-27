import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Users, FileText, ClipboardList, DollarSign,
  Factory, UserCog, LogOut, Moon, Sun, Wrench, Briefcase, Receipt, BarChart3, Shield, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AppRole = "admin" | "funcionario" | "financeiro" | "producao" | "vendedor";

const menuItems: { title: string; url: string; icon: any; roles: AppRole[] }[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin"] },
  { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin"] },
  { title: "Orçamentos", url: "/orcamentos", icon: FileText, roles: ["admin"] },
  { title: "Vendas", url: "/vendas", icon: ShoppingBag, roles: ["admin", "vendedor"] },
  { title: "Ordens de Serviço", url: "/ordens", icon: ClipboardList, roles: ["admin", "producao", "financeiro"] },
  { title: "Produção", url: "/producao", icon: Factory, roles: ["admin", "producao"] },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign, roles: ["admin", "financeiro"] },
  { title: "Faturamento", url: "/faturamento", icon: Receipt, roles: ["admin", "financeiro"] },
  { title: "DRE", url: "/dre", icon: BarChart3, roles: ["admin", "financeiro"] },
  { title: "Funcionários", url: "/funcionarios", icon: UserCog, roles: ["admin", "financeiro"] },
  { title: "RH", url: "/rh", icon: Briefcase, roles: ["admin", "financeiro"] },
  { title: "Usuários", url: "/usuarios", icon: Shield, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, userRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const visibleItems = menuItems.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              {!collapsed && <span className="font-bold">SERRALHERIA KEMAN</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
          {!collapsed && (theme === "dark" ? "Modo Claro" : "Modo Escuro")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-destructive" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
