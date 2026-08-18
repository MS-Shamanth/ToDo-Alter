let token = localStorage.getItem('token');
let user = localStorage.getItem('user');
let lists = [], cur = null, items = [], filter = '';

if (token && user) startApp();

async function api(url, method = 'GET', body) {
    const opts = { method, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { logout(); return null; }
    return res.json();
}

async function login() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    if (!u || !p) return;
    const d = await api('/api/login', 'POST', { username: u, password: p });
    if (!d || d.error) { document.getElementById('auth-error').textContent = d ? d.error : 'Failed'; return; }
    token = d.token; user = d.username;
    localStorage.setItem('token', token); localStorage.setItem('user', user);
    startApp();
}

async function signup() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    if (!u || !p) return;
    const d = await api('/api/signup', 'POST', { username: u, password: p });
    if (!d || d.error) { document.getElementById('auth-error').textContent = d ? d.error : 'Failed'; return; }
    token = d.token; user = d.username;
    localStorage.setItem('token', token); localStorage.setItem('user', user);
    startApp();
}

function logout() {
    localStorage.clear(); token = null; user = null; cur = null; items = []; lists = [];
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('app-page').style.display = 'none';
}

async function startApp() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app-page').style.display = 'flex';
    document.getElementById('user-display').textContent = user;
    lists = await api('/api/lists') || [];
    renderLists();
    if (lists.length) openList(lists[0]);
}

function renderLists() {
    document.getElementById('lists').innerHTML = lists.map(l =>
        `<li class="${cur && cur.id === l.id ? 'active' : ''}" onclick="openList2(${l.id})">
            <span>${l.name}</span><span class="cnt">${l.count || 0}</span>
        </li>`
    ).join('');
}

function openList2(id) { openList(lists.find(l => l.id === id)); }

async function openList(l) {
    if (!l) return;
    cur = l; filter = '';
    document.getElementById('empty-msg').style.display = 'none';
    document.getElementById('list-view').style.display = 'block';
    document.getElementById('list-name').textContent = l.name;

    const sb = document.getElementById('share-bar');
    if (l.is_public && l.share_link) {
        const link = location.origin + '/api/public/' + l.share_link;
        sb.style.display = 'block';
        sb.innerHTML = `&#128279; Shared: <a href="${link}" target="_blank">${link}</a> &nbsp;<a href="#" onclick="unshareList(); return false;">unshare</a>`;
    } else {
        sb.style.display = 'none';
    }

    items = await api('/api/lists/' + l.id + '/items') || [];
    renderLists(); renderItems(); renderStats();
}

async function createList() {
    const name = prompt('New list name:');
    if (!name || !name.trim()) return;
    const l = await api('/api/lists', 'POST', { name: name.trim() });
    if (!l) return;
    l.count = 0;
    lists.push(l);
    openList(l);
}

async function renameList() {
    if (!cur) return;
    const name = prompt('Rename list:', cur.name);
    if (!name || !name.trim()) return;
    await api('/api/lists/' + cur.id, 'PUT', { name: name.trim() });
    cur.name = name.trim();
    document.getElementById('list-name').textContent = cur.name;
    const i = lists.findIndex(l => l.id === cur.id);
    if (i >= 0) lists[i].name = cur.name;
    renderLists();
}

async function deleteList() {
    if (!cur || !confirm('Delete "' + cur.name + '"?')) return;
    await api('/api/lists/' + cur.id, 'DELETE');
    lists = lists.filter(l => l.id !== cur.id);
    cur = null; items = [];
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('empty-msg').style.display = 'block';
    document.getElementById('stats').innerHTML = '';
    renderLists();
}

async function shareList() {
    if (!cur) return;
    const d = await api('/api/lists/' + cur.id + '/share', 'POST');
    if (!d) return;
    cur.share_link = d.share_link; cur.is_public = 1;
    const i = lists.findIndex(l => l.id === cur.id);
    if (i >= 0) { lists[i].share_link = d.share_link; lists[i].is_public = 1; }
    openList(cur);
}

