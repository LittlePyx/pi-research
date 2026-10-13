import {normalizeWorkTitle} from './discovery/arxiv';
export type PaperFigure={url:string;caption:string;sourceUrl:string};
export function figureArxivId(url:string,doi:string|null) {
 let path='';
 try {const u=new URL(url);if(u.protocol==='https:'&&u.hostname==='arxiv.org')path=u.pathname.replace(/^\/(?:abs|pdf|html)\//,'').replace(/\.pdf$/,'')}catch{ /* A DOI can still identify an arXiv paper when its URL is absent or invalid. */ }
 if(!path&&doi?.toLowerCase().startsWith('10.48550/arxiv.'))path=doi.slice(15);
 return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/.test(path)?path:'';
}
function plain(value:string) {
 return value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'').replace(/\s+/g,' ').trim();
}
function attribute(tag:string,name:string) {return tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']*)["\']','i'))?.[1]||''}
export function firstArxivFigure(html:string,id:string,title:string):PaperFigure|null {
 const sourceUrl='https://arxiv.org/html/'+id;
 const meta=(html.match(/<meta\b[^>]*>/gi)||[]).find(tag=>attribute(tag,'name')==='citation_title');
 const heading=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'';
 if(normalizeWorkTitle(plain(meta?attribute(meta,'content'):heading))!==normalizeWorkTitle(title))return null;
 // Only the first numbered figure; never take a logo, table, or later figure.
 const block=(html.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi)||[]).find(item=>/^Figure\s*1\b/i.test(plain(item.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]||'')));
 if(!block)return null;
 const images=block.match(/<img\b[^>]*>/gi)||[];
 if(images.length!==1)return null; // Do not silently discard panels of a compound figure.
 const caption=plain(block.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]||'');
 if(!/^Figure\s+1\b/i.test(caption))return null;
 try {
  const image=new URL(attribute(images[0],'src'),sourceUrl+'/');
  const documentId=id.replace(/v\d+$/,'');
  const imageDocument=image.pathname.slice(6).replace(/\/[^/]+$/,'').replace(/v\d+$/,'');
  if(image.protocol!=='https:'||image.hostname!=='arxiv.org'||image.username||image.password||image.port||imageDocument!==documentId||!/^\/(?:html)\/[\w./-]+\.(?:png|jpe?g|webp|svg)$/i.test(image.pathname))return null;
  return {url:image.href,caption:caption.slice(0,2000),sourceUrl:sourceUrl+'#'+(attribute(block.split('>')[0],'id')||'')};
 }catch{return null}
}
export async function boundedFigureHtml(response:Response) {
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||!response.body)return '';
 const reader=response.body.getReader();let length=0;const parts:Uint8Array[]=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2_000_000){await reader.cancel();return ''}parts.push(value)}}finally{reader.releaseLock()}
 const buffer=new Uint8Array(length);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length}return new TextDecoder().decode(buffer);
}
