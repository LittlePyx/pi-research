import { test, expect } from '@playwright/test';

async function research(page) {
  await page.locator('.v2-app.pi-workspace').waitFor();
  const menu=page.getByRole('button',{name:'Menu',exact:true});
  if(await menu.isVisible())await menu.click();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'研究',exact:true}).click();
}

test('a new visitor can enter Research with an empty space and recover from busy storage',async({page})=>{
  await page.goto('/#thread/acceptance-quantum/evidence?space=acceptance-library');
  await expect(page.getByRole('heading',{name:'开始你的研究',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'空间名称'}).fill('访客导航验收');
  await page.getByRole('textbox',{name:'研究方向'}).fill('有限码长条件和通信误差');
  await page.getByRole('button',{name:'创建并进入空间',exact:true}).click();
  let busy=true;
  await page.route('**/api/research-map',route=>{
    if(!busy||route.request().postDataJSON()?.action!=='read')return route.continue();
    busy=false;
    return route.fulfill({status:503,headers:{'Retry-After':'10'},json:{code:'workspace_busy'}});
  });
  const mapWrites=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/research-map'&&request.method()!=='GET'&&request.postDataJSON()?.action!=='read')mapWrites.push(request.postDataJSON()?.action);});
  await research(page);
  await expect(page.getByRole('heading',{name:'研究路线',exact:true})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'研究数据暂时繁忙'})).toBeVisible();
  await page.getByRole('button',{name:'重试读取路线'}).click();
  await expect(page.getByRole('heading',{name:'还没有研究路线'})).toBeVisible();
  await expect(page.getByRole('button',{name:'生成研究路线',exact:true})).toBeEnabled();
  expect(mapWrites).toEqual([]);
});

test('a missing old research script reloads once while preserving the selected library context',async({page})=>{
  await page.goto('/__acceptance/start');
  const initialUrl=page.url();
  const compareRoute=page.getByRole('combobox',{name:'比较所属路线',exact:true});
  await compareRoute.selectOption('acceptance-quantum');
  const choice=page.getByRole('checkbox',{name:/^选择比较 Finite-blocklength/});
  await choice.check();
  const sessionURL=page.url();
  let missing=0, reloads=0;
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())reloads++;});
  await page.route(/research-leads-[^/]+\.js$/,route=>{
    if(missing++)return route.continue();
    return route.fulfill({status:404,body:'old asset removed'});
  });
  await research(page);
  await expect(page.getByRole('region',{name:'研究线索'})).toBeVisible();
  await expect(page).toHaveURL(/#threads\?/);
  expect(missing).toBe(2);
  expect(reloads).toBe(1);
  await page.goto(sessionURL);
  await expect(compareRoute).toHaveValue('acceptance-quantum');
  await expect(choice).toBeChecked();
  await expect(page.getByRole('textbox',{name:/搜索标题、作者/})).toHaveValue(new URLSearchParams(new URL(initialUrl).hash.split('?')[1]).get('q'));
});

