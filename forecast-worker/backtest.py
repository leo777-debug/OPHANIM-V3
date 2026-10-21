"""Offline JSON replay or real DB history. Fixture reports never authorize activation."""
import argparse,json
from pathlib import Path
from panel import fit,InsufficientHistory

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--input');parser.add_argument('--output',default='backtest-report.json');args=parser.parse_args()
 rows=json.loads(Path(args.input).read_text()) if args.input else []
 try:
  model=fit(rows);result={'status':'candidate','data':'supplied offline snapshots; provenance must be verified','metrics':model.metrics}
 except InsufficientHistory as e:result={'status':'blocked','resolved_rows':len(rows),'reason':str(e),'accuracy_claim':False,'hormuz_shock_replay':'Not available without dated source snapshots and outcomes.'}
 Path(args.output).write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
