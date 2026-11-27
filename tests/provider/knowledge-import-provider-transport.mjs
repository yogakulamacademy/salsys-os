// Disposable test transport only. No application or hosted credential handling.
export const FIXTURE_API_ORIGIN='http://127.0.0.1:54321';
const allowedHost=h=>h==='127.0.0.1'||h==='localhost';
const reject=()=>{throw Error('fixture transport destination rejected');};
export function fixtureApiUrl(value){
 let u;try{u=new URL(value);}catch{reject();}
 if(u.protocol!=='http:'||!allowedHost(u.hostname)||u.port!=='54321'||u.username||u.password||u.hash)reject();
 u.hostname='127.0.0.1';return u;
}
export function validateFixtureStatus(status){
 if(!status||typeof status.API_URL!=='string'||typeof status.DB_URL!=='string')reject();
 const api=fixtureApiUrl(status.API_URL);
 if(api.origin!==FIXTURE_API_ORIGIN||api.pathname!=='/'||api.search)reject();
 let db;try{db=new URL(status.DB_URL);}catch{reject();}
 if(!['postgres:','postgresql:'].includes(db.protocol)||!allowedHost(db.hostname)||db.port!=='54322'||db.pathname!=='/postgres'||db.username!=='postgres'||!db.password||db.search||db.hash)reject();
 db.hostname='127.0.0.1';return db;
}
export function createFixtureFetch(transport=globalThis.fetch){
 return async (input,init)=>{
  // Validate Request input as well as URL/string input; never follow redirects.
  const req=new Request(input,init),u=fixtureApiUrl(req.url);
  if(u.origin!==FIXTURE_API_ORIGIN||req.url!==u.href)reject();
  if(req.headers.has('host')||req.headers.has('proxy-authorization')||req.headers.has('forwarded')||req.headers.has('x-forwarded-host'))reject();
  return transport(req,{redirect:'error'});
 };
}
