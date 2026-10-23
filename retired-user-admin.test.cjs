const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
test('legacy user routes cannot bypass department permissions with a shared key',async()=>{
 const middleware=[],registrations=[];let authCalls=0;
 const app={use(fn){if(typeof fn==='function'&&fn.length===3)middleware.push(fn);},post(path){registrations.push(path);},get(){},listen(){}};
 const express=()=>app;express.json=()=>()=>{};
 const query={select(){return this;},eq(){return this;},not(){return Promise.resolve({data:[],error:null});}};
 const db={from:()=>query,auth:{admin:new Proxy({},{get(){return()=>{authCalls++;throw Error('Auth should not be called');};}})}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/index.js','utf8'),{require:name=>name==='express'?express:name==='cors'?()=>()=>{}:name==='body-parser'?{json:()=>()=>{}}:name==='dotenv'?{config(){}}:db,process:{env:{}},console});
 assert.equal(middleware.length,1);
 for(const path of ['/create-user','/list-users','/delete-user','/delete-user/guessed-id','/update-user-role','/update-password','/CREATE-USER/','/List-Users/']){
  let status,body,next=false;const res={status(value){status=value;return this;},json(value){body=value;}};
  await middleware[0]({path,headers:{'x-api-key':'old-browser-shared-key'}},res,()=>next=true);
  assert.equal(status,410,path);assert.equal(body.error,'user_admin_moved');assert.equal(next,false);
 }
 let next=false;middleware[0]({path:'/'},{},()=>next=true);assert.equal(next,true);assert.equal(authCalls,0);
});

