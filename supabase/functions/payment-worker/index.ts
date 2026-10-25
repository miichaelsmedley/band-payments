// Deployment boundary only. Never lease a job until a real approved adapter exists.
// Do not provision Cron until the provider integration and operational review pass.
import { configuredProvider } from '../../../src/lib/provider.ts';
Deno.serve(async (request:Request)=>{
  const secret=Deno.env.get('BAND_WORKER_SECRET');
  const expected=secret?await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`Bearer ${secret}`)):null;
  const received=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('authorization')??''));
  let difference=0;
  if(expected)for(let i=0;i<32;i++)difference|=new Uint8Array(expected)[i]^new Uint8Array(received)[i];
  if(!expected||difference!==0)return new Response('Unauthorised',{status:401});
  try{configuredProvider();}catch{return Response.json({code:'provider_unavailable',leased:0,submitted:0},{status:503});}
  return Response.json({code:'adapter_implementation_required'},{status:503});
});
