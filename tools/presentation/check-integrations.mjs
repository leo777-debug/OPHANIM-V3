import assert from 'node:assert/strict';

/** Actual local routes/storage, synthetic organization sessions, blocked external APIs. */
export async function checkIntegrations({browser,url,owner,viewer,credentials,request,output,pass}) {
  for(const [token,status] of [[undefined,401],[viewer,403]]) {
    const response=await request('/api/platform/integrations',{token});
    assert.equal(response.status,status);
  }
  const rejected=await request('/api/platform/integrations',{method:'POST',token:owner,body:{id:'ai',apiKey:'SYNTHETIC-NEVER-STORE'}});
  assert.equal(rejected.status,400);
  assert.ok(!(await rejected.text()).includes('SYNTHETIC-NEVER-STORE'));
  const listing=await request('/api/platform/integrations',{token:owner});
  assert.equal(listing.headers.get('Cache-Control'),'private, no-store');
  const text=await listing.text(),catalog=JSON.parse(text);
  assert.ok(catalog.integrations.length>=60);
  assert.ok(!text.includes(owner)&&!text.includes(credentials.password));
  pass('Integrations API rejects unsigned/viewer access and browser-supplied keys; listing contains metadata only');

  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(url+'/admin/integrations',{waitUntil:'domcontentloaded'});
    const login=page.getByRole('link',{name:'Sign in to see your organization’s data',exact:true});
    await login.waitFor();
    assert.ok((await login.getAttribute('href')).includes('returnTo=%2Fadmin%2Fintegrations'));
    await page.screenshot({path:`${output}/screenshots/integrations-sign-in.png`});
    await login.click();
    await page.getByRole('heading',{name:'Sign in to Ophanim',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/login');
    assert.equal(new URL(page.url()).searchParams.get('admin'),'1');
    await page.getByLabel('Organization slug',{exact:true}).fill(credentials.organizationSlug);
    await page.getByLabel('Work email',{exact:true}).fill(credentials.email);
    await page.getByLabel('Password',{exact:true}).fill(credentials.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL('**/admin/integrations');
    await page.getByRole('heading',{name:'External services',exact:true}).waitFor();
    const search=page.getByLabel('Find an integration',{exact:true});
    await search.fill('OpenAI-compatible');
    const ai=page.getByRole('article').filter({has:page.getByRole('heading',{name:'OpenAI-compatible / Mistral / local AI',exact:true})});
    await ai.getByText('Not configured',{exact:true}).waitFor();
    const unconfigured=page.waitForResponse(response=>response.url()===url+'/api/platform/integrations'&&response.request().method()==='POST');
    await ai.getByRole('button',{name:'Test connection',exact:true}).click();
    assert.equal((await (await unconfigured).json()).integration.status,'Not configured');
    await ai.getByText('Last successful connection: Never observed',{exact:true}).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(),0);
    pass('Real sign-in returns to Integrations during Presentation; missing AI credentials stay unconfigured and are never displayed');

    await search.fill('GDACS normalized');
    const gdacs=page.getByRole('article').filter({has:page.getByRole('heading',{name:'GDACS normalized hazard events',exact:true})});
    await gdacs.getByText('Disabled by licence',{exact:true}).waitFor();
    assert.equal(await gdacs.getByRole('button',{name:'Test connection',exact:true}).isDisabled(),true);
    pass('Unknown commercial rights disable the source and its connection action');

    await search.fill('FAA public NAS');
    const faa=()=>page.getByRole('article').filter({has:page.getByRole('heading',{name:'FAA public NAS airport status',exact:true})});
    const tested=page.waitForResponse(response=>response.url()===url+'/api/platform/integrations'&&response.request().method()==='POST');
    await faa().getByRole('button',{name:'Test connection',exact:true}).click();
    const result=(await (await tested).json()).integration;
    assert.equal(result.status,'Error','External networking is deliberately blocked; do not fabricate a connection success');
    assert.ok(result.observation.checkedAt);
    assert.equal(result.observation.lastSuccessAt,null);
    assert.equal(result.observation.scope,'connection');
    await faa().getByText('Error',{exact:true}).waitFor();
    await page.reload({waitUntil:'domcontentloaded'});
    await search.fill('FAA public NAS');
    await faa().getByText('Error',{exact:true}).waitFor();
    await faa().getByText('Last successful connection: Never observed',{exact:true}).waitFor();
    await page.screenshot({path:`${output}/screenshots/integrations-owner.png`});
    pass('Actual connection failure records its time/error, survives reload, and never invents a successful fetch');

    await page.getByLabel(/^Service to configure/).selectOption('sdk');
    await page.getByRole('button',{name:'Next step',exact:true}).click();
    await page.getByLabel('Optional organization UUID draft',{exact:true}).fill('10000000-0000-4000-8000-000000000001');
    await page.getByRole('button',{name:'Next step',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Send synthetic test event',exact:true}).isDisabled(),true);
    await page.getByText(/Configuration: Not configured/).waitFor();
    assert.ok(await page.getByRole('button',{name:'Send synthetic test event',exact:true}).evaluate(button=>Number(getComputedStyle(button).opacity)<=.6));
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/screenshots/integrations-mobile-setup.png`});
    assert.equal(await page.getByRole('heading',{name:'3. Test the configured deployment',exact:true}).count(),1);
    assert.equal(errors.length,0,errors.join('\n'));
    pass('Credential-free SDK wizard gates diagnostics when unconfigured and fits the mobile viewport');
  } finally {await context.close();}
}
