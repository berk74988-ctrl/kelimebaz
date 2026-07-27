import { readFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile(new URL('./src/app/data/words.json', import.meta.url)));
const POOL = raw.words.map(w=>w.toLocaleUpperCase('tr')).filter(w=>[...w].length===5);
function pat(g,a){g=[...g];a=[...a];const r=Array(g.length).fill('0');const p=new Map();for(let i=0;i<g.length;i++){if(g[i]===a[i])r[i]='2';else p.set(a[i],(p.get(a[i])||0)+1);}for(let i=0;i<g.length;i++){if(r[i]==='2')continue;const l=p.get(g[i])||0;if(l>0){r[i]='1';p.set(g[i],l-1);}}return r.join('');}
function ent(g,c){const n=c.length;if(n<=1)return 0;const b=new Map();for(const x of c){const k=pat(g,x);b.set(k,(b.get(k)||0)+1);}let h=0;for(const v of b.values()){const p=v/n;h-=p*Math.log2(p);}return h;}
let seed=123;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
function pick(c,topK){const s=c.map(g=>({g,h:ent(g,c)}));s.sort((a,b)=>b.h-a.h);const k=Math.min(topK,s.length);return s[Math.floor(rnd()*k)].g;}
function solve(ans,topK){let c=[...POOL],att=0;while(att<6){let g;if(c.length<=2)g=c[0];else g=pick(c,topK);const fb=pat(g,ans);att++;if(g===ans)return att;c=c.filter(x=>pat(g,x)===fb);if(!c.length)c=[...POOL];}return 7;}
console.log('NO fixed opener, topK applies to ALL turns:');
for(const topK of [1,3,6,10,20,40,80,150,230]){let tot=0,solved=0,fail=0;const N=500;for(let i=0;i<N;i++){const ans=POOL[Math.floor(rnd()*POOL.length)];const a=solve(ans,topK);if(a<=6){solved++;tot+=a;}else fail++;}console.log('topK='+String(topK).padStart(3)+'  avg='+(tot/solved).toFixed(2)+'  win%='+Math.round(solved/N*100)+'  fail='+fail);}
