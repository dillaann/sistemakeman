import { ArrowRight, Lock } from "lucide-react";

interface CTAButtonProps {
  onClick?: () => void;
}

const CTAButton = ({ onClick }: CTAButtonProps) => {
  return (
    <div className="space-y-4 opacity-0 animate-fade-in-up animation-delay-300">
      <button
        onClick={onClick}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base md:text-lg py-5 px-6 rounded-lg transition-all duration-200 animate-pulse-scale flex items-center justify-center gap-2 shadow-lg"
      >
        QUERO APROVEITAR O DESCONTO DE R$ 19,90 AGORA
        <ArrowRight className="h-5 w-5" />
      </button>
      
      <p className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Lock className="h-4 w-4" />
        Produto 100% Digital. Acesso imediato por E-mail.
      </p>
    </div>
  );
};

export default CTAButton;
