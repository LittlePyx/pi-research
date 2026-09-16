export type MailEnv={DB:D1Database;RESEND_API_KEY?:string;EMAIL_FROM?:string;EMAIL_SITE_URL?:string};
export const EMAIL_SITE_URL='https://pi-research-agent.qiudao-pika.chatgpt.site';
export function mailConfigured(env:MailEnv){return Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM);}
export function validEmail(value:unknown){return typeof value==='string'&&value.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);}
export function validSendTime(value:unknown){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function shanghaiDate(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,10);}
export function nextDigestAt(time:string,now=Date.now()){let at=Date.parse(`${shanghaiDate(now)}T${time}:00+08:00`);if(at<=now)at+=86400000;return at;}
export async function emailHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function escapeEmail(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export type MailPayload={from:string;to:string[];subject:string;html:string;text:string;headers?:Record<string,string>};
export async function sendMail(env:MailEnv,payload:MailPayload,key:string){
  if(!mailConfigured(env))throw Error('mail_not_configured');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
  if(!r.ok)throw Error(`mail_provider_${r.status}`);const data=await r.json() as {id?:string};if(!data.id)throw Error('mail_provider_invalid');return data.id;
}
type Subscription={id:string;space_id:string;email:string;enabled:number;verified_at:string|null;send_time:string;locale:string;unsubscribe_token:string;next_send_at:number};
export async function composeDigest(env:MailEnv,sub:Subscription,date:string):Promise<MailPayload> {
  const name=await env.DB.prepare('SELECT name FROM research_spaces WHERE id=?').bind(sub.space_id).first<{name:string}>();
  const brief=await env.DB.prepare("SELECT paper_ids FROM monitor_daily_briefs WHERE space_id=? AND brief_date=? AND status='ready'").bind(sub.space_id,date).first<{paper_ids:string}>();
  const papers=brief?await env.DB.prepare(`SELECT p.title,p.url,i.summary_zh,i.summary_en,i.why_read_zh,i.why_read_en FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id WHERE p.space_id=? AND p.id IN(SELECT value FROM json_each(?)) AND i.ever_recommended=1 AND i.verification_status IN ('verified','revised') AND i.verification_coverage_score>=70 AND NOT EXISTS(SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant') ORDER BY i.quality_score DESC,p.id LIMIT 8`).bind(sub.space_id,brief.paper_ids).all<{title:string;url:string;summary_zh:string;summary_en:string;why_read_zh:string;why_read_en:string}>():{results:[]};
  const zh=sub.locale==='zh',site=env.EMAIL_SITE_URL||EMAIL_SITE_URL,unsub=`${site}/api/email-subscription/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
  const headline=`${name?.name||'Pi Research'} · ${date} · ${zh?'每日研究简报':'Daily research digest'}`;
  const intro=papers.results.length?(zh?'今天值得阅读的论文':'Papers selected for today'):brief?(zh?'今日简报暂无可发送的已核验推荐。':'No verified recommendations are available for this digest.'):(zh?'截至发送时，今日简报尚未就绪。可在网站查看最新研究进展；此邮件没有重复发送旧日推荐。':'Today’s digest is not ready at send time. Visit the workspace for progress; older recommendations have not been repeated.');
  const text=[headline,intro,...papers.results.map(p=>`${p.title}\n${zh?p.summary_zh:p.summary_en}\n${zh?p.why_read_zh:p.why_read_en}\n${/^https?:\/\//.test(p.url)?p.url:''}`),`${zh?'打开研究空间':'Open workspace'}: ${site}/#today`,`${zh?'管理订阅或退订':'Manage or unsubscribe'}: ${unsub}`].join('\n\n');
  const html=`<main style="max-width:640px;margin:auto;font:16px/1.7 Arial,sans-serif;color:#20303c"><h1 style="font-size:24px">${escapeEmail(headline)}</h1><p>${escapeEmail(intro)}</p>${papers.results.map(p=>`<article style="border-top:1px solid #dce4e9;padding:18px 0"><h2 style="font-size:18px">${escapeEmail(p.title)}</h2><p>${escapeEmail(zh?p.summary_zh:p.summary_en)}</p><p>${escapeEmail(zh?p.why_read_zh:p.why_read_en)}</p>${/^https?:\/\//.test(p.url)?`<a href="${escapeEmail(p.url)}">${zh?'阅读原文':'Read original'}</a>`:''}</article>`).join('')}<p><a href="${site}/#today">${zh?'打开 Pi Research':'Open Pi Research'}</a></p><hr><p style="font-size:13px">${zh?'你已订阅此研究空间的每日简报。':'You subscribed to this workspace’s daily digest.'} <a href="${unsub}">${zh?'退订':'Unsubscribe'}</a></p></main>`;
  return {from:env.EMAIL_FROM||'',to:[sub.email],subject:headline,html,text,headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
export async function runEmailDigests(env:MailEnv,now=Date.now()) {
  if(!mailConfigured(env))return {configured:false,sent:0};
  const due=await env.DB.prepare('SELECT * FROM email_subscriptions WHERE enabled=1 AND verified_at IS NOT NULL AND next_send_at<=? ORDER BY next_send_at LIMIT 5').bind(now).all<Subscription>();let sent=0;
  for(const sub of due.results){
    const date=shanghaiDate(now),id=`${sub.id}:${date}`;
    let delivery=await env.DB.prepare('SELECT * FROM email_deliveries WHERE id=?').bind(id).first<{status:string;payload_json:string;created_at:number}>();
    if(!delivery){const payload=await composeDigest(env,sub,date);await env.DB.prepare('INSERT OR IGNORE INTO email_deliveries(id,subscription_id,delivery_date,payload_json,created_at) VALUES (?,?,?,?,?)').bind(id,sub.id,date,JSON.stringify(payload),now).run();delivery=await env.DB.prepare('SELECT * FROM email_deliveries WHERE id=?').bind(id).first<{status:string;payload_json:string;created_at:number}>();}
    if(!delivery)continue;
    if(['sent','cancelled','expired'].includes(delivery.status)||now-delivery.created_at>=20*3600000){await env.DB.batch([env.DB.prepare("UPDATE email_deliveries SET status=CASE WHEN status='sent' THEN status ELSE 'expired' END WHERE id=?").bind(id),env.DB.prepare('UPDATE email_subscriptions SET next_send_at=? WHERE id=?').bind(nextDigestAt(sub.send_time,now),sub.id)]);continue;}
    const payload=JSON.parse(delivery.payload_json) as MailPayload;
    const claim=await env.DB.prepare("UPDATE email_deliveries SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','retry','sending') AND lease_until<=? AND retry_at<=? AND EXISTS(SELECT 1 FROM email_subscriptions s WHERE s.id=subscription_id AND s.enabled=1 AND s.email=? AND s.verified_at IS NOT NULL)").bind(now+60000,id,now,now,payload.to[0]).run();
    if(!claim.meta.changes)continue;
    try{const provider=await sendMail(env,payload,id);await env.DB.batch([env.DB.prepare("UPDATE email_deliveries SET status='sent',sent_at=?,provider_id=?,lease_until=0,error='' WHERE id=?").bind(now,provider,id),env.DB.prepare('UPDATE email_subscriptions SET next_send_at=? WHERE id=? AND email=?').bind(nextDigestAt(sub.send_time,now),sub.id,payload.to[0])]);sent++;}
    catch(e){await env.DB.prepare("UPDATE email_deliveries SET status='retry',lease_until=0,retry_at=?,error=? WHERE id=?").bind(now+1800000,e instanceof Error?e.message:'mail_failed',id).run();}
  }
  return {configured:true,sent};
}
