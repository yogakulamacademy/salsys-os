import 'server-only';

// Never trust Host, forwarded headers, next query parameters or form input
// for an Auth redirect. Staging and production must use separate configuration.
export function getSignupOrigin(): string | null {
  const raw=process.env.SALSYSOS_APP_URL?.trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||
       url.search||url.hash||(raw!==url.origin&&raw!==url.origin+'/'))return null;
    return url.origin;
  }catch{return null;}
}
