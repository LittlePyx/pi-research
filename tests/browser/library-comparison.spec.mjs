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
  await tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/}).click();
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
  await tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/}).click();
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
  await tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/}).click();await ready(page);
  await expect(page.getByRole('textbox',{name:'目前的判断及依据',exact:true})).toHaveValue('不同信道和编码限制下的性能量不作直接排序。');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('saved-comparison.png'),fullPage:true});
});
test('an initial comparison read failure can refresh without losing the chosen papers and question',async({page})=>{
  await selectFromSearch(page);let dropped=false;
  await page.route(/\/api\/research-workbook\?/,async routed=>{if(new URL(routed.request().url()).searchParams.get('selection')==='1'&&new URL(routed.request().url()).searchParams.get('intent')!=='1'&&!dropped){dropped=true;await routed.abort();}else await routed.continue();});
  await tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/}).click();
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
  await tray(page).getByRole('button',{name:'开始新比较 →',exact:true}).click();
  const refined='仅依据摘要，核对反馈擦除信道与通用编码各自的编码器条件和性能指标。';
  await setQuestion(page,refined);
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await expect(tray(page)).toContainText(refined);
  await page.reload();
  await expect(tray(page).getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toBeVisible();
  await route(page).selectOption('acceptance-other');
  await expect(page.getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toHaveCount(0);
  await route(page).selectOption('acceptance-quantum');
  await tray(page).getByRole('button',{name:'继续本地比较草稿 →',exact:true}).click();
  await checkQuestion(page,refined);
  await page.getByRole('button',{name:'准备有据的比较与任务',exact:true}).click();await ready(page);
  const id=new URLSearchParams(page.url().split('?')[1]).get('workbookId');
  await page.getByRole('textbox',{name:'目前的判断及依据',exact:true}).fill('分开核对编码设定，暂不比较不同任务的界。');
  await page.getByRole('button',{name:'保存并返回原任务',exact:true}).click();
  await expect(tray(page)).toContainText('已保存判断');
  await expect(page.getByRole('button',{name:'继续本地比较草稿 →',exact:true})).toHaveCount(0);
  await tray(page).getByRole('button',{name:'继续已有比较 →',exact:true}).click();await ready(page);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(id)));
  await expect(page.getByRole('textbox',{name:'目前的判断及依据',exact:true})).toHaveValue('分开核对编码设定，暂不比较不同任务的界。');
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await setQuestion(page,'新的未生成比较问题');
  await tray(page).getByRole('button',{name:'开始新比较 →',exact:true}).click();
  await setQuestion(page,'另一份比较草稿的问题改写');
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await tray(page).getByRole('button',{name:'继续已有比较 →',exact:true}).click();await ready(page);
  await checkQuestion(page,refined);
  await expect(page.getByRole('button',{name:'恢复到编辑区',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'← 返回原任务',exact:true}).click();
  await tray(page).getByRole('button',{name:'继续本地比较草稿 →',exact:true}).click();
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
  await tray(page).getByRole('button',{name:'移除 '+sample.sources[0].title,exact:true}).click();
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
  await tray(page).getByRole('button',{name:'移除 '+sample.sources[1].title,exact:true}).click();
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
  await tray(page).getByRole('button',{name:/^(开始新比较|继续这次比较) →$/}).click();
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
