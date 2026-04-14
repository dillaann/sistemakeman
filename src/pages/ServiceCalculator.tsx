import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calculator, Users, Package, MapPin, Fuel, Save, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const VALOR_DIARIO = 367.5;
const VALOR_KM = 6;
const GASOLINA_FIXA = 100;
const MULT_MATERIAL = 2.75;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ServiceCalculator() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [qtdFunc, setQtdFunc] = useState("");
  const [diasServico, setDiasServico] = useState("");
  const [valorMaterial, setValorMaterial] = useState("");
  const [km, setKm] = useState("");
  const [clientId, setClientId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-calc"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data ?? [];
    },
  });

  const calc = useMemo(() => {
    const nFunc = parseFloat(qtdFunc) || 1;
    const dias = parseFloat(diasServico) || 0;
    const mat = parseFloat(valorMaterial) || 0;
    const distancia = parseFloat(km) || 0;

    const subFunc = nFunc * dias * VALOR_DIARIO;
    const subMat = mat * MULT_MATERIAL;
    const subDist = distancia * VALOR_KM;
    const total = subFunc + subMat + subDist + GASOLINA_FIXA;

    return { subFunc, subMat, subDist, total };
  }, [qtdFunc, diasServico, valorMaterial, km]);

  const handleSaveAsQuote = async () => {
    if (!clientId) {
      toast({ title: "Selecione um cliente", variant: "destructive" });
      return;
    }
    if (calc.total <= GASOLINA_FIXA && !diasServico && !valorMaterial && !km) {
      toast({ title: "Preencha ao menos um campo", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const lines: string[] = [];
      const { data: quote, error } = await supabase.from("quotes").insert({
        client_id: clientId,
        total: calc.total,
        description: descricao || "Serviço calculado",
        seller_id: user?.id,
        status: "pendente",
      }).select("id").single();

      if (error) throw error;

      await supabase.from("quote_items").insert({
        quote_id: quote.id,
        description: descricao || "Serviço calculado",
        quantity: 1,
        unit_price: calc.total,
        total: calc.total,
      });

      toast({ title: "Orçamento criado com sucesso!" });
      setQtdFunc(""); setDiasServico(""); setValorMaterial(""); setKm(""); setClientId(""); setDescricao("");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Calculadora de Serviços</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Funcionários */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Funcionários
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Quantidade de funcionários</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={qtdFunc}
                  onChange={(e) => setQtdFunc(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Tempo de serviço (dias) — ex: 0.5, 1, 1.5
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={diasServico}
                  onChange={(e) => setDiasServico(e.target.value)}
                  placeholder="0"
                />
              </div>
              {calc.subFunc > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {qtdFunc || 1} func. × {diasServico} dias × {fmt(VALOR_DIARIO)} = <strong className="text-foreground">{fmt(calc.subFunc)}</strong>
                </p>
              )}
              <p className="col-span-2 text-[11px] text-muted-foreground">Valor diário fixo: {fmt(VALOR_DIARIO)}</p>
            </CardContent>
          </Card>

          {/* Material */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Material
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Valor do material (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={valorMaterial}
                    onChange={(e) => setValorMaterial(e.target.value)}
                    className="pl-9"
                    placeholder="0"
                  />
                </div>
              </div>
              {calc.subMat > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {fmt(parseFloat(valorMaterial))} × {MULT_MATERIAL} = <strong className="text-foreground">{fmt(calc.subMat)}</strong>
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Multiplicador: {MULT_MATERIAL}x</p>
            </CardContent>
          </Card>

          {/* Distância */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Distância
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Quilometragem (km)</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="0"
                />
              </div>
              {calc.subDist > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {km}km × {fmt(VALOR_KM)} = <strong className="text-foreground">{fmt(calc.subDist)}</strong>
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Valor/km fixo: {fmt(VALOR_KM)}</p>
            </CardContent>
          </Card>

          {/* Gasolina */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Fuel className="h-4 w-4" /> Gasolina
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Valor fixo: <strong className="text-foreground">{fmt(GASOLINA_FIXA)}</strong>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumo do Serviço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-muted-foreground" /><span>Funcionários</span></div>
                <span className={`font-medium ${calc.subFunc > 0 ? "text-foreground" : "text-muted-foreground"}`}>{fmt(calc.subFunc)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm"><Package className="h-4 w-4 text-muted-foreground" /><span>Material</span></div>
                <span className={`font-medium ${calc.subMat > 0 ? "text-foreground" : "text-muted-foreground"}`}>{fmt(calc.subMat)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span>Distância</span></div>
                <span className={`font-medium ${calc.subDist > 0 ? "text-foreground" : "text-muted-foreground"}`}>{fmt(calc.subDist)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm"><Fuel className="h-4 w-4 text-muted-foreground" /><span>Gasolina</span></div>
                <span className="font-medium text-foreground">{fmt(GASOLINA_FIXA)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center justify-between py-3">
                <span className="font-bold text-lg">TOTAL</span>
                <span className="font-bold text-2xl text-green-600 dark:text-green-400">{fmt(calc.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Salvar como Orçamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cliente *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descrição do serviço..."
                  rows={3}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSaveAsQuote}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Criar Orçamento"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
