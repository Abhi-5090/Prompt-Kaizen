import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel:'chrome', headless:true });
const p = await b.newPage();
p.on('console', m => m.type()==='error' && console.log('  [console error]', m.text().slice(0,160)));
p.on('requestfailed', r => console.log('  [request FAILED]', r.method(), r.url().slice(0,70), '->', r.failure()?.errorText));
p.on('response', async r => {
  if (r.url().includes('/api/prompts/analyze')) {
    console.log('  [analyze response]', r.status(), r.statusText());
    try { console.log('  [body]', (await r.text()).slice(0,200)); } catch(e){ console.log('  [body unreadable]', e.message); }
  }
});

await p.goto('http://localhost:5173/login');
await p.getByLabel(/email/i).first().fill('llm@test.com');
await p.getByLabel(/password/i).first().fill('Quokka7!Harbour');
await p.getByRole('button',{name:/sign in|log in/i}).first().click();
await p.waitForURL(/dashboard/,{timeout:20000});
console.log('logged in');

await p.goto('http://localhost:5173/analyze');
await p.selectOption('select', 'Email Writing');
await p.waitForTimeout(1500);
await p.locator('textarea').first().fill('Act as a professional communication specialist. Write a formal email to the Principal requesting approval to run a hands-on AI workshop for B.Tech students this Saturday, under 180 words with a clear subject line.');
console.log('clicking Analyze Prompt...');
const t0 = Date.now();
await p.getByRole('button',{name:/analyze prompt/i}).click();
await p.waitForTimeout(30000);
console.log('elapsed', Date.now()-t0, 'ms | url now:', p.url());
const toast = await p.locator('div').filter({hasText:/failed|error/i}).last().textContent().catch(()=>null);
console.log('toast text:', toast?.slice(0,120));
await b.close();
