import { ShieldCheck } from "lucide-react";

const GuaranteeSection = () => {
  return (
    <div className="guarantee-box p-5 opacity-0 animate-fade-in-up animation-delay-400">
      <div className="flex items-start gap-4">
        <ShieldCheck className="h-8 w-8 text-success shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-foreground mb-1">
            Garantia de 7 Dias
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Você ainda tem 7 dias de garantia. Se não gostar, eu devolvo seus R$ 19,90.{" "}
            <span className="font-semibold text-foreground">O risco é ZERO.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default GuaranteeSection;
