// Runs against the built desktop renderer. Only account, library records and native IPC use fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright-core',{paths:['./work/browser-tools',process.cwd()]}));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const url=process.env.PAPERLEAF_UI_URL||'http://127.0.0.1:4173';
try {
  for(const [width,height] of [[1150,540],[390,560]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const topics=Array.from({length:40},(_,i)=>({id:'topic-'+i,name:'滚动测试主题 '+(i+1),created:i}));
    await page.addInitScript(()=>{
      window.paperleafDesktop={
        version:'1.5.3',
        request:async()=>({version:'1.5.3',account:{type:'chatgpt'},connected:true,models:[]}),
        update:async()=>({status:'current',currentVersion:'1.5.3'}),
        disconnect:async()=>{},
      };
    });
    await page.route('**/api/**',route=>{
      const p=new URL(route.request().url()).pathname;
      const data=p==='/api/account'?{platformSignedIn:true,hasAccount:true,account:{id:'scroll-qa',username:'scroll-qa',displayName:'滚动测试账号'}}:p==='/api/collections'?topics:[];
      return route.fulfill({json:data});
    });
    await page.goto(url,{waitUntil:'domcontentloaded'});
    if(width<700) await page.getByRole('button',{name:'打开导航'}).click();
    const sidebar=page.getByRole('complementary',{name:'文献库导航'});
    await sidebar.getByText('滚动测试主题 40',{exact:true}).waitFor({state:'attached'});
    const footer=sidebar.locator('button.profile');
    const mainOffset=()=>page.evaluate(()=>({body:window.scrollY,main:document.querySelector('.main-shell').scrollTop}));
    const original=await mainOffset();
    const initial=await sidebar.evaluate(el=>({top:el.scrollTop,height:el.clientHeight,scroll:el.scrollHeight}));
    assert.equal(initial.top,0);assert(initial.scroll>initial.height*2);
    assert((await footer.boundingBox()).y>height);
    await sidebar.hover({position:{x:40,y:120}});
    await page.mouse.wheel(0,460);
    await page.waitForFunction(()=>document.querySelector('aside.sidebar').scrollTop>100);
    assert.deepEqual(await mainOffset(),original);
    await sidebar.focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>{const s=document.querySelector('aside.sidebar');return s.scrollHeight-s.clientHeight-s.scrollTop<3});
    const last=await footer.boundingBox();
    assert(last.y>=0&&last.y+last.height<=height+1,'Last account control must be reachable');
    await page.mouse.wheel(0,650);
    await page.keyboard.press('PageUp');
    await page.waitForFunction(()=>{const s=document.querySelector('aside.sidebar');return s.scrollHeight-s.clientHeight-s.scrollTop>50});
    await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('aside.sidebar').scrollTop<2);
    assert.deepEqual(await mainOffset(),original);
    console.log('PASS: '+width+'×'+height+' · 40 topics · wheel and boundary containment, keyboard paging, updates and account controls on the actual library sidebar.');
    await page.close();
  }
} finally { await browser.close(); }
