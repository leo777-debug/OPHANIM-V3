"""Bounded synthetic extractor probes; no customer files, OCR, models or network."""
import importlib.metadata
import io
import json
from pathlib import Path
import socket
import struct
import sys
import time
import unittest
from unittest.mock import patch
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'ml' / 'scripts'))
from extract_document import extract  # noqa: E402


class ExtractorSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.network = patch.object(socket.socket, 'connect', side_effect=AssertionError('Extractor tests cannot contact a network.'))
        cls.network.start()

    @classmethod
    def tearDownClass(cls):
        cls.network.stop()

    def test_plain_text_positive_control(self):
        self.assertEqual(extract('synthetic.txt', b'SYNTHETIC shipment has 48 boxes.')[0]['text'], 'SYNTHETIC shipment has 48 boxes.')

    def test_unsupported_type(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported format'):
            extract('synthetic.exe', b'not executable fixture')

    def test_invalid_utf8(self):
        with self.assertRaises(UnicodeDecodeError):
            extract('synthetic.txt', b'\xff\xfe\xff')

    def test_text_limit(self):
        with self.assertRaisesRegex(ValueError, 'text exceeds limit'):
            extract('synthetic.txt', b'x' * 8_000_001)

    def test_renamed_and_truncated_office_archives(self):
        for name in ('synthetic.xlsx', 'synthetic.docx'):
            with self.subTest(name=name), self.assertRaises(zipfile.BadZipFile):
                extract(name, b'%PDF synthetic non-zip fixture')

    def test_compressed_office_member_limit_before_parser(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('synthetic.xml', b'x' * (32 * 1024**2 + 1))
        self.assertLess(len(stream.getvalue()), 100_000)
        for name in ('synthetic.xlsx', 'synthetic.docx'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'archive exceeds extraction limits'):
                extract(name, stream.getvalue())

    def test_broken_pdf_rejected(self):
        from pypdf.errors import PdfReadError
        with self.assertRaises(PdfReadError):
            extract('synthetic.pdf', b'%PDF-1.7\ntruncated synthetic fixture')

    def test_pdf_page_limit_before_text_or_ocr(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        for _ in range(201):
            writer.add_blank_page(width=72, height=72)
        stream = io.BytesIO()
        writer.write(stream)
        self.assertLess(len(stream.getvalue()), 100_000)
        with self.assertRaisesRegex(ValueError, 'PDF exceeds 200-page limit'):
            extract('synthetic.pdf', stream.getvalue())

    def test_corrupt_image(self):
        from PIL import UnidentifiedImageError
        with self.assertRaises(UnidentifiedImageError):
            extract('synthetic.png', b'not a PNG; synthetic fixture')

    def test_extreme_image_dimensions_before_allocation_or_ocr(self):
        from PIL import Image
        def chunk(kind, payload):
            return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
        data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1_000_000, 1_000_000, 8, 2, 0, 0, 0))
        data += chunk(b'IDAT', zlib.compress(b'\x00\x00\x00\x00')) + chunk(b'IEND', b'')
        self.assertLess(len(data), 200)
        with self.assertRaises(Image.DecompressionBombError):
            extract('synthetic.png', data)


if __name__ == '__main__':
    start = time.monotonic()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ExtractorSafety))
    versions = {name: importlib.metadata.version(name) for name in ('pypdf', 'Pillow')}
    report = {
        'testsRun': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
        'passed': result.wasSuccessful(), 'elapsedSeconds': round(time.monotonic() - start, 3),
        'runtime': {'python': sys.version.split()[0], **versions},
        'scope': 'Bounded in-memory synthetic fixtures, network blocked. No actual OCR or arbitrary hostile-PDF memory/CPU certification.',
        'limitation': 'Bundled test parsers differ from ml/requirements.txt (pypdf 6.1.1, Pillow 11.3.0); pinned deployment runtime still needs testing.',
    }
    (ROOT / 'STRESS_TEST' / 'artifacts' / 'extraction-safety.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    sys.exit(0 if result.wasSuccessful() else 1)
