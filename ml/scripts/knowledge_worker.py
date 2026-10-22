"""Self-hosted queue scheduler. Files and job state stay in the web service/DB."""
import json
import os
import time
import urllib.request

if __name__ == '__main__':
    url=os.environ.get('KNOWLEDGE_WORKER_URL','http://ophanim:3000/api/knowledge/cron')
    secret=os.environ.get('KNOWLEDGE_CRON_SECRET')
    if not secret:raise RuntimeError('KNOWLEDGE_CRON_SECRET is required')
    while True:
        try:
            request=urllib.request.Request(url,headers={'Authorization':'Bearer '+secret})
            with urllib.request.urlopen(request,timeout=1800) as response:
                result=json.load(response)
            print(json.dumps(result),flush=True)
        except Exception as error:
            # Never log a request object, bearer token, document or server body.
            print('Knowledge worker request failed: '+type(error).__name__,flush=True)
        time.sleep(60)
