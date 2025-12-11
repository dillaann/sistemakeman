import { Star } from "lucide-react";
import benefitsBanner from "@/assets/benefits-banner.png";
import beforeAfter from "@/assets/before-after.png";

const TestimonialSection = () => {
  return (
    <section className="space-y-6 opacity-0 animate-fade-in-up animation-delay-400">
      {/* Benefits Banner */}
      <div className="flex justify-center">
        <img 
          src={benefitsBanner} 
          alt="Benefícios do Mounjaro Natural - Emagreça naturalmente, elimine gordura localizada" 
          className="w-full max-w-sm rounded-lg shadow-md"
        />
      </div>

      {/* Before/After Image */}
      <div className="flex justify-center">
        <img 
          src={beforeAfter} 
          alt="Resultado antes e depois - Transformação com o Desafio do Mounjaro Natural" 
          className="w-full max-w-md rounded-lg shadow-lg"
        />
      </div>

      {/* Testimonial */}
      <div className="bg-muted/50 rounded-xl p-6 border border-border">
        <div className="flex items-center gap-1 mb-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          ))}
        </div>
        
        <blockquote className="text-foreground text-base md:text-lg leading-relaxed mb-4">
          "Eu não acreditava que ia funcionar, mas resolvi tentar. Em 21 dias perdi 8kg e me sinto outra pessoa! 
          O método é simples, fácil de seguir e os resultados aparecem rápido. Super recomendo!"
        </blockquote>
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">MF</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">Mariana F.</p>
            <p className="text-sm text-muted-foreground">São Paulo, SP</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
