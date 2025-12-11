import { AlertTriangle } from "lucide-react";

const AlertBar = () => {
  return (
    <div className="alert-bar sticky top-0 z-50 py-3 px-4">
      <div className="container flex items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm md:text-base font-semibold">
          ATENÇÃO: SEU ACESSO ESTÁ PENDENTE. FINALIZE AGORA PARA NÃO PERDER A VAGA.
        </span>
      </div>
    </div>
  );
};

export default AlertBar;
