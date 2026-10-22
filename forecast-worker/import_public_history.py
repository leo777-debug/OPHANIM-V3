"""Import licensed public numerical history; never crawl sources or infer licences.

CSV: source,metric,location_code,observed_at,value,licence. Availability defaults
to import time, so imported history cannot pretend to have been known earlier.
"""
import argparse,csv,math
from datetime import datetime,timezone
from urllib.parse import urlparse
from psycopg.types.json import Jsonb
from panel import FEATURES
from service import connect

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('csv_file');args=parser.parse_args();rows=[]
 with open(args.csv_file,encoding='utf-8-sig',newline='') as f:
  for i,row in enumerate(csv.DictReader(f),2):
   source=urlparse(row.get('source',''));metric=row.get('metric','');licence=row.get('licence','').strip();location=row.get('location_code','').strip()
   observed=datetime.fromisoformat(row['observed_at']);value=float(row['value'])
   if source.scheme!='https' or not source.hostname or source.username or metric not in FEATURES or not licence or not location or not math.isfinite(value) or not observed.tzinfo or observed>datetime.now(timezone.utc):raise ValueError(f'Invalid public metric/provenance at CSV row {i}')
   rows.append((row['source'],metric,location,observed,Jsonb(value),licence))
 with connect() as c:
  for row in rows:c.execute("""insert into ophanim_public_history(source,metric,location_code,observed_at,value,licence)
   values(%s,%s,%s,%s,%s,%s) on conflict(source,metric,location_code,observed_at) do nothing""",row)
 print(f'Imported {len(rows)} public metric records; availability stamped at import. Source rights remain the importer\'s responsibility.')
