import { backendUnavailable, backendUrl, proxyHeaders } from '../_proxy';

export async function GET(request:Request) {
  const url=backendUrl('/api/session');
  if(!url)return backendUnavailable();
  try {
    const response=await fetch(url,{headers:proxyHeaders(request)});
    return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  } catch {
    return backendUnavailable();
  }
}
