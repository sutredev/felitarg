/*
FELIT v2.2 - Global Chat (Render-ready, fully fixed)
Features:
- Global chatroom (everyone sees all messages)
- Manual user creation (CLI: adduser)
- Persistent storage via SQLite (felit.db)
- Clean dark gray theme, admin highlighted in gold
- Admin panel at /admin (JSON view)
- Ready for Render: npm install as build, start with `node felit_server.js`
*/

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'felit.db');
const PORT = process.env.PORT || 3000;

function openDb() { return new sqlite3.Database(DB_FILE); }
function run(db, sql, params=[]) { 
  return new Promise((res, rej) => { 
    db.run(sql, params, function(err) { if(err) rej(err); else res(this); }); 
  }); 
}
function get(db, sql, params=[]) { 
  return new Promise((res, rej) => { 
    db.get(sql, params, (err,row)=> { if(err) rej(err); else res(row); }); 
  }); 
}
function all(db, sql, params=[]) { 
  return new Promise((res, rej) => { 
    db.all(sql, params, (err,rows)=> { if(err) rej(err); else res(rows); }); 
  }); 
}

async function initDb(){
  if(fs.existsSync(DB_FILE)){ console.log('Database already exists at', DB_FILE); return; }
  const db = openDb();
  await run(db, `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    is_admin INTEGER DEFAULT 0
  );`);
  await run(db, `CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    text TEXT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );`);
  console.log('Database initialized.');
  db.close();
}

async function addUserCLI(username, password, isAdmin){
  if(!username || !password) { 
    console.log('Usage: node felit_server.js adduser <username> <password> [admin]'); 
    process.exit(1); 
  }
  const db = openDb();
  const hash = await bcrypt.hash(password, 10);
  try {
    await run(db, 'INSERT INTO users(username, password_hash, is_admin) VALUES(?,?,?)', [username, hash, isAdmin?1:0]);
    console.log('Added user', username, 'admin=', !!isAdmin);
  } catch(e){ console.error('Error adding user:', e.message); }
  db.close();
}

// CLI commands
if(require.main === module){
  const args = process.argv.slice(2);
  if(args[0] === 'init-db'){ initDb(); return; }
  if(args[0] === 'adduser'){ addUserCLI(args[1], args[2], args[3] === 'admin'); return; }
}

const app = express();
app.use(helmet());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'felit_default_secret_change_this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(express.static('public'));

function requireLogin(req,res,next){
  if(!req.session.user) return res.redirect('/login.html');
  next();
}

app.get('/', requireLogin, (req,res)=>{
  res.sendFile(path.join(__dirname,'public','chat.html'));
});

app.post('/login', async (req,res)=>{
  const { username, password } = req.body;
  const db = openDb();
  try {
    const user = await get(db, 'SELECT * FROM users WHERE username=?', [username]);
    if(!user){ db.close(); return res.status(401).send('Invalid username/password'); }
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok){ db.close(); return res.status(401).send('Invalid username/password'); }
    req.session.user = { id: user.id, username: user.username, is_admin: !!user.is_admin };
    db.close();
    res.redirect('/');
  } catch(e){
    db.close();
    res.status(500).send('Server error');
  }
});

app.post('/logout', (req,res)=>{
  req.session.destroy(()=> res.redirect('/login.html'));
});

// Send message
app.post('/send', requireLogin, async (req, res) => {
  const { text } = req.body;
  if(!text || !req.session.user) return res.status(400).send("Bad Request");

  const db = openDb();
  try {
    await run(db, 'INSERT INTO messages(sender_id, text) VALUES(?, ?)', [req.session.user.id, text]);
    db.close();
    res.sendStatus(200);
  } catch(err) {
    console.error("DB insert error:", err);
    db.close();
    res.status(500).send("Database error");
  }
});

// Get messages
app.get('/messages', requireLogin, async (req, res) => {
  const db = openDb();
  try {
    const rows = await all(db, `
      SELECT m.id, m.text, m.ts, u.username, u.is_admin
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      ORDER BY m.ts ASC
    `);
    db.close();
    res.json(rows);
  } catch(err) {
    console.error("DB fetch error:", err);
    db.close();
    res.status(500).json([]);
  }
});

// Admin JSON logs
app.get('/admin', requireLogin, async (req,res)=>{
  if(!req.session.user.is_admin) return res.status(403).send('Forbidden');
  const db = openDb();
  try {
    const users = await all(db, 'SELECT id, username, is_admin FROM users ORDER BY username ASC');
    const messages = await all(db, `
      SELECT m.id, m.text, m.ts, u.username as sender, u.is_admin
      FROM messages m
      JOIN users u ON m.sender_id=u.id
      ORDER BY m.ts DESC
    `);
    db.close();
    res.json({ users, messages });
  } catch(e){ db.close(); res.status(500).send('Server error'); }
});

// Health check
app.get('/.well-known/health', (req,res) => res.json({ status: 'ok' }));

// Start server
if(require.main === module || process.env.START_SERVER === '1'){
  app.listen(PORT, ()=> console.log('Felit v2.2 running on port', PORT));
}

module.exports = app;
