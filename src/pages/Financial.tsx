import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import EntradasTab from "@/components/financial/EntradasTab";
import SaidasTab from "@/components/financial/SaidasTab";
import MovimentacaoTab from "@/components/financial/MovimentacaoTab";

const Financial = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Financeiro</h1>
      </div>

      <Tabs defaultValue="entradas" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="entradas" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" /> Entradas
          </TabsTrigger>
          <TabsTrigger value="saidas" className="flex items-center gap-1">
            <TrendingDown className="h-4 w-4" /> Saídas
          </TabsTrigger>
          <TabsTrigger value="movimentacao" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" /> Movimentação
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entradas"><EntradasTab /></TabsContent>
        <TabsContent value="saidas"><SaidasTab /></TabsContent>
        <TabsContent value="movimentacao"><MovimentacaoTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Financial;
