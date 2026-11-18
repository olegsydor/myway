const { chromium } = require(process.env.MYWAY_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(process.env.EVIDENCE_DIR || 'stage19-browser-evidence');
fs.mkdirSync(out, { recursive:true });
const origin = process.env.MYWAY_TEST_ORIGIN || 'http://localhost:5173';
const password = 'Browser test password 19';
const email = `browser-${Date.now()}@example.com`;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function latestToken(kind, address) {
  for (let i=0;i<50;i++) {
    const folder=process.env.MYWAY_TEST_MAIL_DIR || '/tmp/myway-mail';
    if(fs.existsSync(folder)) for(const f of fs.readdirSync(folder)) {
      const body=fs.readFileSync(path.join(folder,f),'utf8').replace(/=\r?\n/g,'');
      if(body.includes(address)) {const found=body.match(new RegExp(`#${kind}/([A-Za-z0-9_-]{32,128})`));if(found)return found[1];}
    }
    await wait(100);
  }
  throw Error('Email not delivered');
}
async function workspaceReady(page) {
  await Promise.race([page.locator('.react-flow').waitFor(),page.getByRole('button',{name:'Restore',exact:true}).waitFor()]);
  const restore=page.getByRole('button',{name:'Restore',exact:true});
  if(await restore.isVisible())await restore.click();
  await page.locator('.react-flow').waitFor();
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(origin);
  await page.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  await page.screenshot({path:path.join(out,'login.png'),fullPage:true});
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Browser Person');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password (15–128 characters)',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByText('If eligible, a verification email will arrive.',{exact:false}).waitFor();
  const token=await latestToken('verify-email',email);
  await page.goto(`${origin}/#verify-email/${token}`);
  await page.getByRole('heading',{name:'Confirm your email and password'}).waitFor();
  assert(!page.url().includes(token));
  await page.getByLabel('Password (15–128 characters)',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Verify email and set password',exact:true}).click();
  await page.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Account',exact:true}).waitFor();
  await workspaceReady(page);
  assert.equal(await page.locator('.react-flow__node').count(),0);
  await page.screenshot({path:path.join(out,'first-run.png'),fullPage:true});
  const tools=page.locator('[data-tools-toggle]');
  if(await tools.getAttribute('aria-expanded')==='false') await tools.click();
  const create=page.locator('[data-graph-create]').first();
  await create.getByLabel('Name',{exact:true}).fill('My private node');
  await create.getByRole('button',{name:'Add Node',exact:true}).click();
  await page.locator('.react-flow__node').first().waitFor();
  const save=page.getByRole('button',{name:'Save',exact:true});
  await save.click();
  await page.getByText('Main',{exact:true}).first().waitFor();
  await page.reload();
  await page.locator('.react-flow__node').first().waitFor();
  await page.screenshot({path:path.join(out,'workspace.png'),fullPage:true});
  // Dirty layout survives logout under its original scope, never rendered while anonymous.
  const node=page.locator('.react-flow__node').first();const box=await node.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+50,{steps:8});await page.mouse.up();
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('dialog',{name:'Account'}).waitFor();
  await page.screenshot({path:path.join(out,'account.png'),fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
  await page.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  assert.equal(await page.locator('.react-flow__node').count(),0);
  const recoveries=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('myway-layout-recovery');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('recoveries','readonly');const req=tx.objectStore('recoveries').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);};
  }));
  assert(recoveries.length>0);
  // Same-browser second tab is notified immediately when the account logs out.
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await workspaceReady(page);
  const second=await context.newPage();await second.goto(origin);await workspaceReady(second);
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  const leave=page.getByRole('button',{name:'Leave without saving',exact:true});if(await leave.isVisible())await leave.click();
  await second.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  const secondEmail=email.replace('@','-second@');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Second Person');
  await page.getByLabel('Email',{exact:true}).fill(secondEmail);
  await page.getByLabel('Password (15–128 characters)',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByText('If eligible, a verification email will arrive.',{exact:false}).waitFor();
  const secondToken=await latestToken('verify-email',secondEmail);
  await page.goto(`${origin}/#verify-email/${secondToken}`);
  await page.getByRole('heading',{name:'Confirm your email and password'}).waitFor();
  await page.getByLabel('Password (15–128 characters)',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Verify email and set password',exact:true}).click();
  await page.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  await page.getByLabel('Email',{exact:true}).fill(secondEmail);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await workspaceReady(page);
  assert.equal(await page.locator('.react-flow__node').count(),0);
  assert.equal(await page.getByRole('button',{name:'Restore',exact:true}).count(),0);
  await page.screenshot({path:path.join(out,'isolated-second-account.png'),fullPage:true});
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  const finalLeave=page.getByRole('button',{name:'Leave without saving',exact:true});if(await finalLeave.isVisible())await finalLeave.click();
  await page.getByRole('heading',{name:'Welcome to My Way'}).waitFor();
  // Mobile auth layout is usable and fits the viewport.
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'login-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,email,scenarios:['registration','email verification','token removed from URL','login','empty first run','create node','save Main layout','reload session and graph','dirty logout recovery','anonymous graph teardown','cross-tab logout','same-browser second-account isolation','hash-link routing without reload','mobile layout'],pageErrors:errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
