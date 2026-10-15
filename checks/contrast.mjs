import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'site');
const themes=JSON.parse(readFileSync(join(root,'includes/lesika/themes.json')));
const css=readFileSync(join(root,'assets/lesika/palettes.css'),'utf8');
function luminance(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c.reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (hi+.05)/(lo+.05);}
const report=[];
for(const [id,t]of Object.entries(themes)){
 const c=t.colors;const ratios={};
 for(const color of ['--ink','--muted','--accent','--sage'])for(const bg of ['--bg','--surface','--wash']){ratios[color+'/'+bg]=ratio(c[color],c[bg]);assert.ok(ratios[color+'/'+bg]>=4.5,id+' '+color+'/'+bg);}
 ratios.button=ratio(c['--on-accent'],c['--accent']);assert.ok(ratios.button>=4.5,id+' button');
 assert.ok(css.includes('[data-theme="'+id+'"]{'+Object.entries(c).map(([k,v])=>k+':'+v+';').join('')),id+' palette mismatch');
 report.push({id,ratios});
}
writeFileSync(new URL('./contrast-results.json',import.meta.url),JSON.stringify(report,null,2));console.log('PASS: 12 palettes match their catalogues; shared text and button colors have >=4.5:1 contrast');