async function unshareList() {
    if (!cur) return;
    await api('/api/lists/' + cur.id + '/unshare', 'POST');
    cur.share_link = null; cur.is_public = 0;
    const i = lists.findIndex(l => l.id === cur.id);
    if (i >= 0) { lists[i].share_link = null; lists[i].is_public = 0; }
    openList(cur);
}

function showForm() { document.getElementById('task-form').style.display = 'flex'; }
function hideForm() { document.getElementById('task-form').style.display = 'none'; }

async function addItem() {
    const title = document.getElementById('inp-title').value.trim();
    const tags = document.getElementById('inp-tags').value.trim();
    if (!title) return;
    const item = await api('/api/lists/' + cur.id + '/items', 'POST', { title, tags });
    if (!item) return;
    items.push(item);
    document.getElementById('inp-title').value = '';
    document.getElementById('inp-tags').value = '';
    hideForm();
    cur.count = items.length;
    renderLists(); renderItems(); renderStats();
}

async function toggleItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const val = item.completed ? 0 : 1;
    await api('/api/items/' + id, 'PUT', { completed: val });
    item.completed = val;
    renderItems(); renderStats();
}

async function editItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const title = prompt('Edit task:', item.title);
    if (title === null) return;
    const tags = prompt('Edit tags:', item.tags);
    if (tags === null) return;
    await api('/api/items/' + id, 'PUT', { title, tags });
    item.title = title; item.tags = tags;
    renderItems(); renderStats();
}

async function delItem(id) {
    await api('/api/items/' + id, 'DELETE');
    items = items.filter(i => i.id !== id);
    cur.count = items.length;
    renderLists(); renderItems(); renderStats();
}

function setFilter(tag) {
    filter = (filter === tag) ? '' : tag;
    renderItems();
}

function getTags(item) {
    return item.tags ? item.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
}

function renderItems() {
    const shown = filter ? items.filter(i => getTags(i).includes(filter)) : items;
    const fb = document.getElementById('filter-bar');
    if (filter) {
        fb.style.display = 'block';
        fb.innerHTML = `Showing: #${filter} &nbsp;<a onclick="setFilter('${filter}')">clear</a>`;
    } else {
        fb.style.display = 'none';
    }

    document.getElementById('items').innerHTML = shown.map(item => {
        const tags = getTags(item).map(t => `<span onclick="setFilter('${t}')">#${t}</span>`).join('');
        return `<div class="todo-item ${item.completed ? 'done' : ''}">
            <div class="title-row">
                <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleItem(${item.id})">
                <span class="title-text">${item.title}</span>
                <div class="actions">
                    <span onclick="editItem(${item.id})">edit</span>
                    <span onclick="delItem(${item.id})">del</span>
                </div>
            </div>
            ${tags ? '<div class="tags">' + tags + '</div>' : ''}
        </div>`;
    }).join('');
}

function renderStats() {
    const total = items.length;
    const done = items.filter(i => i.completed).length;
    const pending = total - done;
    const tagCounts = {};
    items.forEach(i => getTags(i).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1));
    const noTag = items.filter(i => getTags(i).length === 0).length;

    let html = `
        <div class="stat-row"><span>Total Tasks</span><span class="v">${total}</span></div>
        <div class="stat-row"><span>Pending</span><span class="v">${pending}</span></div>
        <div class="stat-row"><span>Completed</span><span class="v">${done}</span></div>
        <div class="stat-gap"></div>
    `;
    for (const [tag, count] of Object.entries(tagCounts)) {
        html += `<div class="stat-row tag" onclick="setFilter('${tag}')"><span>#${tag}</span><span class="v">${count}</span></div>`;
    }
    html += `<div class="stat-row tag"><span>No Tag</span><span class="v">${noTag}</span></div>`;
    document.getElementById('stats').innerHTML = html;
}
