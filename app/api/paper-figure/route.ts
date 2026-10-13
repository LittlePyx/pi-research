import {ensureSchema,getApiUser,getDatabase} from '../../../db/repository';
import {boundedFigureHtml,figureArxivId,firstArxivFigure,type PaperFigure} from '../../../lib/paper-figure';
import {fetchExternalSource} from '../../../lib/external-source-throttle';
const figures=new Map<string,{until:number;figure:PaperFigure|null}>();
export async function GET(request:Request) {
 const user=getApiUser(request);if(!user)return Response.json({error:'Authentication required'},{status:401});
 const params=new URL(request.url).searchParams,spaceId=params.get('spaceId'),paperId=params.get('paperId');
 if(!spaceId||!paperId)return Response.json({error:'Missing paper identity'},{status:400});
 const db=getDatabase();await ensureSchema(db);
 const paper=await db.prepare('SELECT p.url,p.doi,p.title FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND p.space_id=? AND s.owner_user_id=?').bind(paperId,spaceId,user.userId).first<{url:string;doi:string|null;title:string}>();
 if(!paper)return Response.json({error:'Paper not found'},{status:404});
 const id=figureArxivId(paper.url,paper.doi),key=id+':'+paper.title;
 let figure:PaperFigure|null=null;
 if(id){const cached=figures.get(key);if(cached&&cached.until>Date.now())figure=cached.figure;
 else {
  try {
   const signal=AbortSignal.timeout(7000);
   const fetchHtml=(url:string)=>fetchExternalSource(url,{redirect:'manual',headers:{Accept:'text/html'},signal},{database:db,sourceKey:'arxiv',maxRetries:0,maxInlineWaitMs:0});
   let resolvedId=id,response=await fetchHtml('https://arxiv.org/html/'+id);
   if(response.status>=300&&response.status<400){
    const location=new URL(response.headers.get('location')||'', 'https://arxiv.org/html/'+id);
    const nextId=figureArxivId(location.href,null);
    if(location.protocol!=='https:'||location.hostname!=='arxiv.org'||location.port||location.username||location.password||!location.pathname.startsWith('/html/')||!nextId||nextId.replace(/v\d+$/,'')!==id.replace(/v\d+$/,''))throw Error('Unexpected figure redirect');
    resolvedId=nextId;response=await fetchHtml('https://arxiv.org/html/'+resolvedId);
   }
   figure=firstArxivFigure(await boundedFigureHtml(response),resolvedId,paper.title);
  }catch{ /* A missing or unavailable figure leaves the text recommendation usable. */ }
  if(figures.size>=128)figures.delete(figures.keys().next().value!);
  figures.set(key,{figure,until:Date.now()+(figure?3_600_000:300_000)});
 }}
 return Response.json({figure},{headers:{'Cache-Control':'private, max-age=300'}});
}
