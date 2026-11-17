/* Optional production-preview browser checks. Requires an external Playwright installation. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {pathToFileURL}=require('node:url');
const os=require('node:os');
const REPO_ROOT=path.resolve(__dirname,'../..');
const OUTPUT=process.env.HEARTLAND_BROWSER_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'heartland-globe-'));
fs.mkdirSync(OUTPUT,{recursive:true});process.chdir(OUTPUT);
const {chromium}=require(process.env.HEARTLAND_PLAYWRIGHT_MODULE||'playwright-core');
const URL_BASE=process.env.HEARTLAND_TEST_URL||'http://localhost:4173/heartland/';
const issues=[],samples=[];
let math;
const distance=(a,b)=>Math.hypot(math.wrapLongitude(a[0]-b[0]),a[1]-b[1]);
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function pose(page){return page.locator('.atlas-viewport').evaluate(e=>({zoom:+e.dataset.zoom,lon:+e.dataset.longitude,lat:+e.dataset.latitude,bearing:+e.dataset.bearing,mode:e.dataset.projection,blend:+e.dataset.flatBlend,rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}))}
function asCamera(p){return {zoom:p.zoom,focus:[p.lon,p.lat],projection:p.mode==='globe'?'globe':'flat',flatOnly:p.mode==='flat-fallback'}}
async function overflow(page){assert.deepEqual(await page.evaluate(()=>[document.documentElement.scrollWidth<=innerWidth,document.documentElement.scrollHeight<=innerHeight,scrollX,scrollY]),[true,true,0,0])}
async function start(browser,width,height,options={}){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:width<900,deviceScaleFactor:2,...options});
 await context.addInitScript(()=>{window.__draws=0;const draw=WebGLRenderingContext.prototype.drawElements;WebGLRenderingContext.prototype.drawElements=function(...args){window.__draws++;window.__lastDraw=args;return draw.apply(this,args)}});
 const page=await context.newPage();page.on('pageerror',e=>issues.push(String(e)));const requests=[];page.on('request',r=>{if(/\/atlas\/|\/geography\//.test(r.url()))requests.push(r.url())});
 await page.goto(URL_BASE);await page.getByRole('button',{name:'Fictional game',exact:true}).click();await page.getByLabel('Player country').selectOption('alden');await page.getByRole('button',{name:'Start local scenario'}).click();assert.equal(await page.getByRole('button',{name:'Next week',exact:true}).count(),1);return {context,page,requests};
}
async function atlas(page){await page.getByRole('button',{name:'Scenario menu'}).click();await page.getByRole('button',{name:'Return to globe',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.atlas-viewport')&&window.__draws>1);await page.waitForTimeout(650)}
async function steer(page,lon,lat){
 await page.getByRole('button',{name:'Reset atlas view',exact:true}).click();await settle(page);
 for(let n=0;n<60;n++){
  const p=await pose(page),dlon=math.wrapLongitude(lon-p.lon),dlat=Math.max(-89.9,Math.min(89.9,lat))-p.lat;
  if(Math.abs(dlon)<.05&&Math.abs(dlat)<.05)return;
  const scale=math.northScale(asCamera(p),p.rect),cosine=Math.max(.1,Math.cos(p.lat*Math.PI/180));
  const dx=Math.max(-p.rect.width*.35,Math.min(p.rect.width*.35,-dlon*scale*cosine));
  const dy=Math.max(-p.rect.height*.35,Math.min(p.rect.height*.35,dlat*scale));
  const x=p.rect.x+p.rect.width/2,y=p.rect.y+p.rect.height/2;
  await page.mouse.move(x,y);await page.mouse.down();if(Math.hypot(dx,dy)<7)await page.mouse.move(x+8,y);await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up();await settle(page);
 }throw new Error('steer did not reach requested geographic focus '+JSON.stringify({lon,lat,actual:await pose(page)}));
}
async function zoomToFlat(page){for(let n=0;n<15&&(await pose(page)).mode==='globe';n++){await page.getByRole('button',{name:'Zoom in atlas',exact:true}).click();await settle(page)}await page.waitForFunction(()=>document.querySelector('.atlas-viewport').dataset.flatBlend==='1');await page.waitForTimeout(900)}
async function checkNorthUpAndBorders(page){
 await steer(page,12,46);
 const surface=page.locator('.atlas-viewport');
 await surface.evaluate(e=>e.addEventListener('pointerdown',event=>window.__nativePointer=event.pointerId,{once:true}));
 let p=await pose(page),cx=p.rect.x+p.rect.width/2,cy=p.rect.y+p.rect.height/2;
 await page.mouse.move(cx,cy);await page.mouse.down();
 await page.evaluate(async()=>{
  const e=document.querySelector('.atlas-viewport'),r=e.getBoundingClientRect(),id=window.__nativePointer,x=r.x+r.width/2,y=r.y+r.height/2;
  const send=(type,xx,yy)=>e.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:xx,clientY:yy}));
  send('pointercancel',x,y);
  for(let i=0;i<2000;i++){
   const dx=i%2?0:(Math.cos(i*.019)<0?-12:12),dy=i%2?(Math.sin(i*.017)<0?-10:10):0;
   send('pointerdown',x,y);send('pointermove',x+dx,y+dy);send('pointerup',x+dx,y+dy);
   if(i%50===0){
    for(let frame=0;frame<4;frame++)await new Promise(resolve=>requestAnimationFrame(resolve));
    if(+e.dataset.bearing!==0)throw new Error('camera acquired roll');
    const gl=document.querySelector('.atlas-globe').getContext('webgl'),program=gl.getParameter(gl.CURRENT_PROGRAM),m=gl.getUniform(program,gl.getUniformLocation(program,'rotation'));
    const lon=+e.dataset.longitude*Math.PI/180,lat=+e.dataset.latitude*Math.PI/180;
    const north=[-Math.sin(lat)*Math.sin(lon),Math.cos(lat),-Math.sin(lat)*Math.cos(lon)];
    const screen=[0,1,2].map(row=>north.reduce((sum,v,axis)=>sum+v*m[axis*3+row],0));
    if(Math.abs(screen[0])>.0001||Math.abs(screen[1]-1)>.0001||Math.abs(screen[2])>.0001)throw new Error('actual GPU rotation lost north-up '+JSON.stringify({screen,m:[...m],lon,lat}));
   }
  }
 });
 await page.mouse.up();await settle(page);assert.equal((await pose(page)).bearing,0);
 assert.equal(await page.locator('.atlas-country-panel').count(),0,'2,000 completed drags never select a country');
 await steer(page,12,46);await surface.focus();for(let i=0;i<3;i++){await page.keyboard.press('+');await settle(page)}
 p=await pose(page);for(let i=0;i<24;i++){const q=await pose(page),x=q.rect.x+q.rect.width/2,y=q.rect.y+q.rect.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-35,y);await page.mouse.up();await settle(page);assert.ok(Math.abs((await pose(page)).lat-46)<.001);assert.equal((await pose(page)).bearing,0)}
 await page.screenshot({path:'globe-asia-north-up-390.png',scale:'css'});
 await steer(page,2,46);p=await pose(page);const threshold=math.transitionZoom(asCamera(p),p.rect);
 async function exactZoom(zoom){for(let n=0;n<20;n++){const q=await pose(page);if(Math.abs(q.zoom-zoom)<.00001)return;await surface.evaluate((e,target)=>{const r=e.getBoundingClientRect();e.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,deltaY:-Math.log(target/+e.dataset.zoom)/.003}))},zoom);await settle(page)}throw new Error('exact zoom did not settle')}
 await exactZoom(threshold*.98);await page.waitForTimeout(900);const before=await pose(page);assert.equal(before.mode,'globe');assert.equal(await surface.getAttribute('data-detail-blend'),'0');
 const globeWidth=await surface.getAttribute('data-border-width');
 const glLine=await page.locator('.atlas-globe').evaluate(c=>{const gl=c.getContext('webgl');return {width:gl.getParameter(gl.LINE_WIDTH),error:gl.getError()}});assert.deepEqual(glLine,{width:1,error:0});
 await page.screenshot({path:'globe-europe-before-handoff-390.png',scale:'css'});
 await exactZoom(threshold*1.03);await page.waitForFunction(()=>document.querySelector('.atlas-viewport').dataset.flatBlend==='1');await page.waitForTimeout(350);
 assert.equal(await surface.getAttribute('data-border-width'),globeWidth);assert.equal(await surface.getAttribute('data-detail-blend'),'0');
 assert.ok(Math.abs(+(await page.locator('.atlas-country-borders').getAttribute('stroke-width'))-+globeWidth)<.00001);
 const after=await pose(page),screen=math.projectWorld(asCamera(after),after.rect,[before.lon,before.lat]);assert.ok(Math.hypot(screen.x-after.rect.width/2,screen.y-after.rect.height/2)<.1,'handoff focus differs by less than 0.1 CSS pixel');
 await page.screenshot({path:'flat-europe-after-handoff-390.png',scale:'css'});
 await page.evaluate(()=>{window.__detailFrames=[];new MutationObserver(()=>{for(const g of document.querySelectorAll('[data-political-stage]')){const opacity=+(g.getAttribute('opacity')||1);if(opacity>0&&opacity<1)window.__detailFrames.push(opacity)}}).observe(document.querySelector('.atlas-svg'),{attributes:true,subtree:true})});
 await exactZoom(threshold*1.55);await page.waitForTimeout(1200);const blend=+(await surface.getAttribute('data-detail-blend'));assert.ok(blend>.1&&blend<1);assert.ok((await page.evaluate(()=>window.__detailFrames)).length>0,'source detail has intermediate opacity frames');
 await page.screenshot({path:'flat-europe-detail-390.png',scale:'css'});await overflow(page);
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(450);await overflow(page);assert.equal((await pose(page)).bearing,0);await page.screenshot({path:'globe-europe-landscape-844.png',scale:'css'});const landscape=await pose(page);await exactZoom(math.transitionZoom(asCamera(landscape),landscape.rect)*1.1);await page.waitForFunction(()=>document.querySelector('.atlas-viewport').dataset.flatBlend==='1');await page.waitForTimeout(450);await overflow(page);await page.screenshot({path:'flat-europe-landscape-844.png',scale:'css'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
 console.log('PASS 2000 DOM drags keep actual GPU north-up; Europe/Asia, matched vector stroke, staged detail/fade, portrait/landscape captures');
}
(async()=>{math=await import(pathToFileURL(path.join(REPO_ROOT,'src/geography/worldCamera.ts')).href);const browser=await chromium.launch({executablePath:process.env.HEARTLAND_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
for(const [width,height]of (process.env.HEARTLAND_VIEWPORTS?JSON.parse(process.env.HEARTLAND_VIEWPORTS):[[320,568],[390,844],[844,390],[568,320],[1024,768],[1440,900]])){
 const {context,page,requests}=await start(browser,width,height);await atlas(page);let p=await pose(page);assert.equal(p.mode,'globe');assert.equal(p.zoom,1);
 assert.ok(requests.every(r=>!r.includes('50m')&&!r.includes('/countries/')&&!r.includes('/raster/')&&!r.includes('/hydrology/')),'global start requests only coarse data');
 const gl=await page.locator('.atlas-globe').evaluate(c=>{const g=c.getContext('webgl');return {error:g.getError(),depth:g.isEnabled(g.DEPTH_TEST),cull:g.isEnabled(g.CULL_FACE),pixels:c.width*c.height}});assert.deepEqual([gl.error,gl.depth,gl.cull],[0,true,true]);assert.ok(gl.pixels<=2003000);assert.equal((await page.evaluate(()=>window.__lastDraw))[1],96*64*6);
 const count=await page.evaluate(()=>window.__draws);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>window.__draws),count,'idle globe does not run a render loop');await page.screenshot({path:`globe-${width}.png`,scale:'css'});await overflow(page);
 const b=p.rect;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+Math.min(65,b.height*.22),b.y+b.height/2-15,{steps:8});await page.mouse.up();await settle(page);assert.ok(distance([(await pose(page)).lon,(await pose(page)).lat],[p.lon,p.lat])>5,'mouse rotates sphere');
 await page.getByRole('button',{name:'Reset atlas view',exact:true}).click();await settle(page);p=await pose(page);const from={x:p.rect.width/2+25,y:p.rect.height/2-15};let anchor=math.unprojectWorld(asCamera(p),p.rect,from);await page.evaluate(()=>document.querySelector('.atlas-viewport').addEventListener('wheel',e=>{window.__wheelPoint={x:e.clientX,y:e.clientY}},{once:true}));await page.mouse.move(p.rect.x+from.x,p.rect.y+from.y);await page.mouse.wheel(0,-80);await page.waitForFunction(z=>+document.querySelector('.atlas-viewport').dataset.zoom>z,p.zoom);await settle(page);let after=await pose(page);const wheelPoint=await page.evaluate(()=>window.__wheelPoint);from.x=wheelPoint.x-p.rect.x;from.y=wheelPoint.y-p.rect.y;anchor=math.unprojectWorld(asCamera(p),p.rect,from);assert.ok(distance(math.unprojectWorld(asCamera(after),after.rect,from),anchor)<.002,JSON.stringify({label:'wheel anchor',p,after,anchor,actual:math.unprojectWorld(asCamera(after),after.rect,from)}));
 const toggle=page.getByRole('button',{name:'Physical terrain',exact:true});await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');await page.getByRole('button',{name:'Reset atlas view',exact:true}).click();await settle(page);p=await pose(page);
 await page.evaluate(()=>{window.__blendFrames=[];const e=document.querySelector('.atlas-viewport');new MutationObserver(()=>window.__blendFrames.push({blend:+e.dataset.flatBlend,lon:+e.dataset.longitude,lat:+e.dataset.latitude})).observe(e,{attributes:true})});
 await zoomToFlat(page);after=await pose(page);assert.ok(distance([after.lon,after.lat],[p.lon,p.lat])<.0001,'handoff keeps focus');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.ok(await page.locator('.atlas-political [data-country]').count()>0);
 const frames=await page.evaluate(()=>window.__blendFrames);assert.ok(frames.some(f=>f.blend>0&&f.blend<1),'animated crossfade has intermediate frames');assert.ok(frames.every(f=>Math.hypot(f.lon-12,f.lat-20)<.001));
 const m=await page.locator('.atlas-camera').evaluate(g=>{const m=g.transform.baseVal.consolidate().matrix;return {a:m.a,b:m.b,c:m.c,d:m.d}});const layout=math.worldLayout(asCamera(after),after.rect);assert.ok(Math.abs(Math.hypot(m.a,m.b)-layout.scale*layout.longitudeScale)<.0001);assert.ok(Math.abs(Math.hypot(m.c,m.d)-layout.scale)<.0001);
 await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');await page.locator('.atlas-terrain-overview').waitFor();await page.waitForTimeout(700);await page.screenshot({path:`map-${width}.png`,scale:'css'});await overflow(page);
 for(let n=0;n<15&&(await pose(page)).mode!=='globe';n++){await page.getByRole('button',{name:'Zoom out atlas',exact:true}).click();await settle(page)}await page.waitForFunction(()=>document.querySelector('.atlas-viewport').dataset.flatBlend==='0');assert.ok(distance([(await pose(page)).lon,(await pose(page)).lat],[p.lon,p.lat])<.0001,'return keeps focus');assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 const controls=await page.locator('.atlas-controls').boundingBox(),frame=await page.locator('.atlas-frame').boundingBox();assert.ok(controls.y+controls.height<=frame.y+frame.height+.1);const sizes=await page.locator('.atlas-view button:visible').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return[r.width,r.height]}));assert.ok(sizes.every(([w,h])=>w>=44&&h>=44));
 if(width===390){
  // Real browser two-contact pinch and the following single-finger drag.
  await page.getByRole('button',{name:'Reset atlas view',exact:true}).click();await settle(page);p=await pose(page);const cdp=await context.newCDPSession(page);const touch=(type,ps)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:ps.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3}))});const cx=p.rect.x+p.rect.width/2,cy=p.rect.y+p.rect.height/2;
  await touch('touchStart',[[cx-25,cy-15,1],[cx+25,cy-15,2]]);for(let n=1;n<=7;n++)await touch('touchMove',[[cx-25-n*4,cy-15+n,1],[cx+25+n*4,cy-15+n,2]]);await touch('touchEnd',[]);await settle(page);assert.ok((await pose(page)).zoom>2);const old=await pose(page);await touch('touchStart',[[cx,cy,1]]);await touch('touchMove',[[cx-30,cy+20,1]]);await touch('touchEnd',[]);await settle(page);assert.ok(distance([old.lon,old.lat],[(await pose(page)).lon,(await pose(page)).lat])>1);
  // Sample actual rendered country colors on the front surface, with terrain disabled.
  await toggle.click();const political=JSON.parse(fs.readFileSync(path.join(REPO_ROOT,'public/atlas/political.json'),'utf8')).countries;
  for(const [code,lon,lat]of [['FRA',2,46],['DEU',10,51],['USA',-100,40],['RUS',100,60],['CHN',105,35],['BRA',-50,-10],['AUS',134,-24]]){await steer(page,lon,lat);await page.waitForTimeout(120);const state=await pose(page);const file=`color-${code}.png`;await page.screenshot({path:file,scale:'css'});const pixel=await page.locator('.atlas-globe').evaluate(c=>{const g=c.getContext('webgl'),pixel=new Uint8Array(4);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.drawElements(g.TRIANGLES,96*64*6,g.UNSIGNED_SHORT,0);g.readPixels(Math.floor(c.width/2),Math.floor(c.height/2),1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);return [...pixel]});samples.push({code,file,pixel,color:political.find(c=>c.id==='ne:admin0:'+code).color,point:[Math.round(state.rect.x+state.rect.width/2),Math.round(state.rect.y+state.rect.height/2)]})}for(const sample of samples){const expected=[1,3,5].map(i=>parseInt(sample.color.slice(i,i+2),16));assert.ok(sample.pixel[3]===255&&expected.every((v,i)=>Math.abs(v-sample.pixel[i])<18),JSON.stringify(sample))}fs.writeFileSync('color-samples.json',JSON.stringify(samples,null,2));
  await toggle.click();await steer(page,2,46);await zoomToFlat(page);assert.ok(await page.locator('[data-country="ne:admin0:FRA"]').count()>0);await page.screenshot({path:'map-france-390.png',scale:'css'});await steer(page,179,-18);await page.screenshot({path:'globe-date-line.png',scale:'css'});await zoomToFlat(page);await page.getByRole('button',{name:'Zoom in atlas',exact:true}).click();await settle(page);await page.waitForTimeout(900);assert.equal(await page.locator('.atlas-political').count(),2);assert.ok(requests.some(r=>r.includes('/countries/FJI.geojson')));await page.waitForTimeout(600);await page.locator('.atlas-viewport').focus();await page.keyboard.press('Shift+ArrowRight');await settle(page);assert.ok((await pose(page)).lon<0,'pan crosses date line continuously');await page.keyboard.press('Shift+ArrowLeft');await settle(page);await page.waitForTimeout(400);await page.screenshot({path:'map-date-line.png',scale:'css'});const tileIds=await page.locator('.atlas-terrain-tile').evaluateAll(es=>es.map(e=>e.dataset.tile));assert.ok(tileIds.some(id=>/\/0-/.test(id))&&tileIds.some(id=>/\/15-/.test(id)),'terrain uses both date-line sides');
  await steer(page,0,89);for(let n=0;n<14&&(await pose(page)).zoom<128;n++){const previous=(await pose(page)).zoom;await page.getByRole('button',{name:'Zoom in atlas',exact:true}).click();await page.waitForFunction(z=>+document.querySelector('.atlas-viewport').dataset.zoom>z,previous);await settle(page)}await settle(page);assert.equal((await pose(page)).mode,'globe');assert.equal((await pose(page)).zoom,128);await page.screenshot({path:'globe-north-pole-close.png',scale:'css'});await steer(page,0,-90);await page.screenshot({path:'globe-south-pole.png',scale:'css'});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);await overflow(page);assert.equal((await pose(page)).mode,'globe');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await checkNorthUpAndBorders(page);
 }
 await page.getByRole('button',{name:'Reset atlas view',exact:true}).click();await settle(page);assert.equal((await pose(page)).zoom,1);await page.getByRole('button',{name:'About the world atlas',exact:true}).click();assert.match(await page.locator('#atlas-information').textContent(),/not military ownership/);await page.getByRole('button',{name:'Back from About the world atlas',exact:true}).click();await page.getByRole('button',{name:'Resume game',exact:true}).click();assert.equal(await page.locator('.map-region').count(),6);await page.getByRole('button',{name:'Amber Plain, Belora',exact:true}).click();assert.equal(await page.locator('#region-details-title').textContent(),'Amber Plain');await page.getByRole('button',{name:'Next week',exact:true}).click();assert.equal(await page.locator('.game-meta dd').first().textContent(),'Week 2');await overflow(page);console.log(`PASS globe/map ${width}x${height}: sphere, GPU bounds, idle, gestures/keys, focus/scale/fade, terrain, scenario/nav/turns, no overflow`);await context.close();
}
// Unavailable WebGL falls back to a functional, fitted 2D atlas without a large initial download.
{
 const {context,page,requests}=await start(browser,390,844);await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return type==='webgl'?null:get.call(this,type,...rest)}});await page.reload();await page.getByRole('button',{name:'Fictional game',exact:true}).click();await page.getByLabel('Player country').selectOption('alden');await page.getByRole('button',{name:'Start local scenario'}).click();await page.getByRole('button',{name:'Scenario menu'}).click();await page.getByRole('button',{name:'Return to globe',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.atlas-viewport')?.dataset.projection==='flat-fallback');await page.locator('.atlas-political [data-country]').first().waitFor();await page.waitForTimeout(500);assert.ok(requests.every(r=>!r.includes('50m')&&!r.includes('/countries/')));await page.locator('.atlas-viewport').focus();await page.keyboard.press('+');await settle(page);assert.ok((await pose(page)).zoom>1);await page.keyboard.press('Home');await settle(page);assert.equal((await pose(page)).zoom,1);await page.screenshot({path:'flat-fallback.png',scale:'css'});await overflow(page);await page.getByRole('button',{name:'Resume game',exact:true}).click();await page.getByRole('button',{name:'Next week',exact:true}).click();assert.equal(await page.locator('.game-meta dd').first().textContent(),'Week 2');await context.close();console.log('PASS WebGL unavailable fallback');
}
{
 const {context,page}=await start(browser,390,844);await atlas(page);await page.getByRole('button',{name:'Zoom in atlas',exact:true}).click();await settle(page);const before=await pose(page);await page.locator('.atlas-globe').evaluate(c=>c.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>document.querySelector('.atlas-viewport').dataset.projection==='flat-fallback');const after=await pose(page);assert.ok(distance([before.lon,before.lat],[after.lon,after.lat])<.001);await overflow(page);await context.close();console.log('PASS context loss recovery keeps focus');
}
{
 const {context,page}=await start(browser,390,844,{reducedMotion:'reduce'});await atlas(page);await zoomToFlat(page);assert.equal((await pose(page)).blend,1);await context.close();console.log('PASS reduced-motion transition');
}
{
 const {context,page}=await start(browser,390,844);
 await page.addInitScript(()=>{
  const upload=WebGLRenderingContext.prototype.texImage2D,error=WebGLRenderingContext.prototype.getError;
  let failedContext=null;
  WebGLRenderingContext.prototype.texImage2D=function(...args){const result=upload.apply(this,args);if(args[5] instanceof HTMLCanvasElement)failedContext=this;return result};
  WebGLRenderingContext.prototype.getError=function(){if(failedContext===this){failedContext=null;return this.OUT_OF_MEMORY}return error.call(this)};
 });
 await page.reload();await page.getByRole('button',{name:'Fictional game',exact:true}).click();await page.getByLabel('Player country').selectOption('alden');await page.getByRole('button',{name:'Start local scenario'}).click();await page.getByRole('button',{name:'Scenario menu'}).click();await page.getByRole('button',{name:'Return to globe',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.atlas-viewport')?.dataset.projection==='flat-fallback');await page.locator('.atlas-political [data-country]').first().waitFor();await overflow(page);await context.close();console.log('PASS GPU texture allocation error fallback');
}
assert.deepEqual(issues,[]);console.log('PASS no runtime errors; captures:',OUTPUT);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
