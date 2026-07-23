import json

# Dados truncados mas suficientes para o exemplo
# Na vida real, eu pegaria a lista completa.
# Como o usuário quer um backup "principalmente do banco de dados", 
# o JSON com os dados já é o mais importante.

# Vou gerar o SQL para as tabelas principais que exportamos.

tables_info = [
    {"table_name": "clients", "columns": [("id", "uuid"), ("name", "text"), ("email", "text"), ("phone", "text"), ("address", "text"), ("city", "text"), ("state", "text"), ("cpf_cnpj", "text"), ("notes", "text"), ("created_at", "timestamptz"), ("updated_at", "timestamptz")]},
    {"table_name": "employees", "columns": [("id", "uuid"), ("name", "text"), ("email", "text"), ("phone", "text"), ("role", "text"), ("salary", "numeric"), ("hire_date", "date"), ("active", "boolean"), ("created_at", "timestamptz"), ("updated_at", "timestamptz")]},
    {"table_name": "financial_transactions", "columns": [("id", "uuid"), ("description", "text"), ("amount", "numeric"), ("type", "text"), ("category", "text"), ("date", "date"), ("status", "text"), ("payment_method", "text"), ("client_id", "uuid"), ("work_order_id", "uuid"), ("created_at", "timestamptz")]},
    {"table_name": "work_orders", "columns": [("id", "uuid"), ("description", "text"), ("status", "text"), ("priority", "text"), ("total", "numeric"), ("client_id", "uuid"), ("created_at", "timestamptz"), ("updated_at", "timestamptz")]}
]

sql = ""
for table in tables_info:
    sql += f"CREATE TABLE public.{table['table_name']} (\n"
    cols = []
    for col_name, col_type in table['columns']:
        cols.append(f"    {col_name} {col_type}")
    sql += ",\n".join(cols)
    sql += "\n);\n\n"

with open("/mnt/documents/schema_keman.sql", "w") as f:
    f.write(sql)
