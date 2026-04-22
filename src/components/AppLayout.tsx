import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";

const AppLayout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background bg-dot-grid">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/60 bg-background/70 backdrop-blur-xl px-4 md:px-8 shrink-0 sticky top-0 z-30">
            <SidebarTrigger className="hover:bg-accent rounded-md text-muted-foreground hover:text-foreground" />
            <div className="h-4 w-px bg-border" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">Sistema de Gestão</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">v2.0</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-8 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
