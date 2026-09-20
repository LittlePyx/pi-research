"use client";
type Example = {paperId:string;evidenceZh:string;evidenceEn:string};
export function RecommendationMemoryLink({locale,example,onPaper,onMemory}:{locale:"zh"|"en";example?:Example|null;onPaper:(id:string)=>void;onMemory:()=>void}) {
 const zh=locale==='zh';
 return <div className="pi-recommendation-memory">{example && <details><summary>{zh?'示例关联依据':'Example connection'}</summary><p>{zh?example.evidenceZh:example.evidenceEn}</p><small>{zh?'来自预设示例笔记，不是本次模型推荐。':'From preset example notes, not a live recommendation.'}</small><button type="button" onClick={()=>onPaper(example.paperId)}>{zh?'查看对应笔记':'Open source note'} →</button></details>}<button type="button" onClick={onMemory}>{zh?'查看研究偏向':'View research interests'} →</button></div>;
}
