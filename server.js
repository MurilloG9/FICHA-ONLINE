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
    const userId = token && sessions.get(token);
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
            sessions.set(token, admin.id);
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
        sessions.set(token, user.id);
        return sendJson(response, 200, { token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    }
    if (request.method === 'POST' && url.pathname === '/api/logout') {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) sessions.delete(token);
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
            for (const [token, sessionUserId] of sessions) if (sessionUserId === targetId) sessions.delete(token);
            return sendJson(response, 200, { ok: true });
        }
        if (request.method === 'DELETE') {
            if (targetId === user.id || target.role === 'admin') return sendJson(response, 400, { error: 'A conta administrativa não pode ser excluída.' });
            database.prepare('DELETE FROM users WHERE id = ?').run(targetId);
            for (const [token, sessionUserId] of sessions) if (sessionUserId === targetId) sessions.delete(token);
            return sendJson(response, 200, { ok: true });
        }
        return sendJson(response, 405, { error: 'Método não permitido.' });
    }
    if (request.method === 'GET' && url.pathname === '/api/sheets/current') {
        const sheet = database.prepare('SELECT content, updated_at AS updatedAt FROM sheets WHERE user_id = ?').get(user.id);
        return sendJson(response, 200, { sheet: sheet ? JSON.parse(sheet.content) : null, updatedAt: sheet?.updatedAt || null });
    }
    if (request.method === 'PUT' && url.pathname === '/api/sheets/current') {
        const body = await getRequestBody(request);
        if (!body.sheet || body.sheet.format !== 'ficha-rpg-data') return sendJson(response, 400, { error: 'Formato de ficha inválido.' });
        const updatedAt = new Date().toISOString();
        database.prepare(`INSERT INTO sheets (user_id, content, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`).run(user.id, JSON.stringify(body.sheet), updatedAt);
        return sendJson(response, 200, { ok: true });
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
        if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
        else serveStatic(request, response, url);
    } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: 'Erro interno do servidor.' });
    }
});

server.listen(PORT, () => console.log(`Ficha Online disponível em http://localhost:${PORT}`));
