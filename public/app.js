let token=localStorage.getItem('token'), user=localStorage.getItem('user');
let lists=[], cur=null, items=[], filter='';

if(token) start();

async function api(u,m='GET',b){
  const o={method:m,headers:{}};
  if(token) o.headers.Authorization='Bearer '+token;
  if(b){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
  return (await fetch(u,o)).json();
}

async function auth(path){
  const u=document.getElementById('username').value, p=document.getElementById('password').value;
  if(!u||!p) return;
  const d=await api('/api/'+path,'POST',{username:u,password:p});
  if(d.error) return document.getElementById('auth-error').textContent=d.error;
  token=d.token; user=d.username;
  localStorage.setItem('token',token); localStorage.setItem('user',user);
  start();
}
const login=()=>auth('login'), signup=()=>auth('signup');

function logout(){
  localStorage.clear(); token=null;
  document.getElementById('auth-page').style.display='flex';
  document.getElementById('app-page').style.display='none';
}

async function start(){
  document.getElementById('auth-page').style.display='none';
  document.getElementById('app-page').style.display='flex';
  document.getElementById('user-display').textContent=user;
  lists=await api('/api/lists');
  drawLists();
  if(lists.length) openList(lists[0]);
}

function drawLists(){
  document.getElementById('lists').innerHTML=lists.map(l=>
    `<li class="${cur&&cur.id===l.id?'on':''}" onclick="open2(${l.id})">
      <span>${l.name}${l.is_public?' &#128279;':''}</span><span class="n">${l.count||0}</span></li>`
  ).join('');
}
const open2=id=>openList(lists.find(l=>l.id===id));

async function createList(){
  const n=prompt('List name:'); if(!n) return;
  lists.push(await api('/api/lists','POST',{name:n}));
  openList(lists[lists.length-1]);
}

async function openList(l){
  cur=l; filter='';
  document.getElementById('empty').style.display='none';
  document.getElementById('list-view').style.display='block';
  document.getElementById('list-name').textContent=l.name;
  const sb=document.getElementById('share-box');
  if(l.share_link){
    sb.style.display='block';
    const link=location.origin+'/api/public/'+l.share_link;
    sb.innerHTML=`Public: <a href="${link}" target="_blank">${link}</a> &nbsp;<a href="#" onclick="unshare()">unshare</a>`;
  } else sb.style.display='none';
  items=await api('/api/lists/'+l.id+'/items');
  drawLists(); draw();
}

async function renameList(){
  const n=prompt('Rename list:',cur.name); if(!n) return;
  await api('/api/lists/'+cur.id,'PUT',{name:n});
  cur.name=n; document.getElementById('list-name').textContent=n; drawLists();
}

async function deleteList(){
  if(!confirm('Delete list?')) return;
  await api('/api/lists/'+cur.id,'DELETE');
  lists=lists.filter(l=>l.id!==cur.id); cur=null; items=[];
  document.getElementById('list-view').style.display='none';
  document.getElementById('empty').style.display='block';
  document.getElementById('stats-box').innerHTML='';
  drawLists();
}

async function shareList(){
  const d=await api('/api/lists/'+cur.id+'/share','POST');
  cur.share_link=d.share_link; cur.is_public=1; openList(cur);
}
async function unshare(){
  await api('/api/lists/'+cur.id+'/unshare','POST');
  cur.share_link=null; cur.is_public=0; openList(cur);
}

const showForm=()=>document.getElementById('form').style.display='flex';
const hideForm=()=>document.getElementById('form').style.display='none';

async function addItem(){
  const t=document.getElementById('t-title').value.trim();
  const g=document.getElementById('t-tags').value.trim();
  if(!t) return;
  items.push(await api('/api/lists/'+cur.id+'/items','POST',{title:t,tags:g}));
  document.getElementById('t-title').value=''; document.getElementById('t-tags').value='';
  hideForm(); cur.count=items.length; drawLists(); draw();
}

async function toggle(id){
  const i=items.find(x=>x.id===id);
  i.completed=i.completed?0:1;
  await api('/api/items/'+id,'PUT',{completed:i.completed}); draw();
}

async function editItem(id){
  const i=items.find(x=>x.id===id);
  const t=prompt('Task name:',i.title); if(t===null) return;
  const g=prompt('Tags:',i.tags); if(g===null) return;
  await api('/api/items/'+id,'PUT',{title:t,tags:g});
  i.title=t; i.tags=g; draw();
}

async function delItem(id){
  await api('/api/items/'+id,'DELETE');
  items=items.filter(x=>x.id!==id); cur.count=items.length; drawLists(); draw();
}

function setFilter(t){ filter=filter===t?'':t; draw(); }

function draw(){
  const shown=filter?items.filter(i=>tagsOf(i).includes(filter)):items;
  document.getElementById('items').innerHTML=shown.map(i=>`
    <div class="todo ${i.completed?'done':''}">
      <span class="t" onclick="toggle(${i.id})">${i.title}</span>
      <span class="acts"><span onclick="editItem(${i.id})">edit</span><span onclick="delItem(${i.id})">delete</span></span>
      <div class="tags">${tagsOf(i).map(t=>`<span onclick="setFilter('${t}')">#${t}</span>`).join('')}</div>
    </div>`).join('');
  const fn=document.getElementById('filter-note');
  if(filter){ fn.style.display='block'; fn.innerHTML=`filtered by #${filter} &nbsp;<a onclick="setFilter('${filter}')">clear</a>`; }
  else fn.style.display='none';
  stats();
}

const tagsOf=i=>i.tags?i.tags.split(',').map(t=>t.trim()).filter(Boolean):[];

function stats(){
  const done=items.filter(i=>i.completed).length, tc={};
  items.forEach(i=>tagsOf(i).forEach(t=>tc[t]=(tc[t]||0)+1));
  document.getElementById('stats-box').innerHTML=
    `<div class="row"><span>Total Tasks</span><span class="v">${items.length}</span></div>
     <div class="row"><span>Pending</span><span class="v">${items.length-done}</span></div>
     <div class="row"><span>Completed</span><span class="v">${done}</span></div>
     <div class="gap"></div>`
    + Object.entries(tc).map(([t,c])=>`<div class="row tag" onclick="setFilter('${t}')"><span>#${t}</span><span class="v">${c}</span></div>`).join('')
    + `<div class="row tag"><span>No Tag</span><span class="v">${items.filter(i=>!tagsOf(i).length).length}</span></div>`;
}
