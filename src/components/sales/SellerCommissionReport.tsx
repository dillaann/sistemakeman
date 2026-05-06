import { useState, useMemo } from \"react\";
import { Card, CardContent, CardHeader, CardTitle } from \"@/components/ui/card\";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from \"@/components/ui/table\";
import { Tabs, TabsList, TabsTrigger } from \"@/components/ui/tabs\";
import { Badge } from \"@/components/ui/badge\";
import { Button } from \"@/components/ui/button\";
import { Download, ArrowUpDown, Calendar, TrendingUp, Filter } from \"lucide-react\";

interface Seller {
  id: string;
  full_name: string;
  active?: boolean;
}

interface Sale {
  amount: number;
  seller_id: string | null;
  created_at: string;
}

interface Commission {
  amount: number;
  seller_id: string | null;
  created_at: string;
}

interface Rate {
  seller_id: string;
  percentage: number;
}

interface SellerCommissionReportProps {
  sellers: Seller[];
  sales: Sale[];
  commissions: Commission[];
  rates: Rate[];
}

const fmt = (v: number) => v.toLocaleString(\"pt-BR\", { style: \"currency\", currency: \"BRL\" });

export const SellerCommissionReport = ({ sellers, sales, commissions, rates }: SellerCommissionReportProps) => {
  const [refDate, setRefDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<\"monthly\" | \"accumulated\">(\"monthly\");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const monthStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, \"0\")}`;

  const reportData = useMemo(() => {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();

    return sellers.map(seller => {
      const sellerSales = sales.filter(s => s.seller_id === seller.id);
      const sellerCommissions = commissions.filter(c => c.seller_id === seller.id);
      const rate = rates.find(r => r.seller_id === seller.id)?.percentage ?? 5;

      let filteredSales = [];
      let filteredCommissions = [];

      if (viewMode === \"monthly\") {
        filteredSales = sellerSales.filter(s => {
          const d = new Date(s.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        });
        filteredCommissions = sellerCommissions.filter(c => {
          const d = new Date(c.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        });
      } else {
        // Accumulated: From Jan 1st of that year until end of selected month
        filteredSales = sellerSales.filter(s => {
          const d = new Date(s.created_at);
          return d.getFullYear() === year && d.getMonth() <= month;
        });
        filteredCommissions = sellerCommissions.filter(c => {
          const d = new Date(c.created_at);
          return d.getFullYear() === year && d.getMonth() <= month;
        });
      }

      const totalSales = filteredSales.reduce((acc, s) => acc + Number(s.amount), 0);
      const totalCommissions = filteredCommissions.reduce((acc, c) => acc + Number(c.amount), 0);

      return {
        id: seller.id,
        name: seller.full_name || \"—\",
        sales: totalSales,
        commission: totalCommissions,
        percentage: rate,
        active: seller.active ?? true
      };
    });
  }, [sellers, sales, commissions, rates, refDate, viewMode]);

  const sortedData = useMemo(() => {
    return [...reportData].sort((a: any, b: any) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [reportData, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const totals = useMemo(() => {
    return sortedData.reduce((acc, curr) => ({
      sales: acc.sales + curr.sales,
      commission: acc.commission + curr.commission
    }), { sales: 0, commission: 0 });
  }, [sortedData]);

  const exportToCSV = () => {
    const headers = [\"Vendedor\", \"Vendas\", \"Comissão\", \"% Comissão\", \"Status\"];
    const rows = sortedData.map(d => [
      d.name,
      d.sales.toFixed(2),
      d.commission.toFixed(2),
      d.percentage,
      d.active ? \"Ativo\" : \"Inativo\"
    ]);
    const csvContent = \"data:text/csv;charset=utf-8,\" + 
      [headers, ...rows].map(e => e.join(\",\")).join(\"\\n\");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement(\"a\");
    link.setAttribute(\"href\", encodedUri);
    link.setAttribute(\"download\", `comissoes_${viewMode}_${monthStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className=\"space-y-4\">
      <div className=\"flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background border p-4 rounded-xl shadow-sm\">
        <div className=\"flex flex-wrap items-center gap-4\">
          <div className=\"flex flex-col gap-1.5\">
            <label className=\"text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1\">
              <Calendar className=\"h-3 w-3\" /> Período Referência
            </label>
            <input 
              type=\"month\" 
              className=\"flex h-9 w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring\"
              value={monthStr}
              onChange={(e) => {
                const [y, m] = e.target.value.split(\"-\");
                if (y && m) {
                  setRefDate(new Date(parseInt(y), parseInt(m) - 1, 1));
                }
              }}
            />
          </div>
          
          <div className=\"flex flex-col gap-1.5\">
            <label className=\"text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1\">
              <TrendingUp className=\"h-3 w-3\" /> Tipo de Cálculo
            </label>
            <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className=\"w-full\">
              <TabsList className=\"grid w-[240px] grid-cols-2 h-9\">
                <TabsTrigger value=\"monthly\" className=\"text-xs\">Por Mês</TabsTrigger>
                <TabsTrigger value=\"accumulated\" className=\"text-xs\">Acumulado</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className=\"flex items-end\">
          <Button variant=\"outline\" size=\"sm\" onClick={exportToCSV} className=\"h-9\">
            <Download className=\"h-4 w-4 mr-2 text-primary\" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <Card className=\"border-none shadow-md overflow-hidden\">
        <CardHeader className=\"bg-muted/30 border-b py-4 px-6\">
          <div className=\"flex items-center justify-between\">
            <div className=\"space-y-1\">
              <CardTitle className=\"text-lg font-bold flex items-center gap-2\">
                <Filter className=\"h-5 w-5 text-primary\" />
                Visualização de Comissões
              </CardTitle>
              <p className=\"text-xs text-muted-foreground\">
                Mostrando dados {viewMode === \"monthly\" ? \"do mês selecionado\" : \"acumulados desde o início do ano\"}
              </p>
            </div>
            <Badge variant={viewMode === \"monthly\" ? \"default\" : \"secondary\"} className=\"px-3 py-1\">
              {viewMode === \"monthly\" ? \"MENSAL\" : \"ACUMULADO JAN-\" + new Date(monthStr + \"-02\").toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className=\"p-0\">
          <div className=\"overflow-auto\">
            <Table>
              <TableHeader>
                <TableRow className=\"bg-muted/10\">
                  <TableHead className=\"cursor-pointer hover:bg-muted/20 transition-colors py-4 px-6\" onClick={() => handleSort('name')}>
                    <div className=\"flex items-center gap-2\">
                      Vendedor <ArrowUpDown className=\"h-3 w-3 text-muted-foreground\" />
                    </div>
                  </TableHead>
                  <TableHead className=\"text-right cursor-pointer hover:bg-muted/20 transition-colors py-4 px-6\" onClick={() => handleSort('sales')}>
                    <div className=\"flex items-center justify-end gap-2 text-primary\">
                      Vendas <ArrowUpDown className=\"h-3 w-3\" />
                    </div>
                  </TableHead>
                  <TableHead className=\"text-right cursor-pointer hover:bg-muted/20 transition-colors py-4 px-6\" onClick={() => handleSort('commission')}>
                    <div className=\"flex items-center justify-end gap-2 text-green-600\">
                      Comissão <ArrowUpDown className=\"h-3 w-3\" />
                    </div>
                  </TableHead>
                  <TableHead className=\"text-center py-4 px-4\">% Comis.</TableHead>
                  <TableHead className=\"text-center py-4 px-6\">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row) => (
                  <TableRow key={row.id} className=\"hover:bg-muted/5 transition-colors\">
                    <TableCell className=\"font-semibold py-4 px-6\">{row.name}</TableCell>
                    <TableCell className=\"text-right py-4 px-6 font-medium\">{fmt(row.sales)}</TableCell>
                    <TableCell className=\"text-right py-4 px-6 font-bold text-green-600\">{fmt(row.commission)}</TableCell>
                    <TableCell className=\"text-center py-4 px-4\">
                      <Badge variant=\"outline\" className=\"font-medium border-primary/20 text-primary\">{row.percentage}%</Badge>
                    </TableCell>
                    <TableCell className=\"text-center py-4 px-6\">
                      <Badge className={row.active 
                        ? \"bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20\" 
                        : \"bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20\"}>
                        {row.active ? \"Ativo\" : \"Inativo\"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className=\"h-40 text-center\">
                      <div className=\"flex flex-col items-center justify-center space-y-2\">
                        <Calendar className=\"h-10 w-10 text-muted-foreground/30\" />
                        <p className=\"text-muted-foreground\">Nenhum dado encontrado para o período selecionado.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter className=\"bg-primary/5\">
                <TableRow className=\"font-bold text-base\">
                  <TableCell className=\"py-4 px-6\">TOTAL GERAL</TableCell>
                  <TableCell className=\"text-right py-4 px-6 text-primary\">{fmt(totals.sales)}</TableCell>
                  <TableCell className=\"text-right py-4 px-6 text-green-700\">{fmt(totals.commission)}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
