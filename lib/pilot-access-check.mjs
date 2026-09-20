// No credentials, proxy changes, browser impersonation, retries or model calls.
export async function checkPilotAccess(fetchImpl=fetch) {
 const observedAt=new Date().toISOString();
 try {
  const response=await fetchImpl('https://pi-research-agent.qiudao-pika.chatgpt.site/api/personalization-pilot',{
   method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15_000),redirect:'manual',
  });
  const type=response.headers.get('content-type')||'';
  const body=await response.text();
  let payload;try{payload=JSON.parse(body);}catch{/* The edge may return an HTML block page. */}
  const edgeBlocked=response.status===403&&/Attention Required!\s*\|\s*Cloudflare|Sorry, you have been blocked/i.test(body);
  const ready=response.status===401&&payload?.error==='unauthorized';
  const closed=response.status===410&&payload?.error==='experiment_closed';
  return {observedAt,ready,code:edgeBlocked?'cloudflare_blocked':closed?'experiment_closed':ready?'application_reachable':'unexpected_gateway_response',
   httpStatus:response.status,contentType:type,rayId:response.headers.get('cf-ray'),server:response.headers.get('server')};
 }catch{return {observedAt,ready:false,code:'network_unavailable',httpStatus:null,rayId:null};}
}
