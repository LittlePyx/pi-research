import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const sample=JSON.parse(await readFile(new URL('../fixtures/library-comparison.json',import.meta.url),'utf8'));
const question='比较反馈擦除信道和通用编码的适用条件；不跨设定直接排序。';
const controls='http://127.0.0.1:8147';
const pageErrors=new WeakMap();
const route=page=>page.getByRole('combobox',{name:'比较所属路线',exact:true});
const query=page=>page.getByRole('textbox',{name:'搜索标题、作者、期刊或论文介绍',exact:true});
const choose=(page,index)=>page.getByRole('checkbox',{name:'选择比较 '+sample.sources[index].title,exact:true});
const tray=page=>page.getByRole('complementary',{name:'已选比较论文',exact:true});
async function expandTask(page){
 const button=tray(page).getByRole('button',{name:'展开任务',exact:true});
 if(await button.isVisible())await button.click();
}
async function taskClick(page,options){
 const button=tray(page).getByRole('button',options);
 if(!await button.isVisible())await expandTask(page);
 await button.click();
}
async function questionField(page){
  const panel=page.getByRole('region',{name:'从论文库开始比较',exact:true});
  if(new URL(page.url()).hash.startsWith('#library')){
    await expect(panel).toBeVisible();
    const details=panel.locator('details');
    if(await details.getAttribute('open')===null)await details.locator('summary').click();
  }else if(new URL(page.url()).hash.startsWith('#workbook/')){
    const details=page.locator('.pi-workbook-picker');
    await expect(details).toBeVisible();
    if(await details.getAttribute('open')===null)await details.locator('summary').click();
  }
  return page.getByRole('textbox',{name:'本次比较问题',exact:true});
}
async function setQuestion(page,value){await (await questionField(page)).fill(value);}
async function checkQuestion(page,value){await expect(await questionField(page)).toHaveValue(value);}
async function primaryNavigation(page,name){
  const menu=page.getByRole('button',{name:'Menu',exact:true});
  if(await menu.isVisible())await menu.click();
  await page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('button',{name}).click();
}
async function selectFromSearch(page){
  await page.goto('/__acceptance/start');
  await page.locator('.pi-library-comparison summary').click();
  await route(page).selectOption('acceptance-quantum');
  await setQuestion(page,question);
  await page.getByRole('button',{name:/^已接受/}).click();
  await page.getByRole('combobox',{name:'资料筛选',exact:true}).selectOption('notes');
  await page.getByRole('combobox',{name:'历史记录排序',exact:true}).selectOption('newest');
  await expect(query(page)).toHaveValue('erasure');
  await choose(page,0).check();
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await choose(page,1).check();
  await expect(tray(page)).toContainText('2/3');
  await expect(tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/})).toBeEnabled();
}
async function enterComparison(page){
  await selectFromSearch(page);
  await taskClick(page,{name:/^(开始新比较|继续这次比较) →$/});
  await checkQuestion(page,question);
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();
}
async function ready(page){await expect(page.getByRole('textbox',{name:'目前的判断及依据',exact:true})).toBeVisible();}
async function assertSearchRestored(page){
  await expect(page).toHaveURL(/#library\?/);
  await expect(query(page)).toHaveValue('erasure');
  await expect(route(page)).toHaveValue('acceptance-quantum');
  await expect(page.getByRole('combobox',{name:'资料筛选',exact:true})).toHaveValue('notes');
  await expect(page.getByRole('combobox',{name:'历史记录排序',exact:true})).toHaveValue('newest');
  await expect(page.locator('.v2-library-tabs button[aria-pressed="true"]')).toContainText('已接受');
  await expect(page).toHaveURL(/page=2/);
  await expect(choose(page,1)).toBeChecked();
  await expect(tray(page)).toContainText(sample.sources[0].title);
  await expect(tray(page)).toContainText(sample.sources[1].title);
}
test.beforeEach(async({page,request})=>{
  const errors=[];pageErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));
  await request.get('http://127.0.0.1:8146/__acceptance/reset');
  await request.get(controls+'/scenario');
  await page.route('**/*',async routed=>{const url=new URL(routed.request().url());if(['127.0.0.1','localhost'].includes(url.hostname))await routed.continue();else await routed.abort();});
});
test.afterEach(async({page})=>{expect(pageErrors.get(page)||[],'browser must not report unhandled application errors').toEqual([]);});
test('search, filters, pagination, exact selections and drafts survive reading, refresh, save and route switches',async({page},info)=>{
  await selectFromSearch(page);
  const card=await page.locator('.v2-library-paper').first().evaluate(node=>({width:node.getBoundingClientRect().width,titleWidth:node.querySelector('.v2-library-paper-main').getBoundingClientRect().width}));
  expect(card.titleWidth).toBeGreaterThan(card.width*.55);
  await page.locator('body').press('Control+Home');
  await page.screenshot({path:info.outputPath('library-selection.png'),fullPage:false});
  const origin=page.url();
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:sample.sources[1].title,exact:true})}).click();
  await expect(page.getByRole('heading',{name:sample.sources[1].title,exact:true})).toBeVisible();
  await page.reload();
  await expect(tray(page)).toContainText('2/3');
  await page.getByRole('button',{name:'← 论文库',exact:true}).click();
  await assertSearchRestored(page);await expect(page).toHaveURL(origin);
  await page.reload();await assertSearchRestored(page);
  await taskClick(page,{name:/^(开始新比较|继续这次比较) →$/});
  await page.reload();
  await checkQuestion(page,question);
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
  await page.locator('button[data-evidence-id]').first().click();
  const note=page.getByRole('textbox',{name:'这一项的核查笔记',exact:true});
  await note.fill('核对反馈与初始纠缠条件；全文中继续确认适用范围。');
  await page.reload();
  await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();
  await expect(note).toHaveValue('核对反馈与初始纠缠条件；全文中继续确认适用范围。');
  await page.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
  await expect(page.locator('button[data-evidence-id]').first()).toBeFocused();
  await page.getByRole('textbox',{name:'目前的判断及依据',exact:true}).fill('不同信道和编码限制下的性能量不作直接排序。');
  await page.getByRole('textbox',{name:'仍缺的条件或待解决问题',exact:true}).fill('下一步核对全文中的编码器限制及定理编号。');
  await page.getByRole('button',{name:'保存并返回原任务',exact:true}).click();await assertSearchRestored(page);
  await expect(tray(page).getByRole('button',{name:'查看已保存判断 →',exact:true})).toBeVisible();
  await expect(tray(page).locator('.pi-selection-compare:visible')).toHaveCount(0);
  await route(page).selectOption('acceptance-other');
  await expect(tray(page)).toHaveCount(0);
  await checkQuestion(page,'通用编码需要哪些信道未知条件？');
  await expect(choose(page,1)).not.toBeChecked();
  await setQuestion(page,'');
  await page.reload();
  await checkQuestion(page,'');
  await setQuestion(page,'另一条路线的独立问题');
  await route(page).selectOption('acceptance-quantum');await checkQuestion(page,question);
  await route(page).selectOption('acceptance-other');await checkQuestion(page,'另一条路线的独立问题');
  await route(page).selectOption('acceptance-quantum');
  await assertSearchRestored(page);await page.reload();await assertSearchRestored(page);
  await taskClick(page,{name:/^(开始新比较|继续这次比较) →$/});await ready(page);
  await expect(page.getByRole('textbox',{name:'目前的判断及依据',exact:true})).toHaveValue('不同信道和编码限制下的性能量不作直接排序。');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('saved-comparison.png'),fullPage:true});
});
test('an initial comparison read failure can refresh without losing the chosen papers and question',async({page})=>{
  await selectFromSearch(page);let dropped=false;
  await page.route(/\/api\/research-workbook\?/,async routed=>{if(new URL(routed.request().url()).searchParams.get('selection')==='1'&&new URL(routed.request().url()).searchParams.get('intent')!=='1'&&!dropped){dropped=true;await routed.abort();}else await routed.continue();});
  await taskClick(page,{name:/^(开始新比较|继续这次比较) →$/});
  await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('本次操作未完成');
  await page.getByRole('button',{name:'刷新进度',exact:true}).click();
  await checkQuestion(page,question);
  await expect(page.locator('.pi-workbook-picker input[type="checkbox"]:checked')).toHaveCount(2);
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
});

