import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {prepareAnswerMarkdown} from '../lib/answer-markdown.ts';

const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/components/answer-markdown.tsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'}});
const {AnswerMarkdown}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const render=text=>renderToStaticMarkup(createElement(AnswerMarkdown,null,text));

test('answers render headings, strong text, lists, citations, tables and math',()=>{
 const html=render('## 判断\n\n**定位成立。 **\n\n> 摘要原句\n\n1. 核对条件\n2. 阅读证明\n\n[原文](https://doi.org/10.1007/test)\n\n| 对象 | 结论 |\n|---|---|\n| 高斯 | 有条件 |\n\n公式 \\(x^2\\)\n\n\\[x^2+y^2\\]');
 for(const pattern of [/<h3>判断<\/h3>/,/<strong>定位成立。<\/strong>/,/<blockquote>/,/<ol>/,/<table>/,/class="katex"/,/katex-display/,/rel="noopener noreferrer"/])assert.match(html,pattern);
 assert.doesNotMatch(html,/\*\*定位/);
});
test('answer rendering never activates raw HTML, unsafe links or remote images',()=>{
 const html=render('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![image](https://example.com/tracker.png)\n\n`<img onerror=alert(1)>`');
 assert.doesNotMatch(html,/<script|<img|href="javascript:/i);
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
 const code='```tex\n\\(x\\) ** keep **\n```';assert.equal(prepareAnswerMarkdown(code),code);
 assert.doesNotThrow(()=>render('Unclosed math $\\badcommand{ and plain text'));
});
