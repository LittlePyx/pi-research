'use client';
import type {PaperPanel} from '../../lib/workspace-navigation';
export function PaperPanelNavigation({value,locale,onChange}:{value:PaperPanel;locale:'zh'|'en';onChange:(value:PaperPanel)=>void}){
 return <nav className="pi-paper-panel-navigation" aria-label={locale==='zh'?'论文内容':'Paper content'}>{([['reading','阅读','Reading'],['notes','笔记','Notes'],['record','依据','Sources']] as const).map(([id,zh,en])=><button key={id} type="button" aria-label={id==='record'?(locale==='zh'?'依据与书目':'Sources & details'):undefined} title={id==='record'?(locale==='zh'?'来源、评审与书目信息':'Sources, review and bibliographic details'):undefined} aria-pressed={value===id} onClick={()=>onChange(id)}>{locale==='zh'?zh:en}</button>)}</nav>;
}
