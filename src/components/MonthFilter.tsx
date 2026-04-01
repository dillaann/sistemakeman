import { parseLocalDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PeriodMode = "month" | "trimestre" | "semestre" | "ano";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface MonthFilterProps {
  refDate: Date;
  onRefDateChange: (d: Date) => void;
  periodMode: PeriodMode;
  onPeriodModeChange: (m: PeriodMode) => void;
}

export function getDateRange(refDate: Date, mode: PeriodMode): { start: Date; end: Date } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  switch (mode) {
    case "month":
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    case "trimestre": {
      const qStart = Math.floor(m / 3) * 3;
      return { start: new Date(y, qStart, 1), end: new Date(y, qStart + 3, 0, 23, 59, 59, 999) };
    }
    case "semestre": {
      const sStart = m < 6 ? 0 : 6;
      return { start: new Date(y, sStart, 1), end: new Date(y, sStart + 6, 0, 23, 59, 59, 999) };
    }
    case "ano":
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
  }
}

export function isInRange(dateStr: string | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  const d = parseLocalDate(dateStr);
  if (!d) return false;
  return d >= range.start && d <= range.end;
}

function getLabel(refDate: Date, mode: PeriodMode): string {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  switch (mode) {
    case "month":
      return `${MONTH_NAMES[m]} ${y}`;
    case "trimestre": {
      const q = Math.floor(m / 3) + 1;
      return `${q}º Trimestre ${y}`;
    }
    case "semestre": {
      const s = m < 6 ? 1 : 2;
      return `${s}º Semestre ${y}`;
    }
    case "ano":
      return `Ano ${y}`;
  }
}

function step(refDate: Date, mode: PeriodMode, dir: 1 | -1): Date {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  switch (mode) {
    case "month":
      return new Date(y, m + dir, 1);
    case "trimestre":
      return new Date(y, m + 3 * dir, 1);
    case "semestre":
      return new Date(y, m + 6 * dir, 1);
    case "ano":
      return new Date(y + dir, m, 1);
  }
}

const MonthFilter = ({ refDate, onRefDateChange, periodMode, onPeriodModeChange }: MonthFilterProps) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRefDateChange(step(refDate, periodMode, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium px-2 min-w-[140px] text-center">
          {getLabel(refDate, periodMode)}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRefDateChange(step(refDate, periodMode, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Select value={periodMode} onValueChange={(v) => onPeriodModeChange(v as PeriodMode)}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Mensal</SelectItem>
          <SelectItem value="trimestre">Trimestre</SelectItem>
          <SelectItem value="semestre">Semestre</SelectItem>
          <SelectItem value="ano">Ano</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default MonthFilter;
