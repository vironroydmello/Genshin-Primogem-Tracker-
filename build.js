#!/usr/bin/env node
// Stamps one version + content hash into index.html (meta tags) and sw.js (BUILD).
// Usage: node build.js        (run after every change, before uploading)
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const dir=__dirname,rd=f=>{try{return fs.readFileSync(path.join(dir,f),'utf8')}catch(e){return ''}};
const version=JSON.parse(rd('version.json')).version;
// Only app code goes into the hash. Data files (roster.json, rules.json) are deliberately NOT listed, so a data-only change never creates a new build or an "Update available" toast.
const FILES=['index.html'];
const neutral=t=>t.replace(/(<meta name="app-build" content=")[^"]*/,'$1X').replace(/(<meta name="app-built" content=")[^"]*/,'$1X').replace(/(<meta name="app-version" content=")[^"]*/,'$1X');
const h=crypto.createHash('sha256');FILES.forEach(f=>h.update(f+'\0'+neutral(rd(f))));
const hash=h.digest('hex').slice(0,8),build=version+'+'+hash;
let idx=rd('index.html'),sw=rd('sw.js');
const cur=(idx.match(/<meta name="app-build" content="([^"]*)"/)||[])[1];
if(cur===hash&&sw.includes("const BUILD='"+build+"'")){console.log('Already stamped:',build);process.exit(0)}
const date=new Date().toISOString().slice(0,10);
idx=idx.replace(/(<meta name="app-version" content=")[^"]*/,'$1'+version).replace(/(<meta name="app-build" content=")[^"]*/,'$1'+hash).replace(/(<meta name="app-built" content=")[^"]*/,'$1'+date);
sw=sw.replace(/const BUILD='[^']*'/,"const BUILD='"+build+"'");
fs.writeFileSync(path.join(dir,'index.html'),idx);fs.writeFileSync(path.join(dir,'sw.js'),sw);
console.log('Stamped',build,date);
