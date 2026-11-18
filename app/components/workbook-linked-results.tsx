import type {WorkbookArtifact,WorkbookContent,WorkbookSource} from '../../lib/research-workbook';
import type {WorkbookPractice} from '../../lib/workbook-practice';
import {currentLinkedText,resultLinkKey,type WorkbookResultLink} from '../../lib/workbook-result-links';
import {WorkbookEvidenceLinks} from './workbook-evidence-links';

export function WorkbookLinkedResults({content,sources,artifact,savedArtifact,practice,locale,disabled,focus,onUpdate,onRemove,onInspect}:{
  content:WorkbookContent;sources:WorkbookSource[];artifact:WorkbookArtifact;savedArtifact?:WorkbookArtifact;practice?:WorkbookPractice;locale:'zh'|'en';disabled:boolean;focus:string;
  onUpdate:(taskId:string,field:WorkbookResultLink['field'])=>void;onRemove:(key:string)=>void;onInspect:(id:string)=>void;
}){
  const zh=locale==='zh';
  if(!artifact.links?.length)return null;
  return <section className="pi-linked-results" aria-label={zh?'关联核查成果':'Linked check results'}><h4>{zh?'关联核查成果':'Linked check results'}</h4>{artifact.links.map(link=>{
    const key=resultLinkKey(link),current=currentLinkedText(practice,link),updated=current!==link.snapshot;
    const pending=!savedArtifact?.links?.some(saved=>resultLinkKey(saved)===key&&JSON.stringify(saved)===JSON.stringify(link));
    const label=link.taskId==='learning'?(zh?'配套学习':'Supporting learning'):(zh?`研究核查 ${Number(link.taskId.slice(5))+1}`:`Research check ${Number(link.taskId.slice(5))+1}`);
    return <details key={key} data-result-link={key} open={updated} className="pi-linked-result"><summary><strong>{label} · {link.field==='decision'?(zh?'判断依据':'Judgment evidence'):(zh?'待查问题':'Open questions')}</strong><span>{updated?(zh?'成果已有修订':'Result revised'):pending?(zh?'关联待保存':'Link not saved'):(zh?'已关联':'Linked')}</span></summary>
      <small>{zh?`关联内容来自保存版本 ${link.artifactRevision}`:`Linked from saved revision ${link.artifactRevision}`}</small><p className="pi-linked-snapshot">{link.snapshot}</p>
      {updated&&<div className="pi-linked-revision" role="status"><strong>{zh?'当前核查成果':'Current check result'}</strong><p>{current||(zh?'当前内容已清空；已关联版本仍保留。':'The current field is empty; the linked snapshot is retained.')}</p><button type="button" disabled={disabled||!current} onClick={()=>onUpdate(link.taskId,link.field)}>{zh?'更新到当前成果':'Update to current result'}</button><small>{zh?'更新关联后仍需保存；请核对自己的判断是否也需要修改。':'Save after updating the link, and review whether your judgment also needs editing.'}</small></div>}
      <WorkbookEvidenceLinks content={content} sources={sources} evidenceIds={link.evidenceIds} context={`linked-${key}`} locale={locale} focus={focus} onInspect={onInspect}/>
      <button type="button" disabled={disabled} onClick={()=>onRemove(key)}>{zh?'取消关联':'Remove link'}</button>
    </details>})}<p className="pi-linked-hint">{zh?'关联保留核查内容与依据；你的判断正文由你编辑，修订成果后请确认是否更新关联。':'Links retain check content and evidence. Edit your judgment yourself and review links when results change.'}</p></section>;
}
