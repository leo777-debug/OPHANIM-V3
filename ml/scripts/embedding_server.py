"""CPU-only OpenAI-compatible embeddings, verified external-disk weights.

Pooling follows Qwen's published last-token + L2-normalisation example.
No network model download is allowed; all inputs stay on this server.
"""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pretrain import verified_base
from model_store import root


def serve(args):
    store = root(256 * 1024**2)
    model_id = 'Qwen/Qwen3-Embedding-0.6B'
    folder, revision = verified_base(store, args.model_path, model_id)
    import torch
    from transformers import AutoModel, AutoTokenizer
    import torch.nn.functional as functional
    torch.set_num_threads(args.threads)
    tokenizer = AutoTokenizer.from_pretrained(folder, padding_side='left', local_files_only=True, trust_remote_code=False)
    model = AutoModel.from_pretrained(folder, torch_dtype=torch.float32, device_map='cpu', attn_implementation='sdpa', local_files_only=True, trust_remote_code=False).eval()
    secret = os.environ.get('EMBEDDING_API_KEY', '')
    if args.host not in ('127.0.0.1', 'localhost', '::1') and not secret:
        raise RuntimeError('Non-loopback embedding service requires EMBEDDING_API_KEY')

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup(); self.connection.settimeout(30)
        def log_message(self, format_, *values):
            pass  # Do not log document text or credentials.
        def respond(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        def authorised(self):
            if secret:
                import hmac
                return hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {secret}')
            return True
        def do_GET(self):
            if not self.authorised(): return self.respond(401, {'error': 'Authentication required'})
            if self.path == '/v1/models': return self.respond(200, {'object': 'list', 'data': [{'id': args.alias, 'object': 'model', 'owned_by': 'local', 'revision': revision}]})
            if self.path == '/health': return self.respond(200, {'ready': True, 'model': model_id, 'version': revision, 'path': str(folder), 'checksum_verified': True})
            return self.respond(404, {'error': 'Not found'})
        def do_POST(self):
            if not self.authorised(): return self.respond(401, {'error': 'Authentication required'})
            if self.path != '/v1/embeddings': return self.respond(404, {'error': 'Not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 100_000: raise ValueError('Request exceeds 100 KB')
                body = json.loads(self.rfile.read(size))
                if body.get('model') != args.alias: raise ValueError('Unknown model')
                if body.get('dimensions', 1024) != 1024: raise ValueError('This index requires 1024 dimensions')
                texts = body.get('input')
                if isinstance(texts, str): texts = [texts]
                if not isinstance(texts, list) or not 1 <= len(texts) <= 8 or any(not isinstance(t, str) or not t.strip() or len(t) > 12_000 for t in texts):
                    raise ValueError('Supply 1–8 nonempty strings, at most 12,000 characters each')
                vectors = []; tokens = 0
                for index, text in enumerate(texts):
                    encoded = tokenizer(text, return_tensors='pt', add_special_tokens=True)
                    if encoded['input_ids'].shape[1] > 4096: raise ValueError('Input exceeds 4096 tokens; chunk it without truncation')
                    with torch.inference_mode():
                        hidden = model(**encoded).last_hidden_state[:, -1]
                        vector = functional.normalize(hidden.float(), p=2, dim=1)[0]
                    if not torch.isfinite(vector).all() or vector.shape[0] != 1024: raise RuntimeError('Invalid model embedding')
                    tokens += encoded['input_ids'].shape[1]
                    vectors.append({'object': 'embedding', 'index': index, 'embedding': vector.tolist()})
                return self.respond(200, {'object': 'list', 'model': args.alias, 'data': vectors, 'usage': {'prompt_tokens': tokens, 'total_tokens': tokens}})
            except (ValueError, TypeError, KeyError):
                return self.respond(400, {'error': 'Invalid embedding request; check model, dimensions, batch size and input lengths'})
            except Exception:
                return self.respond(500, {'error': 'Local embedding computation failed'})

    server = HTTPServer((args.host, args.port), Handler)
    print(f'Embedding service ready: http://{args.host}:{args.port}/v1; verified {folder}; revision {revision}', flush=True)
    try: server.serve_forever()
    finally: server.server_close()


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--model-path', default='embeddings/Qwen--Qwen3-Embedding-0.6B')
    p.add_argument('--alias', default='Qwen/Qwen3-Embedding-0.6B')
    p.add_argument('--host', default='127.0.0.1'); p.add_argument('--port', type=int, default=18081)
    p.add_argument('--threads', type=int, default=4)
    serve(p.parse_args())
