"""Private optional container service. Never publish port 8088 to the Internet."""
import base64
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from extract_document import extract


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass  # Do not log document names/content.
    def do_POST(self):
        secret=os.environ.get('KNOWLEDGE_CRON_SECRET')
        if self.path!='/extract' or not secret or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+secret):
            self.send_error(403);return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<15*1024**2:raise ValueError('Input exceeds limit')
            request=json.loads(self.rfile.read(length));data=base64.b64decode(request['content_base64'],validate=True)
            if len(data)>10*1024**2:raise ValueError('File exceeds limit')
            payload=json.dumps({'blocks':extract(request['file_name'],data)},ensure_ascii=False).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        except Exception:
            self.send_error(422,'Offline extraction failed; verify format and OCR installation')


if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',8088),Handler).serve_forever()
