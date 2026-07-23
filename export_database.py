import os
import json
import requests
import base64
from datetime import datetime

# Nota: O VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão no ambiente
URL = os.environ.get("VITE_SUPABASE_URL")
KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")

def fetch_table_data(table_name):
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}"
    }
    # Usando o PostgREST do Supabase para pegar os dados
    response = requests.get(f"{URL}/rest/v1/{table_name}?select=*", headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        # Se falhar via API direta (devido a RLS), retornaremos um marcador
        return f"Error {response.status_code}: {response.text}"

tables = [
    "financial_transactions", "purchases", "quote_items", "purchase_orders", 
    "quotes", "work_order_items", "clients", "work_orders", "production", 
    "sales", "sales_commissions", "fiscal_invoices", "monthly_closings", 
    "weekly_closings", "employees", "suppliers", "financial_categories",
    "profiles", "user_roles", "paint_sheets", "paint_sheet_items",
    "inventory_receipts", "employee_saturdays", "employee_overtime",
    "salary_installments"
]

backup = {
    "metadata": {
        "timestamp": datetime.now().isoformat(),
        "project": "Sistema Keman"
    },
    "tables": {}
}

for table in tables:
    print(f"Exporting {table}...")
    backup["tables"][table] = fetch_table_data(table)

output_file = "/mnt/documents/backup_sistema_keman.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(backup, f, indent=2, ensure_ascii=False)

print(f"Backup saved to {output_file}")
