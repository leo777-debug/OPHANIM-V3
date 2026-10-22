import {configured} from './policy.mjs';
(async()=>{try{
 if(!configured(process.env.INTEL_API_TOKEN)){process.exitCode=1;return;}
 const configuredPort=Number(process.env.INTEL_PORT||4000);
 const port=Number.isInteger(configuredPort)&&configuredPort>=1&&configuredPort<=65535?configuredPort:4000;
 const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(3000),redirect:'error',headers:{Authorization:`Bearer ${process.env.INTEL_API_TOKEN}`}});
 await response.body?.cancel();process.exitCode=response.ok?0:1;
}catch{process.exitCode=1;}})();
