import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calculator, Users, Clock, Package, MapPin, Fuel, Save, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ServiceCalculator() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [qtdFunc, setQtdFunc] = useState("");
  const [valorHora, setValorHora] = useState("");
  const [horasServico, setHorasServico] = useState("");
  const [qtdMaterial, setQtdMaterial] = useState("");
  const [valorUnit, setValorUnit] = useState("");
  const [km, setKm] = useState("");
  const [valorKm, setValorKm] = useState("");
  const [gasolina, setGasolina] = useState("");
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
    const nFunc = parseFloat(qtdFunc) || 0;
    const vHora = parseFloat(valorHora) || 0;
    const hServ = parseFloat(horasServico) || 0;
    const nMat = parseFloat(qtdMaterial) || 0;
    const vUnit = parseFloat(valorUnit) || 0;
    const nKm = parseFloat(km) || 0;
    const vKm = parseFloat(valorKm) || 0;
    const vGas = parseFloat(gasolina) || 0;

    const subFunc = nFunc * vHora * 8;
    const subTempo = vHora > 0 ? hServ * (vHora / 8) : 0;
    const subMat = nMat * vUnit;
    const subDist = nKm * vKm;
    const total = subFunc + subTempo + subMat + subDist + vGas;

    return { subFunc, subTempo, subMat, subDist, vGas, total };
  }, [qtdFunc, valorHora, horasServico, qtdMaterial, valorUnit, km, valorKm, gasolina]);

  const handleSaveAsQuote = async () => {
    if (!clientId) {
      toast({ title: "Selecione um cliente", variant: "destructive" });
      return;
    }
    if (calc.total <= 0) {
      toast({ title: "O total deve ser maior que zero", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const lines: string[] = [];
      if (calc.subFunc > 0) lines.push(`Funcionários: ${qtdFunc} × ${fmt(parseFloat(valorHora))} = ${fmt(calc.subFunc)}`);
      if (calc.subTempo > 0) lines.push(`Tempo de serviço: ${horasServico}h = ${fmt(calc.subTempo)}`);
      if (calc.subMat > 0) lines.push(`Material: ${qtdMaterial} × ${fmt(parseFloat(valorUnit))} = ${fmt(calc.subMat)}`);
      if (calc.subDist > 0) lines.push(`Distância: ${km}km × ${fmt(parseFloat(valorKm))} = ${fmt(calc.subDist)}`);
      if (calc.vGas > 0) lines.push(`Gasolina: ${fmt(calc.vGas)}`);

      const fullDesc = descricao
        ? `${descricao}\n\n--- Detalhamento ---\n${lines.join("\n")}`
        : lines.join("\n");

      const { data: quote, error } = await supabase.from("quotes").insert({
        client_id: clientId,
        total: calc.total,
        description: fullDesc,
        seller_id: user?.id,
        status: "pendente",
      }).select("id").single();

      if (error) throw error;

      // Create a single item with the total
      await supabase.from("quote_items").insert({
        quote_id: quote.id,
        description: descricao || "Serviço calculado",
        quantity: 1,
        unit_price: calc.total,
        total: calc.total,
      });

      toast({ title: "Orçamento criado com sucesso!" });

      // Reset
      setQtdFunc(""); setValorHora(""); setHorasServico("");
      setQtdMaterial(""); setValorUnit(""); setKm("");
      setValorKm(""); setGasolina(""); setClientId(""); setDescricao("");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const NumField = ({ label, value, onChange, prefix, icon: Icon }: {
    label: string; value: string; onChange: (v: string) => void; prefix?: string; icon?: any;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>
        )}
        <Input
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={prefix ? "pl-9" : ""}
          placeholder="0"
        />
      </div>
    </div>
  );

  const ResultRow = ({ label, value, icon: Icon }: { label: string; value: number; icon: any }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <span className={`font-medium ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {fmt(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Calculadora de Serviços</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Funcionários */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Funcionários
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <NumField label="Quantidade" value={qtdFunc} onChange={setQtdFunc} />
              <NumField label="Valor/hora (R$)" value={valorHora} onChange={setValorHora} prefix="R$" />
              {calc.subFunc > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {qtdFunc} func. × {fmt(parseFloat(valorHora))} × 8h = <strong className="text-foreground">{fmt(calc.subFunc)}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tempo de serviço */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Tempo de Serviço
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NumField label="Horas" value={horasServico} onChange={setHorasServico} />
              {calc.subTempo > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {horasServico}h × ({fmt(parseFloat(valorHora))} / 8) = <strong className="text-foreground">{fmt(calc.subTempo)}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Material */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Material
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <NumField label="Quantidade" value={qtdMaterial} onChange={setQtdMaterial} />
              <NumField label="Valor unitário (R$)" value={valorUnit} onChange={setValorUnit} prefix="R$" />
              {calc.subMat > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {qtdMaterial} × {fmt(parseFloat(valorUnit))} = <strong className="text-foreground">{fmt(calc.subMat)}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Distância */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Distância
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <NumField label="Quilometragem (km)" value={km} onChange={setKm} />
              <NumField label="Valor/km (R$)" value={valorKm} onChange={setValorKm} prefix="R$" />
              {calc.subDist > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {km}km × {fmt(parseFloat(valorKm))} = <strong className="text-foreground">{fmt(calc.subDist)}</strong>
                </p>
              )}
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
              <NumField label="Valor (R$)" value={gasolina} onChange={setGasolina} prefix="R$" />
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
              <ResultRow label="Funcionários" value={calc.subFunc} icon={Users} />
              <ResultRow label="Tempo de serviço" value={calc.subTempo} icon={Clock} />
              <ResultRow label="Material" value={calc.subMat} icon={Package} />
              <ResultRow label="Distância" value={calc.subDist} icon={MapPin} />
              <ResultRow label="Gasolina" value={calc.vGas} icon={Fuel} />
              <Separator className="my-2" />
              <div className="flex items-center justify-between py-2">
                <span className="font-bold text-lg">TOTAL</span>
                <span className="font-bold text-lg text-primary">{fmt(calc.total)}</span>
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
                disabled={saving || calc.total <= 0}
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
