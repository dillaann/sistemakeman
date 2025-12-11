const OfferBox = () => {
  return (
    <div className="offer-box bg-card opacity-0 animate-fade-in-up animation-delay-200">
      <p className="text-center text-sm md:text-base font-bold text-alert uppercase tracking-wide mb-6">
        🎯 LIBERAMOS UMA CONDIÇÃO ESPECIAL DE FINAL DE LOTE:
      </p>
      
      <div className="text-center space-y-2">
        <p className="text-lg text-muted-foreground">
          De <span className="price-old text-xl font-semibold">R$ 37,00</span>
        </p>
        <p className="text-2xl md:text-3xl font-bold">
          por APENAS{" "}
          <span className="price-new text-4xl md:text-5xl font-black">
            R$ 19,90
          </span>
        </p>
        <p className="text-muted-foreground text-sm font-medium">
          (Pagamento Único)
        </p>
      </div>
    </div>
  );
};

export default OfferBox;
