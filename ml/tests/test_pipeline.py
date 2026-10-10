import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'eval'))
from extract_document import extract
from generate_dataset import generate,container_number
from model_store import root,inside,register,verify,reserve_destination
from compare import score


class PipelineTests(unittest.TestCase):
    def test_synthetic_splits_and_unanswerables(self):
        with tempfile.TemporaryDirectory(dir=root()/'eval') as directory:
            folder=Path(directory);summary=generate(folder,132)
            self.assertEqual(summary['total'],744)
            hashes=[]
            for split in ('train','validation','test'):
                rows=[json.loads(l) for l in (folder/f'{split}.jsonl').read_text(encoding='utf-8').splitlines()]
                self.assertEqual(sum(r['mode']=='general' for r in rows),sum(r['mode']=='logistics' for r in rows))
                qa=[r for r in rows if r['task']=='grounded_qa']
                self.assertGreaterEqual(sum(r['unanswerable'] for r in qa)/len(qa),0.2)
                self.assertTrue(all(r['customer_data'] is False for r in rows))
                from jsonschema import validate
                for row in rows:validate(row['target'],row['schema'])
                hashes.append({json.dumps(r['messages'][:2],sort_keys=True) for r in rows})
            self.assertFalse(hashes[0]&hashes[1]);self.assertFalse(hashes[0]&hashes[2]);self.assertFalse(hashes[1]&hashes[2])

    def test_container_check_digit_known_algorithm(self):
        letters=dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ',[10,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38]))
        for serial in (1,42,202600):
            number=container_number(serial);value=sum((int(c) if c.isdigit() else letters[c])*2**i for i,c in enumerate(number[:-1]))
            self.assertEqual(int(number[-1]),value%11%10)

    def test_multilingual_text_csv_and_eml(self):
        self.assertIn('الشحنة',extract('source.md','# Cargo\n\nالشحنة 48'.encode())[1]['text'])
        csv=extract('cargo.csv',b'kind,pieces\nboxes,48\n');self.assertEqual(csv[0]['reference']['rowStart'],2)
        email=extract('alert.eml',b'Subject: Delay\nContent-Type: text/plain; charset=utf-8\n\nShipment delayed.');self.assertIn('delayed',email[-1]['text'])
        with self.assertRaises(ValueError):extract('unsafe.msg',b'unknown')

    def test_docx_table_and_xlsx_sheet_references(self):
        from docx import Document
        d=Document();d.add_heading('Cargo',1);table=d.add_table(rows=2,cols=2);table.cell(0,0).text='Boxes';table.cell(1,0).text='48'
        stream=io.BytesIO();d.save(stream);blocks=extract('cargo.docx',stream.getvalue());self.assertTrue(any(b['table'] and b['reference']['heading']=='Cargo' for b in blocks))
        from openpyxl import Workbook
        w=Workbook();w.active.title='Cargo';w.active.append(['Pieces']);w.active.append([48]);stream=io.BytesIO();w.save(stream)
        blocks=extract('cargo.xlsx',stream.getvalue());self.assertEqual(blocks[1]['reference'],{'sheet':'Cargo','rowStart':2,'rowEnd':2})

    def test_text_pdf_page_reference(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
        writer=PdfWriter();page=writer.add_blank_page(400,400)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 10 350 Td (Shipment contains forty eight boxes in this test document.) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(content);stream=io.BytesIO();writer.write(stream)
        blocks=extract('cargo.pdf',stream.getvalue());self.assertEqual(blocks[0]['reference']['page'],1);self.assertIn('eight boxes',blocks[0]['text'])

    def test_external_artifact_integrity_and_untracked_safety(self):
        store=root()
        with tempfile.TemporaryDirectory(dir=store/'eval') as directory:
            file=Path(directory)/'model.txt';file.write_text('safe')
            relative=file.relative_to(store).as_posix()
            with self.assertRaises(RuntimeError):reserve_destination(store,relative)
            register(store,file,'test','test','none','MIT');self.assertEqual(verify(store,relative),file)
            file.write_text('corrupt')
            with self.assertRaises(RuntimeError):verify(store,relative)
            from model_store import manifest,save_manifest
            data=manifest(store);data['files']=[f for f in data['files'] if f['path']!=relative];save_manifest(store,data)
        with self.assertRaises(ValueError):inside(store,'../outside')

    def test_hallucination_metric_rejects_invalid_json_and_fabricated_citation(self):
        row={'task':'grounded_qa','unanswerable':True,'target':{'statements':[{'label':'NOT FOUND','text':'not found','citations':[]}]},'schema':{'type':'object'},'context':[]}
        self.assertEqual(score(row,'not JSON')['hallucination'],1)
        self.assertEqual(score(row,json.dumps(row['target']))['not_found_correct'],1)
        self.assertEqual(score(row,'{"statements":[{"label":"FACT","text":"invented","citations":["another-org"]}]}')['hallucination'],1)


if __name__=='__main__':unittest.main()
