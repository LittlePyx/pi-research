import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { prepareAnswerMarkdown } from '../../lib/answer-markdown';
import './answer-markdown.css';

export function AnswerMarkdown({children}:{children:string}) {
  return <div className="pi-answer-prose"><Markdown skipHtml
    remarkPlugins={[remarkGfm,remarkMath]}
    rehypePlugins={[[rehypeKatex,{trust:false,strict:'ignore',maxExpand:200,maxSize:10}]]}
    components={{
      h1:({children})=><h3>{children}</h3>,
      h2:({children})=><h3>{children}</h3>,
      h3:({children})=><h4>{children}</h4>,
      a:({href,children})=>href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      img:({alt})=><span>{alt}</span>,
      table:({children})=><div className="pi-answer-table"><table>{children}</table></div>,
    }}>{prepareAnswerMarkdown(children)}</Markdown></div>;
}
