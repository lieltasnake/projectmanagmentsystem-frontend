import psycopg2, os
from dotenv import load_dotenv
load_dotenv()
durl = os.getenv('DATABASE_URL')
if durl:
    conn = psycopg2.connect(durl)
else:
    conn = psycopg2.connect(host=os.getenv('DB_HOST','localhost'), port=os.getenv('DB_PORT','5432'), dbname=os.getenv('DB_NAME','pms_db'), user=os.getenv('DB_USER','postgres'), password=os.getenv('DB_PASSWORD','postgres'))
cur = conn.cursor()
for f in ['022_create_roles_catalog.sql','023_create_skills_catalog.sql']:
    with open(os.path.join('migrations',f), encoding='utf-8-sig') as fh:
        sql = fh.read()
    cur.execute('BEGIN')
    cur.execute(sql)
    cur.execute('INSERT INTO schema_migrations(filename) VALUES(%s) ON CONFLICT DO NOTHING', (f,))
    cur.execute('COMMIT')
    print('ok')
conn.close()