test('task entries preserve local comparison drafts, distinguish saved records and isolate routes',async({page,request})=>{
  await selectFromSearch(page);
  await expect(tray(page)).toContainText('量子编码条件比较');
  await expect(tray(page)).toContainText('选材草稿');
  await taskClick(page,{name:'开始新比较 →',exact:true});
  const refined='仅依据摘要，核对反馈擦除信道与通用编码各自的编码器条件和性能指标。';
  await setQuestion(page,refined);
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await expect(tray(page)).toContainText(refined);
  await page.reload();
  await expect(tray(page).getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toBeVisible();
  await route(page).selectOption('acceptance-other');
  await expect(page.getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toHaveCount(0);
  await route(page).selectOption('acceptance-quantum');
  await taskClick(page,{name:'继续本地比较草稿 →',exact:true});
  await checkQuestion(page,refined);
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
  const id=new URLSearchParams(page.url().split('?')[1]).get('workbookId');
  await page.getByRole('textbox',{name:'目前的判断及依据',exact:true}).fill('分开核对编码设定，暂不比较不同任务的界。');
  await page.getByRole('button',{name:'保存并返回原任务',exact:true}).click();
  await expect(tray(page)).toContainText('已保存判断');
  await expect(page.getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toHaveCount(0);
  await taskClick(page,{name:'继续已有比较 →',exact:true});await ready(page);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(id)));
  await expect(page.getByRole('textbox',{name:'目前的判断及依据',exact:true})).toHaveValue('分开核对编码设定，暂不比较不同任务的界。');
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await setQuestion(page,'新的未生成比较问题');
  await taskClick(page,{name:'开始新比较 →',exact:true});
  await setQuestion(page,'另一份比较草稿的问题改写');
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await taskClick(page,{name:'继续已有比较 →',exact:true});await ready(page);
  await checkQuestion(page,refined);
  await expect(page.getByRole('button',{name:'恢复到编辑区',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await taskClick(page,{name:'继续本地比较草稿 →',exact:true});
  await checkQuestion(page,'另一份比较草稿的问题改写');
  expect((await (await request.get(controls+'/counts')).json()).draft).toBe(1);
});

test('compact library and paper position survive reading refresh, draft recovery and return',async({page},info)=>{
  await page.goto('/__acceptance/start');
  await route(page).selectOption('acceptance-quantum');
  await expect(page.locator('.pi-library-comparison details')).not.toHaveAttribute('open','');
  await expect(page.locator('.pi-library-result-count')).toContainText('第 1–60 篇 / 共 63 篇');
  const paper=page.getByRole('button').filter({has:page.getByRole('heading',{name:sample.sources[0].title,exact:true})});
  await paper.scrollIntoViewIfNeeded();
  const paperId=await paper.locator('..').getAttribute('data-library-paper');
  const position=await paper.locator('..').evaluate(e=>e.getBoundingClientRect().top);
  await paper.click();
  await page.getByRole('button',{name:'笔记',exact:true}).click();
  await page.getByRole('textbox',{name:'我的阅读笔记',exact:true}).fill('等待核对全文中的反馈与编码器限制。');
  await page.reload();
  await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'我的阅读笔记',exact:true})).toHaveValue('等待核对全文中的反馈与编码器限制。');
  await page.getByRole('button',{name:'← 论文库',exact:true}).click();
  const returned=page.locator('[data-library-paper="'+paperId+'"] .v2-library-paper-main');
  await expect(returned).toBeFocused();
  await expect.poll(async()=>Math.abs(await returned.locator('..').evaluate(e=>e.getBoundingClientRect().top)-position)).toBeLessThan(8);
  await page.reload();
  await expect(returned).toBeFocused();
  await expect.poll(async()=>Math.abs(await returned.locator('..').evaluate(e=>e.getBoundingClientRect().top)-position)).toBeLessThan(8);
  await page.screenshot({path:info.outputPath('restored-library-position.png'),fullPage:false});
});

test('library and route selection stay synchronized in both directions without mixing routes',async({page})=>{
  await selectFromSearch(page);
  await primaryNavigation(page,/^研究$/);
  await page.getByRole('button',{name:'进入研究：量子编码条件比较',exact:true}).click();
  await expect(tray(page)).toContainText('2/3');
  await taskClick(page,{name:'移除 '+sample.sources[0].title,exact:true});
  await expect(tray(page)).toContainText('1/3');
  await primaryNavigation(page,/^论文库/);
  await expect(tray(page)).toContainText('1/3');
  await expect(tray(page)).not.toContainText(sample.sources[0].title);
  await route(page).selectOption('acceptance-other');
  await expect(tray(page)).toHaveCount(0);
  await setQuestion(page,'另一条路线的独立草稿');
  await route(page).selectOption('acceptance-quantum');
  await expect(tray(page)).toContainText('1/3');
  await checkQuestion(page,question);
  await taskClick(page,{name:'移除 '+sample.sources[1].title,exact:true});
  await expect(tray(page)).toHaveCount(0);
  await primaryNavigation(page,/^研究$/);
  await page.getByRole('button',{name:'进入研究：量子编码条件比较',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('checkbox',{name:'选择比较 '+sample.sources[0].title,exact:true})).toBeEnabled();
  await expect(tray(page)).toHaveCount(0);
  await primaryNavigation(page,/^论文库/);
  await page.locator('.pi-library-comparison summary').click();
  await route(page).selectOption('acceptance-other');
  await checkQuestion(page,'另一条路线的独立草稿');
});
test('a dropped review request refreshes the same checkpoint without regenerating the draft',async({page,request})=>{
  let dropped=false;
  await page.route('**/api/research-workbook',async routed=>{const req=routed.request();if(req.method()==='POST'&&req.postDataJSON().action==='advance'&&!dropped){dropped=true;await routed.abort();}else await routed.continue();});
  await enterComparison(page);
  const progress=page.getByRole('region',{name:'比较进度与恢复',exact:true});
  await expect(progress).toContainText('核对暂时中断');await expect(progress).toContainText('比较草稿已保存');
  const id=new URLSearchParams(page.url().split('?')[1]).get('workbookId');
  await page.getByRole('button',{name:'刷新进度',exact:true}).click();
  await page.getByRole('button',{name:'继续核对',exact:true}).click();await ready(page);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(id)));
  expect((await (await request.get(controls+'/counts')).json()).draft).toBe(1);
});
test('a lost generation response discovers the saved checkpoint instead of generating again',async({page,request})=>{
  await selectFromSearch(page);let dropped=false;
  await page.route('**/api/research-workbook',async routed=>{const req=routed.request();if(req.method()==='POST'&&req.postDataJSON().action==='prepare'&&!dropped){dropped=true;await routed.fetch();await routed.abort();}else await routed.continue();});
  await taskClick(page,{name:/^(开始新比较|继续这次比较) →$/});
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();
  await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('本次操作未完成');
  await page.getByRole('button',{name:'刷新进度',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续核对',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'继续核对',exact:true}).click();await ready(page);
  expect((await (await request.get(controls+'/counts')).json()).draft).toBe(1);
});
test('provider cooldown is explained and review resumes with its original sources',async({page,request})=>{
  await request.get(controls+'/scenario?mode=review-rate-limit');await enterComparison(page);
  await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('模型请求较多');
  await expect(page.getByRole('button',{name:'继续核对',exact:true})).toBeDisabled();
  await page.request.get('/__acceptance/release');
  await page.getByRole('button',{name:'刷新进度',exact:true}).click();
  await page.getByRole('button',{name:'继续核对',exact:true}).click();await ready(page);
  expect((await (await request.get(controls+'/counts')).json()).draft).toBe(1);
});
test('a real saved-version conflict retains local input and allows explicit recovery after refresh',async({page})=>{
  await enterComparison(page);await ready(page);
  const params=new URLSearchParams(page.url().split('?')[1]),workbookId=params.get('workbookId');
  const workbook=(await (await page.request.get('/api/research-workbook?'+new URLSearchParams({spaceId:'acceptance-library',trackId:'acceptance-quantum',workbookId}))).json()).workbook;
  const concurrent=await page.request.post('/api/research-workbook',{data:{spaceId:'acceptance-library',trackId:'acceptance-quantum',action:'save-artifact',workbookId,sourceRevision:workbook.revision,baseRevision:0,value:{observations:{},decision:'另一个标签页已保存的判断',unresolved:''}}});
  expect(concurrent.ok()).toBe(true);
  const decision=page.getByRole('textbox',{name:'目前的判断及依据',exact:true});await decision.fill('这个标签页尚未提交的核查判断');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('保存版本有变化');
  await expect(decision).toHaveValue('这个标签页尚未提交的核查判断');
  await page.reload();await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();
  await expect(decision).toHaveValue('这个标签页尚未提交的核查判断');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'已保存到工作区 · 版本 2'})).toBeVisible();
});