test('legacy search and Today links reach the consolidated screens',async({page})=>{
  await page.goto('/__acceptance/start');
  await page.goto('/#threads?space=acceptance-library&graph=all&graphCompareTrack=acceptance-quantum&q=erasure&page=2');
  await expect(page).toHaveURL(/#library\?.*page=2/);
  await expect(page.getByRole('textbox',{name:/搜索标题、作者/})).toHaveValue('erasure');
  await expect(page.getByRole('combobox',{name:'比较所属路线',exact:true})).toHaveValue('acceptance-quantum');
  await page.goto('/demo#today?space=demo-mathematics&panel=reading');
  await expect(page.getByRole('heading',{name:'今日',exact:true})).toBeVisible();
  await expect(page.locator('#today-more-reading')).toHaveAttribute('open','');
  const utilities=page.getByRole('navigation',{name:'今日工具'});
  await expect(utilities.getByRole('link',{name:'全部阅读'})).toHaveCount(0);
  await expect(utilities.getByRole('link',{name:'研究记录'})).toHaveCount(0);
  await page.goto('/demo#today?space=demo-mathematics&panel=records');
  await expect(page.getByRole('button',{name:'回看阅读记录'})).toBeVisible();
  await page.getByRole('button',{name:'回看阅读记录'}).click();
  await expect(page).toHaveURL(/#memory\?.*section=reading/);
  await expect(page.getByText('按日期回看阅读')).toBeVisible();
});

test('the route task is the only route learning entry and restores its origin after refresh',async({page})=>{
  await page.goto('/__acceptance/start');
  await research(page);
  const leads=page.getByRole('region',{name:'研究线索',exact:true});
  await expect(leads.getByRole('button',{name:'学习路径',exact:true})).toHaveCount(0);
  await leads.getByRole('button',{name:'进入研究：量子编码条件比较',exact:true}).click();
  const current=page.getByRole('region',{name:'当前任务',exact:true});
  await expect(current.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'补充基础阅读',exact:true})).toHaveCount(0);
  await page.locator('.v2-route-management > summary').click();
  await expect(page.locator('.v2-route-management')).toHaveAttribute('open','');
  await expect(page.locator('.v2-research-decision-next')).toHaveCount(0);
  await page.getByRole('navigation',{name:'路线工作区'}).getByRole('button',{name:'任务',exact:true}).click();
  await expect(page).toHaveURL(/#thread\/acceptance-quantum\/agenda/);
  const origin=new URL(page.url()).hash;
  await page.getByRole('button',{name:'补充基础阅读',exact:true}).click();
  await expect(page).toHaveURL(/#learn\?.*track=acceptance-quantum/);
  await page.reload();
  const target=page.locator('#learning-goal-fields select').first();
  await expect(target).toHaveValue('acceptance-quantum');
  await expect(target.locator('option:checked')).toHaveText('量子编码条件比较');
  await page.getByRole('link',{name:'返回路线任务',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).hash).toBe(origin);
  await expect(page.getByRole('button',{name:'补充基础阅读',exact:true})).toBeVisible();
});

test('route materials show the exact pending papers and keep old search links usable',async({page})=>{
  await page.goto('/__acceptance/start');
  const route='/#thread/acceptance-quantum/';
  await page.goto(route+'evidence?space=acceptance-library');
  const supplement=page.locator('.pi-materials-supplement');
  const list=page.getByRole('region',{name:'路线论文列表'});
  await expect(supplement).not.toHaveAttribute('open','');
  await expect(list.getByRole('heading',{name:'Search intake fixture Alpha'})).toHaveCount(0);
  await list.getByRole('button',{name:/^待确认\s*1$/}).click();
  await expect(page).toHaveURL(/materialGroup=pending/);
  const paper=list.getByRole('button',{name:'Search intake fixture Alpha'});
  await expect(paper).toBeVisible();
  await expect(list.getByText('核对擦除信道的反馈约束。')).toBeVisible();
  await expect(list.getByRole('heading',{name:'Search intake fixture Beta'})).toHaveCount(0);
  await list.getByRole('searchbox').fill('intake fixture');
  await paper.click();
  await expect(page).toHaveURL(/#paper\/acceptance-intake-alpha/);
  await page.reload();
  await page.getByRole('button',{name:'← 返回原路线',exact:true}).click();
  await expect(list.getByRole('searchbox')).toHaveValue('intake fixture');
  await expect(list.getByRole('button',{name:/^待确认\s*1$/})).toHaveAttribute('aria-pressed','true');
  await expect(paper).toBeVisible();
  await page.goto(route+'gaps?space=acceptance-library');
  await expect(supplement).toHaveAttribute('open','');
  await supplement.locator(':scope > summary').click();
  await expect(supplement).not.toHaveAttribute('open','');
  await expect(page).toHaveURL(/#thread\/acceptance-quantum\/evidence/);
});
