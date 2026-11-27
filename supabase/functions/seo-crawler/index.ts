import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const TRACKING_PARAMS = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","msclkid"]);
// v1.3 (26 Nov 2026, owner-approved): images and other files are recorded as links but not queued as pages,
// and links found on pages that don't open (4xx/5xx) are not followed, so broken relative links can't fill the page budget.
const ASSET = /\.(webp|jpe?g|png|gif|svg|ico|bmp|avif|pdf|mp4|webm|mov|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot|zip)$/i;

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
// v1.2 (26 Nov 2026, owner-approved): the saved site and its www / non-www twin count as the same site,
// so a site saved as example.com can follow its redirect to www.example.com. Nothing else is allowed.
function sameSite(a: string, b: string) { const s = (h: string) => h.toLowerCase().replace(/^www\./, ""); return s(a) === s(b); }
function isPrivateLiteralHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function safeUrl(raw: string, allowedHostname: string) {
  let u: URL; try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (!["http:","https:"].includes(u.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  if (u.username || u.password) throw new Error("Credential-bearing URLs are not allowed");
  if (u.port && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443"))) throw new Error("Non-standard ports are not allowed");
  if (isPrivateLiteralHost(u.hostname)) throw new Error("Private/local hosts are not allowed");
  if (!sameSite(u.hostname, allowedHostname)) throw new Error("URL is outside the approved organization site");
  return u;
}
function normalizeUrl(raw: string) {
  const u = new URL(raw); u.hash = "";
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
  if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  const sorted = [...u.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b)); u.search = "";
  for (const [k,v] of sorted) u.searchParams.append(k,v);
  return u.toString();
}
function stripTags(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ").trim();
}
function attr(tag:string,name:string){ const re=new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'); const m=tag.match(re); return m?(m[1]??m[2]??m[3]??''):null; }
function firstTagContent(html:string,tag:string){ const m=html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i')); return m?stripTags(m[1]):null; }
function allTagContent(html:string,tag:string){ const out:string[]=[]; const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi'); let m:RegExpExecArray|null; while((m=re.exec(html))&&out.length<100){const t=stripTags(m[1]);if(t)out.push(t);} return out; }
function metaContent(html:string,selector:(tag:string)=>boolean){ const re=/<meta\b[^>]*>/gi; let m:RegExpExecArray|null; while((m=re.exec(html))) if(selector(m[0])) return attr(m[0],'content'); return null; }
function linkHref(html:string,relNeedle:string){ const re=/<link\b[^>]*>/gi; let m:RegExpExecArray|null; while((m=re.exec(html))){ const rel=(attr(m[0],'rel')??'').toLowerCase().split(/\s+/); if(rel.includes(relNeedle)) return attr(m[0],'href'); } return null; }
function extractSchema(html:string){ const types=new Set<string>(); const docs:unknown[]=[]; const re=/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m:RegExpExecArray|null; while((m=re.exec(html))&&docs.length<25){ try{ const parsed=JSON.parse(m[1].trim()); docs.push(parsed); const visit=(v:any)=>{ if(!v||typeof v!=='object')return; const t=v['@type']; if(typeof t==='string')types.add(t); else if(Array.isArray(t))t.forEach(x=>typeof x==='string'&&types.add(x)); if(Array.isArray(v))v.forEach(visit); else Object.values(v).forEach(visit); }; visit(parsed);}catch{} } return {docs,types:[...types]}; }
function extractLinks(html:string,base:URL,allowedHostname:string){ const links:any[]=[]; const re=/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi; let m:RegExpExecArray|null; while((m=re.exec(html))&&links.length<5000){ const raw=m[1]??m[2]??m[3]??''; if(!raw||/^(mailto:|tel:|javascript:|data:)/i.test(raw))continue; try{ const u=new URL(raw,base); if(!['http:','https:'].includes(u.protocol))continue; const rel=(attr(m[0],'rel')??'').toLowerCase().split(/\s+/).filter(Boolean); const normalized=normalizeUrl(u.toString()); links.push({url:u.toString(),normalized,scope:sameSite(u.hostname,allowedHostname)?'internal':'external',anchor:stripTags(m[4]??'').slice(0,1000),rel,nofollow:rel.includes('nofollow'),sponsored:rel.includes('sponsored'),ugc:rel.includes('ugc'),image:/<img\b/i.test(m[4]??'')}); }catch{} } return links; }
async function sha256(text:string){ const bytes=new TextEncoder().encode(text); const hash=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function fetchSafe(startUrl:string,allowedHostname:string){ let current=safeUrl(startUrl,allowedHostname); for(let i=0;i<6;i++){ const started=Date.now(); const res=await fetch(current,{redirect:'manual',headers:{'user-agent':'SalsysOS-SEO-Crawler/1.3 (+website-intelligence)','accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'},signal:AbortSignal.timeout(15000)}); if([301,302,303,307,308].includes(res.status)){ const loc=res.headers.get('location'); if(!loc)return{res,finalUrl:current,elapsed:Date.now()-started}; current=safeUrl(new URL(loc,current).toString(),allowedHostname); continue;} return{res,finalUrl:current,elapsed:Date.now()-started}; } throw new Error('Too many redirects'); }

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({error:'POST required'},405);
  const authHeader=req.headers.get('authorization'); if(!authHeader)return json({error:'Authorization required'},401);
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authHeader}}});
  const {data:userData,error:userError}=await userClient.auth.getUser(); if(userError||!userData.user)return json({error:'Invalid session'},401);
  const service=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  let body:any; try{body=await req.json();}catch{return json({error:'Invalid JSON'},400);}
  const action=String(body?.action??'start'); const budget=Math.min(Math.max(Number(body?.pageBudget??10),1),25); let run:any; let site:any;
  if(action==='start'){
    const siteId=String(body?.siteId??''); if(!siteId)return json({error:'siteId is required'},400);
    const {data:siteRow}=await service.from('organization_sites').select('id,organization_id,hostname,status').eq('id',siteId).eq('status','active').maybeSingle(); if(!siteRow)return json({error:'Active site not found'},404);
    const {data:membership}=await service.from('organization_members').select('organization_id').eq('organization_id',siteRow.organization_id).eq('user_id',userData.user.id).eq('active',true).maybeSingle(); if(!membership)return json({error:'Not authorized for organization'},403);
    site=siteRow; const root=safeUrl(String(body?.rootUrl??`https://${site.hostname}/`),site.hostname); const maxPages=Math.min(Math.max(Number(body?.maxPages??500),1),5000);
    const {data:created,error}=await service.from('seo_crawl_runs').insert({organization_id:site.organization_id,site_id:site.id,requested_root_url:root.toString(),crawl_mode:String(body?.crawlMode??'incremental'),status:'running',max_pages:maxPages,user_agent:'SalsysOS-SEO-Crawler/1.3',started_at:new Date().toISOString(),config:{initiated_by:userData.user.id}}).select('*').single(); if(error)return json({error:error.message},500); run=created;
    await service.from('seo_crawl_frontier').insert({organization_id:site.organization_id,site_id:site.id,crawl_run_id:run.id,url:root.toString(),normalized_url:normalizeUrl(root.toString()),depth:0});
  } else if(action==='resume'){
    const runId=String(body?.runId??''); if(!runId)return json({error:'runId is required'},400);
    const {data:runRow}=await service.from('seo_crawl_runs').select('*').eq('id',runId).maybeSingle(); if(!runRow)return json({error:'Crawl run not found'},404);
    const {data:membership}=await service.from('organization_members').select('organization_id').eq('organization_id',runRow.organization_id).eq('user_id',userData.user.id).eq('active',true).maybeSingle(); if(!membership)return json({error:'Not authorized for organization'},403);
    const {data:siteRow}=await service.from('organization_sites').select('id,organization_id,hostname,status').eq('id',runRow.site_id).eq('organization_id',runRow.organization_id).eq('status','active').maybeSingle(); if(!siteRow)return json({error:'Active site not found'},404); run=runRow; site=siteRow; await service.from('seo_crawl_runs').update({status:'running'}).eq('id',run.id);
  } else return json({error:'Unsupported action'},400);

  let processed=0;
  for(;processed<budget;processed++){
    const {data:item}=await service.from('seo_crawl_frontier').select('*').eq('crawl_run_id',run.id).eq('status','queued').order('depth',{ascending:true}).order('discovered_at',{ascending:true}).limit(1).maybeSingle(); if(!item)break;
    const {count:doneCount}=await service.from('seo_crawl_frontier').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id).eq('status','done'); if((doneCount??0)>=run.max_pages)break;
    await service.from('seo_crawl_frontier').update({status:'processing',attempt_count:item.attempt_count+1,started_at:new Date().toISOString()}).eq('id',item.id).eq('status','queued');
    try{
      const requested=safeUrl(item.url,site.hostname); const {res,finalUrl,elapsed}=await fetchSafe(requested.toString(),site.hostname); const ct=res.headers.get('content-type')??''; const html=ct.includes('text/html')||ct.includes('application/xhtml+xml')?await res.text():''; const finalNorm=normalizeUrl(finalUrl.toString());
      const canonicalHref=html?linkHref(html,'canonical'):null; const canonical=canonicalHref?new URL(canonicalHref,finalUrl).toString():null; const robots=html?metaContent(html,t=>(attr(t,'name')??'').toLowerCase()==='robots'):null; const xRobots=res.headers.get('x-robots-tag'); const noindex=/(^|[,\s])noindex([,\s]|$)/i.test(`${robots??''},${xRobots??''}`); const indexable=res.status>=200&&res.status<300&&ct.includes('html')&&!noindex;
      const text=html?stripTags(html):''; const schema=html?extractSchema(html):{docs:[],types:[]}; const h1s=html?allTagContent(html,'h1'):[]; const h2s=html?allTagContent(html,'h2'):[]; const h3s=html?allTagContent(html,'h3'):[]; const title=html?firstTagContent(html,'title'):null; const desc=html?metaContent(html,t=>(attr(t,'name')??'').toLowerCase()==='description'):null; const langMatch=html.match(/<html\b[^>]*\blang\s*=\s*["']?([^\s"'>]+)/i); const language=langMatch?.[1]??null;
      const {data:page,error:pageError}=await service.from('seo_pages').upsert({organization_id:run.organization_id,site_id:site.id,normalized_url:finalNorm,canonical_url:canonical,url_path:finalUrl.pathname+finalUrl.search,lifecycle_status:res.status===404?'missing':'active',last_seen_at:new Date().toISOString(),last_crawled_at:new Date().toISOString()},{onConflict:'organization_id,site_id,normalized_url'}).select('*').single(); if(pageError)throw pageError;
      const {error:snapshotError}=await service.from('seo_page_snapshots').upsert({organization_id:run.organization_id,site_id:site.id,page_id:page.id,crawl_run_id:run.id,fetched_url:item.url,final_url:finalUrl.toString(),fetched_at:new Date().toISOString(),http_status:res.status,response_time_ms:elapsed,content_type:ct,language,title,meta_description:desc,canonical_url:canonical,robots_meta:robots,x_robots_tag:xRobots,h1s,h2s,h3s,word_count:text?text.split(/\s+/).filter(Boolean).length:0,readable_text:text.slice(0,500000),text_hash:text?await sha256(text):null,html_hash:html?await sha256(html):null,content_fingerprint:html?await sha256(`${title??''}|${desc??''}|${h1s.join('|')}|${text.slice(0,20000)}`):null,schema_types:schema.types,structured_data:schema.docs,technical_flags:{has_title:!!title,has_meta_description:!!desc,h1_count:h1s.length,has_canonical:!!canonicalHref,has_json_ld:/application\/ld\+json/i.test(html)},is_indexable:indexable,indexability_reason:indexable?null:(noindex?'noindex':res.status>=300?`http_${res.status}`:!ct.includes('html')?'non_html':'not_indexable')},{onConflict:'page_id,crawl_run_id'}); if(snapshotError)throw snapshotError;
      await service.from('seo_page_links').delete().eq('crawl_run_id',run.id).eq('source_page_id',page.id);
      const links=html?extractLinks(html,finalUrl,site.hostname):[]; const unique=new Map<string,any>(); for(const l of links)if(!unique.has(`${l.normalized}|${l.anchor}|${l.rel.join(',')}`))unique.set(`${l.normalized}|${l.anchor}|${l.rel.join(',')}`,l); const rows:any[]=[];
      for(const l of [...unique.values()].slice(0,3000)){
        let targetPageId:null|string=null;
        if(l.scope==='internal'){
          const tu=new URL(l.normalized); const {data:tp}=await service.from('seo_pages').upsert({organization_id:run.organization_id,site_id:site.id,normalized_url:l.normalized,url_path:tu.pathname+tu.search,last_seen_at:new Date().toISOString()},{onConflict:'organization_id,site_id,normalized_url'}).select('id').single(); targetPageId=tp?.id??null;
          if(item.depth+1<=10&&res.status<400&&!ASSET.test(tu.pathname))await service.from('seo_crawl_frontier').upsert({organization_id:run.organization_id,site_id:site.id,crawl_run_id:run.id,url:l.url,normalized_url:l.normalized,depth:item.depth+1,source_page_id:page.id},{onConflict:'crawl_run_id,normalized_url',ignoreDuplicates:true});
        }
        rows.push({organization_id:run.organization_id,site_id:site.id,crawl_run_id:run.id,source_page_id:page.id,target_page_id:targetPageId,target_url:l.url,normalized_target_url:l.normalized,link_scope:l.scope,anchor_text:l.anchor,rel_values:l.rel,is_nofollow:l.nofollow,is_sponsored:l.sponsored,is_ugc:l.ugc,is_image_link:l.image});
      }
      if(rows.length){const {error:linkError}=await service.from('seo_page_links').insert(rows); if(linkError)throw linkError;}
      await service.from('seo_crawl_frontier').update({status:'done',completed_at:new Date().toISOString()}).eq('id',item.id);
    }catch(e){ await service.from('seo_crawl_frontier').update({status:'failed',last_error:String((e as Error)?.message??e).slice(0,2000),completed_at:new Date().toISOString()}).eq('id',item.id); }
  }
  const {count:discovered}=await service.from('seo_crawl_frontier').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id); const {count:fetched}=await service.from('seo_crawl_frontier').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id).eq('status','done'); const {count:failed}=await service.from('seo_crawl_frontier').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id).eq('status','failed'); const {count:queued}=await service.from('seo_crawl_frontier').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id).eq('status','queued'); const {count:indexable}=await service.from('seo_page_snapshots').select('*',{count:'exact',head:true}).eq('crawl_run_id',run.id).eq('is_indexable',true);
  const done=(queued??0)===0||(fetched??0)>=run.max_pages; const status=done?((failed??0)>0?'partial':'completed'):'running'; await service.from('seo_crawl_runs').update({status,pages_discovered:discovered??0,pages_fetched:fetched??0,pages_failed:failed??0,pages_indexable:indexable??0,completed_at:done?new Date().toISOString():null}).eq('id',run.id);
  return json({runId:run.id,status,processedThisInvocation:processed,pagesDiscovered:discovered??0,pagesFetched:fetched??0,pagesFailed:failed??0,pagesIndexable:indexable??0,pagesQueued:queued??0,version:'1.3'});
});

