import { backendUnavailable, backendUrl, proxyHeaders } from '../_proxy';

export async function POST(request:Request) {
  const url=backendUrl('/api/login');
  if(!url)return backendUnavailable();
  try {
    const response=await fetch(url,{method:'POST',headers:proxyHeaders(request,true),body:await request.text()});
    return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  } catch {
    return backendUnavailable();
  }
}
