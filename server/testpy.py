import psycopg2
conn = psycopg2.connect(host='localhost', port=5432, dbname='pms_db', user='postgres', password='postgres')
cur = conn.cursor()
cur.execute(\"SELECT lower('X')\")
print(cur.fetchone())
conn.close()
