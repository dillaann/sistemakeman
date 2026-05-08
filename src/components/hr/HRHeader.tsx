import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface HRHeaderProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
}

const HRHeader = ({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear }: HRHeaderProps) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-lg border">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">RH & Folha de Pagamento</h1>
        <p className="text-muted-foreground text-sm">Gestão de colaboradores, adiantamentos e fechamentos.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mês de Referência</Label>
          <input 
            type="month" 
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(e.target.value)} 
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Ano (13º)</Label>
          <select 
            className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
            value={selectedYear} 
            onChange={e => setSelectedYear(Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

export default HRHeader;
