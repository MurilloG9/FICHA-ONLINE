const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function loadLocalEnv() {
    const envFile = path.join(__dirname, '.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
}
loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ADMIN-Suri';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATABASE_FILE = path.join(DATA_DIR, 'ficha-online.sqlite');
const sessions = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
const database = new Database(DATABASE_FILE);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sheets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_sheets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
    );
`);
const userColumns = database.prepare('PRAGMA table_info(users)').all().map(column => column.name);
if (!userColumns.includes('username')) database.exec('ALTER TABLE users ADD COLUMN username TEXT');
if (!userColumns.includes('role')) database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL');

function migrateLegacyJson() {
    const legacyFile = path.join(DATA_DIR, 'database.json');
    if (!fs.existsSync(legacyFile) || database.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) return;
    const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    const insertUser = database.prepare('INSERT OR IGNORE INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)');
    const insertSheet = database.prepare('INSERT OR REPLACE INTO sheets (user_id, content, updated_at) VALUES (?, ?, ?)');
    const migrate = database.transaction(() => {
        for (const user of legacy.users || []) insertUser.run(user.id, user.email, user.passwordSalt, user.passwordHash, user.createdAt);
        for (const sheet of legacy.sheets || []) insertSheet.run(sheet.userId, JSON.stringify(sheet.content), sheet.updatedAt);
    });
    migrate();
}
migrateLegacyJson();
const legacySheets = database.prepare('SELECT user_id AS userId, content, updated_at AS updatedAt FROM sheets').all();
const insertLegacySheet = database.prepare('INSERT OR IGNORE INTO saved_sheets (id, user_id, name, content, updated_at) VALUES (?, ?, ?, ?, ?)');
for (const sheet of legacySheets) insertLegacySheet.run(`legacy-${sheet.userId}`, sheet.userId, 'Ficha salva', sheet.content, sheet.updatedAt);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function ensureAdminUser() {
    if (!ADMIN_PASSWORD) return;
    const passwordData = hashPassword(ADMIN_PASSWORD);
    const existingAdmin = database.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
    if (existingAdmin) {
        database.prepare("UPDATE users SET password_salt = ?, password_hash = ?, role = 'admin' WHERE id = ?")
            .run(passwordData.salt, passwordData.hash, existingAdmin.id);
        return;
    }
    database.prepare(`INSERT INTO users (id, email, username, role, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, 'admin', ?, ?, ?)`)
        .run('admin-suri', 'admin@local.invalid', ADMIN_USERNAME, passwordData.salt, passwordData.hash, new Date().toISOString());
}
ensureAdminUser();

function passwordsMatch(password, user) {
    const candidate = hashPassword(password, user.passwordSalt).hash;
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function sendJson(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

function saveSession(token, userId) {
    sessions.set(token, userId);
    database.prepare('INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, new Date().toISOString());
}

function removeSession(token) {
    sessions.delete(token);
    database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function removeUserSessions(userId) {
    for (const [token, sessionUserId] of sessions) if (sessionUserId === userId) sessions.delete(token);
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function allowApiOrigin(response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

function getRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', chunk => body += chunk);
        request.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(new Error('JSON inválido')); }
        });
        request.on('error', reject);
    });
}

function getUser(request) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    const userId = token && (sessions.get(token) || database.prepare('SELECT user_id AS userId FROM sessions WHERE token = ?').get(token)?.userId);
    if (!userId) return null;
    const user = database.prepare('SELECT id, email, username, role, password_salt AS passwordSalt, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?').get(userId);
    return user || null;
}

async function handleApi(request, response, url) {
    if (request.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        const body = await getRequestBody(request);
        const identifier = String(body.username || body.email || '').trim();
        const password = String(body.password || '');
        const isAdminLogin = url.pathname === '/api/login' && identifier === ADMIN_USERNAME;
        if (isAdminLogin) {
            const admin = ADMIN_PASSWORD && database.prepare('SELECT id, email, username, role, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE username = ? AND role = \'admin\'').get(ADMIN_USERNAME);
            if (!admin || !passwordsMatch(password, admin)) return sendJson(response, 401, { error: 'Usuário ou senha incorretos.' });
            const token = crypto.randomBytes(32).toString('hex');
            saveSession(token, admin.id);
            return sendJson(response, 200, { token, user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role } });
        }
        const email = identifier.toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
            return sendJson(response, 400, { error: 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.' });
        }
        const existingUser = database.prepare('SELECT id, email, username, role, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE email = ?').get(email);
        if (url.pathname === '/api/register' && existingUser) {
            return sendJson(response, 409, { error: 'Este e-mail já está cadastrado.' });
        }
        let user = existingUser;
        if (url.pathname === '/api/login') {
            if (!user || !passwordsMatch(password, user)) return sendJson(response, 401, { error: 'E-mail ou senha incorretos.' });
        } else {
            const passwordData = hashPassword(password);
            user = { id: crypto.randomUUID(), email, username: null, role: 'user', passwordSalt: passwordData.salt, passwordHash: passwordData.hash, createdAt: new Date().toISOString() };
            database.prepare('INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, user.email, user.passwordSalt, user.passwordHash, user.createdAt);
        }
        const token = crypto.randomBytes(32).toString('hex');
        saveSession(token, user.id);
        return sendJson(response, 200, { token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) removeSession(token);
        return sendJson(response, 200, { ok: true });
    }
    const user = getUser(request);
    if (!user) return sendJson(response, 401, { error: 'Faça login para continuar.' });
    if (request.method === 'GET' && url.pathname === '/api/me') {
        return sendJson(response, 200, { user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    }
    if (url.pathname.startsWith('/api/admin/')) {
        if (user.role !== 'admin') return sendJson(response, 403, { error: 'Acesso restrito ao administrador.' });
        if (request.method === 'GET' && url.pathname === '/api/admin/users') {
            const users = database.prepare(`SELECT id, email, username, role, created_at AS createdAt
                FROM users ORDER BY created_at DESC`).all();
            return sendJson(response, 200, { users: users.map(item => ({ ...item, passwordMasked: '********' })) });
        }
        const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/(password))?$/);
        if (!userMatch) return sendJson(response, 404, { error: 'Rota administrativa não encontrada.' });
        const targetId = decodeURIComponent(userMatch[1]);
        const target = database.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(targetId);
        if (!target) return sendJson(response, 404, { error: 'Usuário não encontrado.' });
        if (targetId === user.id) return sendJson(response, 403, { error: 'O login da conta administrativa não pode ser alterado por ela mesma.' });
        if (request.method === 'PATCH' && !userMatch[2]) {
            const body = await getRequestBody(request);
            const email = String(body.email || '').trim().toLowerCase();
            if (!/^\S+@\S+\.\S+$/.test(email)) return sendJson(response, 400, { error: 'Informe um e-mail válido.' });
            const duplicate = database.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, targetId);
            if (duplicate) return sendJson(response, 409, { error: 'Este e-mail já está em uso.' });
            database.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, targetId);
            return sendJson(response, 200, { ok: true });
        }
        if (request.method === 'POST' && userMatch[2] === 'password') {
            const body = await getRequestBody(request);
            const password = String(body.password || '');
            if (password.length < 6) return sendJson(response, 400, { error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
            const passwordData = hashPassword(password);
            database.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(passwordData.salt, passwordData.hash, targetId);
            removeUserSessions(targetId);
            return sendJson(response, 200, { ok: true });
        }
        if (request.method === 'DELETE') {
            if (targetId === user.id || target.role === 'admin') return sendJson(response, 400, { error: 'A conta administrativa não pode ser excluída.' });
            database.prepare('DELETE FROM users WHERE id = ?').run(targetId);
            removeUserSessions(targetId);
            return sendJson(response, 200, { ok: true });
        }
        return sendJson(response, 405, { error: 'Método não permitido.' });
    }
    if (request.method === 'GET' && url.pathname === '/api/sheets') {
        const sheets = database.prepare('SELECT id, name, updated_at AS updatedAt FROM saved_sheets WHERE user_id = ? ORDER BY updated_at DESC').all(user.id);
        return sendJson(response, 200, { sheets: sheets.map(sheet => {
            const content = database.prepare('SELECT content FROM saved_sheets WHERE id = ? AND user_id = ?').get(sheet.id, user.id);
            const data = content ? JSON.parse(content.content) : {};
            return {
                ...sheet,
                characterName: data.fields?.['char-name'] || sheet.name,
                characterClass: data.fields?.['char-class'] || 'Sem classe',
                avatar: data.avatar || ''
            };
        }) });
    }
    if (request.method === 'POST' && url.pathname === '/api/sheets') {
        const body = await getRequestBody(request);
        if (!body.sheet || body.sheet.format !== 'ficha-rpg-data') return sendJson(response, 400, { error: 'Formato de ficha inválido.' });
        const name = String(body.name || '').trim().slice(0, 80);
        if (!name) return sendJson(response, 400, { error: 'Informe um nome para a ficha.' });
        const updatedAt = new Date().toISOString();
        const id = crypto.randomUUID();
        database.prepare('INSERT INTO saved_sheets (id, user_id, name, content, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, user.id, name, JSON.stringify(body.sheet), updatedAt);
        return sendJson(response, 201, { ok: true, id, name, updatedAt });
    }
    const sheetMatch = url.pathname.match(/^\/api\/sheets\/([^/]+)$/);
    if (request.method === 'GET' && sheetMatch) {
        const sheet = database.prepare('SELECT id, name, content, updated_at AS updatedAt FROM saved_sheets WHERE id = ? AND user_id = ?').get(decodeURIComponent(sheetMatch[1]), user.id);
        if (!sheet) return sendJson(response, 404, { error: 'Ficha não encontrada.' });
        return sendJson(response, 200, { sheet: JSON.parse(sheet.content), name: sheet.name, updatedAt: sheet.updatedAt });
    }
    if (request.method === 'PUT' && sheetMatch) {
        const body = await getRequestBody(request);
        if (!body.sheet || body.sheet.format !== 'ficha-rpg-data') return sendJson(response, 400, { error: 'Formato de ficha inválido.' });
        const id = decodeURIComponent(sheetMatch[1]);
        const existing = database.prepare('SELECT id FROM saved_sheets WHERE id = ? AND user_id = ?').get(id, user.id);
        if (!existing) return sendJson(response, 404, { error: 'Ficha não encontrada.' });
        const updatedAt = new Date().toISOString();
        database.prepare('UPDATE saved_sheets SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(body.sheet), updatedAt, id, user.id);
        return sendJson(response, 200, { ok: true, id, updatedAt });
    }
    return sendJson(response, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(request, response, url) {
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.resolve(ROOT, `.${requestedPath}`);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404); return response.end('Não encontrado');
    }
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    try {
        if (url.pathname.startsWith('/api/')) {
            allowApiOrigin(response);
            if (request.method === 'OPTIONS') return response.writeHead(204).end();
            await handleApi(request, response, url);
        }
        else serveStatic(request, response, url);
    } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: 'Erro interno do servidor.' });
    }
});

server.listen(PORT, () => console.log(`Ficha Online disponível em http://localhost:${PORT}`));