test('compact task disclosure has one continuation and retains selections across refresh and routes',async({page},info)=>{
 await selectFromSearch(page);
 await expect(tray(page).getByRole('button')).toHaveCount(2);
 await expect(tray(page).getByRole('button',{name:'展开任务',exact:true})).toHaveAttribute('aria-expanded','false');
 expect(await tray(page).evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(165);
 await expandTask(page);await expect(tray(page).getByRole('button',{name:'移除 '+sample.sources[0].title,exact:true})).toBeVisible();
 await page.reload();await expect(tray(page).getByRole('button',{name:'展开任务',exact:true})).toBeVisible();
 await assertSearchRestored(page);
 await route(page).selectOption('acceptance-other');await expect(tray(page)).toHaveCount(0);
 await route(page).selectOption('acceptance-quantum');await expect(tray(page)).toContainText('2/3');
 await page.screenshot({path:info.outputPath('compact-task.png'),fullPage:false});
});

test('one malformed generation automatically recovers and still independently reviews every field',async({page,request})=>{
 await request.get(controls+'/scenario?mode=draft-json-once');await enterComparison(page);await ready(page);
 await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('已自动恢复 1 次格式或引用异常');
 const counts=await (await request.get(controls+'/counts')).json();expect(counts.draft).toBe(2);expect(counts.review).toBeGreaterThan(1);
 await page.reload();await ready(page);await expect(page.locator('.pi-workbook-round')).toContainText('第 1 轮核对');
});

test('persistent malformed output stops after one retry and restores the same comparison on manual continuation',async({page,request})=>{
 await request.get(controls+'/scenario?mode=draft-json-always');await enterComparison(page);
 await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('JSON 格式有误');
 expect((await (await request.get(controls+'/counts')).json()).draft).toBe(2);
 const origin=page.url();await checkQuestion(page,question);await page.reload();await checkQuestion(page,question);
 await request.get(controls+'/scenario');await page.request.get('/__acceptance/release');
 await page.getByRole('button',{name:'刷新进度',exact:true}).click();await page.getByRole('button',{name:'继续生成',exact:true}).click();await ready(page);
 await expect(page).toHaveURL(origin);
});

test('repair and round two are explicit and only the failed field changes',async({page,request})=>{
 await request.get(controls+'/scenario?mode=repair');await selectFromSearch(page);
 await taskClick(page,{name:'开始新比较 →',exact:true});
 await page.getByRole('checkbox',{name:/允许根据评审反馈修订一次/}).check();
 const snapshots=[];
 page.on('response',async response=>{if(response.url().endsWith('/api/research-workbook')&&response.request().method()==='POST'){try{snapshots.push((await response.json()).workbook);}catch{/* A navigation can discard its response body; final state is asserted below. */}}});
 await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
 await expect(page.locator('.pi-workbook-round')).toContainText('第 2 轮核对');
 await expect(page.locator('.pi-workbook-preservation')).toContainText('保留');
 expect(snapshots.some(s=>s?.revisionFlow?.next==='repair')).toBe(true);
 const final=snapshots.findLast(s=>s?.status==='ready');expect(final.revisionFlow.revisedFields).toBe(1);
 const {comparison,...unchanged}=final.content;const {comparison:original,...expected}=sample.content;
 expect(unchanged).toEqual(expected);expect(comparison.textEn).not.toBe(original.textEn);
 expect((await (await request.get(controls+'/counts')).json()).repair).toBe(1);
});

test('invalid task references explain the cause and resume the same comparison without relaxing evidence validation',async({page,request})=>{
 await request.get(controls+'/scenario?mode=draft-invalid-reference-always');await enterComparison(page);
 const progress=page.getByRole('region',{name:'比较进度与恢复',exact:true});
 await expect(progress).toContainText('引用了不存在或缺少出处的比较项');
 await progress.locator('summary').filter({hasText:'查看具体原因'}).click();
 await expect(progress).toContainText('继续时将重新生成并核对引用');
 const origin=page.url();await page.reload();await checkQuestion(page,question);
 expect((await (await request.get(controls+'/counts')).json()).draft).toBe(2);
 await request.get(controls+'/scenario');await page.request.get('/__acceptance/release');await page.getByRole('button',{name:'刷新进度',exact:true}).click();
 await page.getByRole('button',{name:'继续生成',exact:true}).click();await ready(page);await expect(page).toHaveURL(origin);
 expect((await (await request.get(controls+'/counts')).json()).draft).toBe(1);
});

test('a single invalid task reference recovers automatically before independent review',async({page,request})=>{
 await request.get(controls+'/scenario?mode=draft-invalid-reference-once');await selectFromSearch(page);
 await taskClick(page,{name:'开始新比较 →',exact:true});await page.getByRole('checkbox',{name:/允许根据评审反馈修订一次/}).check();
 await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
 await expect(page.getByRole('region',{name:'比较进度与恢复',exact:true})).toContainText('已自动恢复 1 次格式或引用异常');
 const counts=await (await request.get(controls+'/counts')).json();expect(counts.draft).toBe(2);expect(counts.review).toBeGreaterThan(1);
});

test('resuming a failed generation announces active work while the request is pending',async({page,request})=>{
 await request.get(controls+'/scenario?mode=draft-invalid-reference-always');await enterComparison(page);
 const progress=page.getByRole('region',{name:'比较进度与恢复',exact:true});await expect(progress).toContainText('引用了不存在');
 await request.get(controls+'/scenario');await page.request.get('/__acceptance/release');await page.getByRole('button',{name:'刷新进度',exact:true}).click();
 let release;const held=new Promise(resolve=>{release=resolve;});let waiting=false;
 await page.route('**/api/research-workbook',async routed=>{if(routed.request().method()==='POST'&&routed.request().postDataJSON().action==='advance'&&!waiting){waiting=true;await held;}await routed.continue();});
 try {await page.getByRole('button',{name:'继续生成',exact:true}).click();await expect(progress.getByRole('status').first()).toHaveText('正在重新生成有据的比较');}
 finally {release();}
 await ready(page);
});

test('evidence switches papers and dimensions in place, restores drafts and returns to the original trigger after refresh',async({page},info)=>{
 await enterComparison(page);await ready(page);await page.getByRole('button',{name:'研究练习',exact:true}).click();
 const card=page.locator('.pi-workbook-task-card').first(),origin=card.locator('button[data-evidence-id]').first();
 const originId=await origin.getAttribute('data-evidence-id'),originAnchor=await origin.getAttribute('data-evidence-origin');
 const firstSource=sample.sources.find(s=>originId.endsWith(':'+s.id)),other=sample.sources.find(s=>s.id!==firstSource.id);
 const dimension=sample.content.dimensions.find(d=>originId===`${d.id}:${firstSource.id}`),index=sample.content.dimensions.indexOf(dimension);
 await origin.click();const inspector=page.getByRole('dialog',{name:'证据与核查笔记',exact:true}),note=inspector.getByRole('textbox',{name:'这一项的核查笔记',exact:true});
 const paperButton=source=>inspector.getByRole('group',{name:'依据论文',exact:true}).getByRole('button',{name:new RegExp(source.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});
 await note.fill('A：原维度第一篇的草稿。');await paperButton(other).click();await expect(note).toHaveValue('');await note.fill('B：原维度第二篇的草稿。');
 await inspector.getByRole('button',{name:'下一个比较维度',exact:true}).click();
 await expect(inspector.getByRole('combobox',{name:'比较维度',exact:true})).toHaveValue(sample.content.dimensions[index+1].id);await expect(note).toHaveValue('');await note.fill('C：下一维度第二篇的草稿。');
 await paperButton(firstSource).click();await expect(note).toHaveValue('');await note.fill('D：下一维度第一篇的草稿。');
 await inspector.getByRole('button',{name:'上一个比较维度',exact:true}).click();await expect(note).toHaveValue('A：原维度第一篇的草稿。');
 await paperButton(other).click();await expect(note).toHaveValue('B：原维度第二篇的草稿。');
 await inspector.getByRole('button',{name:'下一个比较维度',exact:true}).click();await expect(note).toHaveValue('C：下一维度第二篇的草稿。');
 await inspector.getByRole('button',{name:'带着这项核查打开论文 →',exact:true}).click();await expect(page).toHaveURL(/#paper\//);
 await page.reload();await page.getByRole('button',{name:'← 返回原比较项与学习任务',exact:true}).click();
 await inspector.getByRole('button',{name:'恢复到编辑区',exact:true}).click();await expect(note).toHaveValue('C：下一维度第二篇的草稿。');
 await inspector.getByRole('button',{name:'保存笔记与判断',exact:true}).click();await expect(inspector.locator('.pi-inspector-save')).toContainText('已保存到工作区');
 await expect(inspector.getByRole('combobox',{name:'比较维度',exact:true})).toBeInViewport();
 await expect(paperButton(other)).toBeInViewport();
 await inspector.screenshot({path:info.outputPath('inspector-navigation.png')});
 await inspector.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
 await expect(origin).toBeFocused();expect(await origin.getAttribute('data-evidence-origin')).toBe(originAnchor);await expect(origin).toBeInViewport();
 const bar=page.locator('.pi-workbook-savebar');
 await expect(bar).toHaveAttribute('data-mode','saved');await expect(bar.getByRole('button',{name:'保存记录',exact:true})).toHaveCount(0);
 await origin.click();await expect(note).toHaveValue('A：原维度第一篇的草稿。');await paperButton(other).click();await expect(note).toHaveValue('B：原维度第二篇的草稿。');
 await inspector.getByRole('combobox',{name:'比较维度',exact:true}).selectOption(sample.content.dimensions[index+1].id);await expect(note).toHaveValue('C：下一维度第二篇的草稿。');
 await paperButton(firstSource).click();await expect(note).toHaveValue('D：下一维度第一篇的草稿。');
 if(info.project.name==='desktop'){
  await page.setViewportSize({width:1440,height:1000});await expect(inspector).not.toHaveAttribute('aria-modal','true');await expect(note).toHaveValue('D：下一维度第一篇的草稿。');
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await paperButton(other).click();await expect(note).toHaveValue('C：下一维度第二篇的草稿。');
  await inspector.evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
  await expect.poll(()=>inspector.evaluate(node=>node.getBoundingClientRect().bottom-document.querySelector('.pi-workbook-savebar').getBoundingClientRect().top)).toBeLessThanOrEqual(0);
  await inspector.screenshot({path:info.outputPath('inspector-wide.png')});
 }
 await inspector.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
});

test('task cards and saved results share confirmed progress while the clean save bar exposes no disabled save actions',async({page})=>{
 await enterComparison(page);await ready(page);await page.getByRole('button',{name:'研究练习',exact:true}).click();
 const panel=page.getByRole('region',{name:'研究核查任务',exact:true}),first=panel.locator('.pi-workbook-task-card').first(),bar=page.locator('.pi-workbook-savebar');
 await expect(first).toContainText('未开始');await expect(panel.locator('.pi-workbook-task-progress')).toContainText('0/3');await expect(bar.getByRole('button',{name:'保存记录',exact:true})).toHaveCount(0);
 await first.getByRole('button',{name:'开始核查 →',exact:true}).click();await page.getByRole('textbox',{name:'本项成果与依据',exact:true}).fill('摘要核查记录：条件待全文确认，尚未完成。');
 await page.getByRole('button',{name:'保存成果并返回原判断',exact:true}).click();await expect(first).toContainText('已保存，待继续');await expect(first.getByRole('button',{name:'继续核查 →',exact:true})).toBeEnabled();await expect(panel.locator('.pi-workbook-task-progress')).toContainText('0/3');
 await first.getByRole('button',{name:'继续核查 →',exact:true}).click();await page.getByRole('button',{name:'保存并确认完成，继续下一项',exact:true}).click();
 await expect(page.getByRole('main',{name:'比较练习',exact:true})).toContainText('1/3');await page.getByRole('button',{name:'← 返回原比较',exact:true}).click();
 await expect(first).toContainText('已确认完成');await expect(first.getByRole('button',{name:'查看成果 →',exact:true})).toBeEnabled();await expect(panel.locator('.pi-workbook-task-progress')).toContainText('1/3');
 await page.reload();await expect(first.getByRole('button',{name:'查看成果 →',exact:true})).toBeEnabled();await expect(panel.locator('.pi-workbook-task-card').nth(1)).toContainText('未开始');
 await expect(bar.getByRole('button',{name:'返回原任务',exact:true})).toBeEnabled();await expect(bar.getByRole('button',{name:'保存并返回原任务',exact:true})).toHaveCount(0);
});

test('task evidence groups each dimension once and opens the correct paper without mixing check notes',async({page},info)=>{
 await enterComparison(page);await ready(page);
 await page.getByRole('button',{name:'研究练习',exact:true}).click();
 const panel=page.getByRole('region',{name:'研究核查任务',exact:true}),card=panel.locator('.pi-workbook-task-card').first();
 const step=sample.content.task.steps[0],dimensions=sample.content.dimensions.filter(d=>step.evidenceIds.some(id=>id.startsWith(d.id+':')));
 await expect(card.locator('.pi-workbook-evidence-group')).toHaveCount(dimensions.length);
 const dimension=dimensions.find(d=>sample.sources.every(s=>step.evidenceIds.includes(`${d.id}:${s.id}`)));
 const group=card.getByRole('group',{name:dimension.labelZh,exact:true});
 await expect(group.locator('.pi-workbook-evidence-dimension')).toHaveCount(1);
 await expect(group.getByRole('button')).toHaveCount(2);
 const first=group.getByRole('button').first(),second=group.getByRole('button').nth(1);
 const firstId=await first.getAttribute('data-evidence-id'),secondId=await second.getAttribute('data-evidence-id');expect(firstId).not.toBe(secondId);
 const sourceFor=id=>sample.sources.find(s=>id===`${dimension.id}:${s.id}`);
 expect(await first.getAttribute('aria-label')).toContain(sourceFor(firstId).title);
 await first.click();const inspector=page.getByRole('dialog',{name:'证据与核查笔记',exact:true});
 await expect(inspector.getByRole('heading',{name:sourceFor(firstId).title,exact:true})).toBeVisible();
 await inspector.getByRole('textbox',{name:'这一项的核查笔记',exact:true}).fill('第一篇论文的独立依据笔记。');
 await inspector.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
 await second.click();await expect(inspector.getByRole('heading',{name:sourceFor(secondId).title,exact:true})).toBeVisible();
 await expect(inspector.getByRole('textbox',{name:'这一项的核查笔记',exact:true})).toHaveValue('');
 await inspector.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
 await expect(panel.locator('.pi-workbook-task-standard')).not.toHaveAttribute('open');
 await panel.locator('.pi-workbook-task-standard summary').click();await expect(panel.locator('.pi-workbook-task-standard')).toContainText(sample.content.task.criterionZh);
 await expect(panel.locator('.pi-workbook-lesson')).not.toHaveAttribute('open');
 await panel.locator('.pi-workbook-lesson summary').click();await expect(panel.getByRole('button',{name:'开始这项学习练习 →',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.reload();
 await first.click();await expect(inspector.getByRole('textbox',{name:'这一项的核查笔记',exact:true})).toHaveValue('第一篇论文的独立依据笔记。');
 await inspector.getByRole('button',{name:'关闭依据 ×',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:info.outputPath('comparison-tasks.png')});
});

test('open question, source reading, saved check and explicit judgment append form one recoverable task',async({page})=>{
 await enterComparison(page);await ready(page);
 const judgment='保留原判断：不同任务的性能界暂不排序。',pending='全文中反馈与编码器限制的条件、定理编号尚待核对。';
 const decision=page.getByRole('textbox',{name:'目前的判断及依据',exact:true});
 await decision.fill(judgment);await page.getByRole('textbox',{name:'仍缺的条件或待解决问题',exact:true}).fill(pending);
 await page.getByRole('button',{name:'保存记录',exact:true}).click();
 await page.getByRole('region',{name:'继续核查待查问题',exact:true}).getByRole('button',{name:'继续核查并记录成果 →',exact:true}).click();
 await expect(page).toHaveURL(/#learn\?/);await expect(page.getByRole('complementary',{name:'原判断中的待查问题',exact:true})).toContainText(pending);
 const result='原文位置：摘要。已核对量子擦除信道与通用编码的设定；定理编号仍待全文补证。';
 await page.getByRole('textbox',{name:'本项成果与依据',exact:true}).fill(result);
 await page.getByRole('textbox',{name:'仍需查证的问题',exact:true}).fill('仍需核对正文中的编码器限制。');
 await page.reload();await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'本项成果与依据',exact:true})).toHaveValue(result);
 const evidence=page.getByRole('main',{name:'比较练习',exact:true}).locator('details').filter({has:page.locator('summary').filter({hasText:'核对原文与比较依据'})});
 await evidence.locator('summary').click();await evidence.getByRole('button',{name:'带着任务打开论文 →',exact:true}).first().click();
 await expect(page).toHaveURL(/#paper\//);await expect(page.locator('.pi-paper-workspace')).toContainText('仍需核对正文中的编码器限制。');
 await page.reload();await page.getByRole('button',{name:'← 返回原核查任务',exact:true}).click();
 await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'本项成果与依据',exact:true})).toHaveValue(result);
 await page.getByRole('button',{name:'保存成果并返回原判断',exact:true}).click();
 await expect(page).toHaveURL(/#workbook\//);const results=page.getByRole('region',{name:'已保存核查成果',exact:true});
 await expect(results).toBeFocused();await expect(results).toContainText(result);await expect(results).toContainText('已保存，待继续');
 await expect(decision).toHaveValue(judgment);
 await results.getByRole('button',{name:'补入当前判断',exact:true}).click();
 await expect(results.getByRole('button',{name:'已补入判断，待保存',exact:true})).toBeDisabled();
 await expect(results.getByRole('button',{name:'继续这项核查 →',exact:true})).toBeDisabled();
 const appended=await decision.inputValue();expect(appended.startsWith(judgment)).toBe(true);expect(appended.split(result).length-1).toBe(1);
 await expect(page.getByRole('textbox',{name:'仍缺的条件或待解决问题',exact:true})).toHaveValue(pending);
 await results.getByRole('button',{name:'补入待查问题',exact:true}).click();
 await expect(results.getByRole('button',{name:'已补入待查问题，待保存',exact:true})).toBeDisabled();
 const appendedQuestion=await page.getByRole('textbox',{name:'仍缺的条件或待解决问题',exact:true}).inputValue();
 expect(appendedQuestion.startsWith(pending)).toBe(true);
 await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(page.getByRole('region',{name:'Saved check results',exact:true}).getByRole('button',{name:'Added to judgment; save pending',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'Saved check results',exact:true}).getByRole('button',{name:'Added to open questions; save pending',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'中文',exact:true}).click();await expect(decision).toHaveValue(appended);
 await page.reload();await page.getByRole('button',{name:'恢复到编辑区',exact:true}).click();await expect(decision).toHaveValue(appended);
 await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.reload();await expect(decision).toHaveValue(appended);
 await expect(results.getByRole('button',{name:'已保存到判断',exact:true})).toBeDisabled();
 await expect(results.getByRole('button',{name:'已保存到待查问题',exact:true})).toBeDisabled();
 await expect(page.getByRole('textbox',{name:'仍缺的条件或待解决问题',exact:true})).toHaveValue(appendedQuestion);
 await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(page.getByRole('region',{name:'Saved check results',exact:true}).getByRole('button',{name:'Saved in judgment',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'中文',exact:true}).click();
 await results.getByRole('button',{name:'继续这项核查 →',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'本项成果与依据',exact:true})).toHaveValue(result);
 await page.getByRole('navigation',{name:'练习任务',exact:true}).getByRole('button',{name:/^02 ·/}).click();
 await page.getByRole('textbox',{name:'本项成果与依据',exact:true}).fill('第二项的独立核查结果，不能带入第一项。');
 await page.getByRole('button',{name:'保存成果并返回原判断',exact:true}).click();
 const firstRecord=results.getByRole('article').filter({has:page.getByRole('heading',{name:'研究核查 1 · 已保存，待继续',exact:true})});
 await firstRecord.getByRole('button',{name:'继续这项核查 →',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'本项成果与依据',exact:true})).toHaveValue(result);
 await page.reload();await expect(page.getByRole('textbox',{name:'本项成果与依据',exact:true})).toHaveValue(result);
 await expect(page.getByRole('navigation',{name:'练习任务',exact:true}).getByRole('button',{name:/^01 ·/})).toHaveAttribute('aria-current','step');
});
