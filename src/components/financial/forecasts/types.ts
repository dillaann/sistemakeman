import type { ForecastRecurrence } from "@/lib/forecast-recurrence";

export interface Forecast {
  id: string;
  description: string;
  type: "entrada" | "saida";
  amount: number;
  forecast_date: string;
  category: string | null;
  notes: string | null;
  recurrence: ForecastRecurrence;
  series_id: string | null;
  status: "previsto" | "baixado";
  settled_at: string | null;
  settled_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForecastFormValues {
  description: string;
  type: "entrada" | "saida";
  amount: string;
  forecast_date: string;
  recurrence: ForecastRecurrence;
  end_date: string;
  months: number[];
  category: string;
  notes: string;
}
