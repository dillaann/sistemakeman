import AlertBar from "@/components/AlertBar";
import OfferBox from "@/components/OfferBox";
import CTAButton from "@/components/CTAButton";
import GuaranteeSection from "@/components/GuaranteeSection";
import TestimonialSection from "@/components/TestimonialSection";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();

  const handleCTAClick = () => {
    toast({
      title: "Redirecionando para pagamento...",
      description: "Você será redirecionado em instantes.",
    });
    window.location.href = "https://pay.cakto.com.br/qxutn33";
  };

  return (
    <div className="min-h-screen bg-background">
      <AlertBar />
      
      <main className="container py-8 md:py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Headline */}
          <header className="text-center space-y-4 opacity-0 animate-fade-in-up">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-foreground leading-tight">
              FOI POR CAUSA DO PREÇO?{" "}
              <span className="text-primary">
                AQUI ESTÁ UM DESCONTO ÚNICO PARA VOCÊ COMEÇAR.
              </span>
            </h1>
            
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              Vi que você quase entrou para o{" "}
              <strong className="text-foreground">Desafio do Mounjaro Natural</strong>, 
              mas acabou deixando para depois. Eu não quero que o dinheiro seja o problema 
              entre você e o seu corpo dos sonhos.
            </p>
          </header>

          {/* Testimonial Section */}
          <TestimonialSection />

          {/* Offer Box */}
          <OfferBox />

          {/* CTA Button */}
          <CTAButton onClick={handleCTAClick} />

          {/* Guarantee */}
          <GuaranteeSection />

          {/* Footer Note */}
          <footer className="text-center pt-4">
            <p className="text-xs text-muted-foreground">
              © 2024 Desafio do Mounjaro Natural. Todos os direitos reservados.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default Index;
