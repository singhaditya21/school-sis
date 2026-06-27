import sys

file_path = "drizzle/0000_init_native_postgres.sql"
with open(file_path, "r") as f:
    content = f.read()

content = content.replace("vector(768)", "text")
# Also remove CREATE EXTENSION IF NOT EXISTS vector; just in case
content = content.replace("CREATE EXTENSION IF NOT EXISTS vector;\n", "")

with open(file_path, "w") as f:
    f.write(content)
