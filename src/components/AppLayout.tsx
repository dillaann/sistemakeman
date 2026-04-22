import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";

const AppLayout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/60 bg-card/80 backdrop-blur-md px-3 md:px-6 shrink-0 sticky top-0 z-30">
            <SidebarTrigger className="hover:bg-accent rounded-lg" />
            <div className="h-5 w-px bg-border" />
            <span className="text-sm font-medium text-muted-foreground hidden sm:inline">Sistema de Gestão</span>
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
