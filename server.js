const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const SECRET = 'todo_secret_key_2024';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// signup
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Username taken' });
        const token = jwt.sign({ id: this.lastID, username }, SECRET);
        res.json({ token, username });
    });
});

// login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password))
            return res.status(400).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
        res.json({ token, username: user.username });
    });
});

// get all lists
app.get('/api/lists', auth, (req, res) => {
    db.all('SELECT l.*, (SELECT COUNT(*) FROM todo_items WHERE list_id = l.id) AS count FROM todo_lists l WHERE l.user_id = ?', [req.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

// create list
app.post('/api/lists', auth, (req, res) => {
    const { name } = req.body;
    db.run('INSERT INTO todo_lists (user_id, name) VALUES (?, ?)', [req.user.id, name], function(err) {
        if (err) return res.status(500).json({ error: 'Failed' });
        res.json({ id: this.lastID, name, user_id: req.user.id, share_link: null, is_public: 0 });
    });
});

// rename list
app.put('/api/lists/:id', auth, (req, res) => {
    const { name } = req.body;
    db.run('UPDATE todo_lists SET name = ? WHERE id = ? AND user_id = ?', [name, req.params.id, req.user.id], function(err) {
        res.json({ success: true });
    });
});

// delete list
app.delete('/api/lists/:id', auth, (req, res) => {
    db.run('DELETE FROM todo_items WHERE list_id = ?', [req.params.id]);
    db.run('DELETE FROM todo_lists WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
        res.json({ success: true });
    });
});

// share list
app.post('/api/lists/:id/share', auth, (req, res) => {
    const link = crypto.randomBytes(8).toString('hex');
    db.run('UPDATE todo_lists SET share_link = ?, is_public = 1 WHERE id = ? AND user_id = ?', [link, req.params.id, req.user.id], function(err) {
        res.json({ share_link: link });
    });
});

// unshare list
app.post('/api/lists/:id/unshare', auth, (req, res) => {
    db.run('UPDATE todo_lists SET share_link = NULL, is_public = 0 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
        res.json({ success: true });
    });
});

// public view
app.get('/api/public/:link', (req, res) => {
    db.get('SELECT * FROM todo_lists WHERE share_link = ?', [req.params.link], (err, list) => {
        if (!list) return res.status(404).send('<p style="font-family:sans-serif">List not found</p>');
        db.all('SELECT * FROM todo_items WHERE list_id = ?', [list.id], (err, items) => {
            const rows = (items || []).map(i => {
                const tags = (i.tags || '').split(',').filter(t => t.trim())
                    .map(t => `<span style="background:#efefef;color:#666;padding:3px 9px;border-radius:3px;font-size:10.5px;margin-right:8px">#${t.trim()}</span>`).join('');
                return `<div style="margin-bottom:40px"><div style="font-size:14.5px;${i.completed ? 'text-decoration:line-through;color:#bbb' : 'color:#333'}">${i.title}</div><div style="margin-top:9px">${tags}</div></div>`;
            }).join('');
            res.send(`<html><body style="font-family:'Segoe UI',Arial,sans-serif;background:#fafafa;padding:40px 60px;color:#333">
                <div style="font-size:9.5px;color:#999;letter-spacing:1.1px;font-weight:600;margin-bottom:12px">PUBLICLY SHARED LIST &mdash; READ ONLY</div>
                <h1 style="font-size:21px;margin-bottom:38px">${list.name}</h1>${rows || '<p style="color:#bbb">No tasks</p>'}</body></html>`);
        });
    });
});

// get items for a list
app.get('/api/lists/:id/items', auth, (req, res) => {
    db.all('SELECT * FROM todo_items WHERE list_id = ? AND list_id IN (SELECT id FROM todo_lists WHERE user_id = ?)', [req.params.id, req.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

// add item
app.post('/api/lists/:id/items', auth, (req, res) => {
    const { title, tags } = req.body;
    db.run('INSERT INTO todo_items (list_id, title, tags) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM todo_lists WHERE id = ? AND user_id = ?)',
        [req.params.id, title, tags || '', req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed' });
        res.json({ id: this.lastID, list_id: parseInt(req.params.id), title, completed: 0, tags: tags || '' });
    });
});

// update item
app.put('/api/items/:id', auth, (req, res) => {
    const { title, completed, tags } = req.body;
    db.run('UPDATE todo_items SET title = COALESCE(?, title), completed = COALESCE(?, completed), tags = COALESCE(?, tags) WHERE id = ? AND list_id IN (SELECT id FROM todo_lists WHERE user_id = ?)',
        [title, completed, tags, req.params.id, req.user.id], function(err) {
        res.json({ success: true });
    });
});

// delete item
app.delete('/api/items/:id', auth, (req, res) => {
    db.run('DELETE FROM todo_items WHERE id = ? AND list_id IN (SELECT id FROM todo_lists WHERE user_id = ?)', [req.params.id, req.user.id], function(err) {
        res.json({ success: true });
    });
});

// stats for a list
app.get('/api/lists/:id/stats', auth, (req, res) => {
    db.get('SELECT COUNT(*) as total, SUM(completed) as completed FROM todo_items WHERE list_id = ? AND list_id IN (SELECT id FROM todo_lists WHERE user_id = ?)', [req.params.id, req.user.id], (err, row) => {
        db.all('SELECT tags FROM todo_items WHERE list_id = ? AND tags != ""', [req.params.id], (err, items) => {
            const tagCount = {};
            (items || []).forEach(item => {
                item.tags.split(',').forEach(t => {
                    t = t.trim();
                    if (t) tagCount[t] = (tagCount[t] || 0) + 1;
                });
            });
            res.json({
                total: row.total || 0,
                completed: row.completed || 0,
                pending: (row.total || 0) - (row.completed || 0),
                tags: tagCount
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
