// ============================================================
// MAI GORO e-Digital Solutions — Backend Server
// (SQLite DB + Bcrypt Auth + JWT + Multer File Vault)
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const multer = require('multer');

// Import database helpers
const {
    createUser,
    findUserByEmail,
    findUserByUsername,
    findUserById,
    getAllUsers,
    saveContactMessage,
    getAllContactMessages,
    deleteContactMessage,
    addActivity,
    getAllActivities,
    deleteActivity,
    saveVaultFile,
    getAllVaultFiles,
    getVaultFileById,
    deleteVaultFile
} = require('./db');

// Import Authentication Middleware
const requireAuth = require('./authMiddleware');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters before the API can start.');
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Administrator access required.' });
        next();
    });
}

// Helper function to generate JWT Token
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '7d' } // Token lasts 7 days
    );
}

// ============================================================
// MULTER FILE STORAGE CONFIGURATION (Private Vault)
// ============================================================
const vaultStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, 'uploads', 'vault');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // Safe filename with timestamp prefix to prevent collisions
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E6)}-${safeOriginalName}`;
        cb(null, uniqueName);
    }
});

const uploadVault = multer({
    storage: vaultStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // Up to 50 MB per file
});

// ============================================================
// 1. GENERAL ROUTES
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Mai Goro e-Digital Solutions API',
        database: 'SQLite (maigoro.db)',
        auth: 'JWT + bcrypt active',
        vault: 'Multer disk storage active',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/info', (req, res) => {
    res.json({
        name: 'Mai Goro e-Digital Solutions',
        location: 'Opp. Babba milk, No 1706 Tagarji, by Rimin Kebe Rd, Nassarawa, Kano',
        phones: ['08144372466', '08065493687'],
        email: 'maigoroedigitalsolution@gmail.com'
    });
});

// ============================================================
// 2. AUTHENTICATION ROUTES (Register & Login)
// ============================================================

// POST /api/auth/register — Create a new account
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Username, email, and password are required.'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 6 characters long.'
        });
    }

    const existingEmail = findUserByEmail(email);
    if (existingEmail) {
        return res.status(409).json({
            success: false,
            error: 'An account with that email already exists.'
        });
    }

    const existingUsername = findUserByUsername(username);
    if (existingUsername) {
        return res.status(409).json({
            success: false,
            error: 'That username is already taken.'
        });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUser = createUser({
            username: username.trim(),
            email: email.trim(),
            password_hash,
            role: 'customer'
        });

        const token = generateToken(newUser);

        console.log(`👤 New user registered: ${newUser.username} (${newUser.email})`);

        return res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token,
            user: newUser
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to create account.'
        });
    }
});

// POST /api/auth/login — Sign in with email and password
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required.'
        });
    }

    try {
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const safeUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            created_at: user.created_at
        };
        const token = generateToken(safeUser);

        console.log(`🔓 User logged in: ${safeUser.username}`);

        return res.json({
            success: true,
            message: 'Login successful!',
            token,
            user: safeUser
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            error: 'An error occurred during login.'
        });
    }
});

// GET /api/auth/me — Profile of logged-in user (Protected)
app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = findUserById(req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
    }
    res.json({ success: true, user });
});

// ============================================================
// 3. CONTACT MESSAGES ROUTES
// ============================================================

app.post('/api/contact', (req, res) => {
    const { name, email, subject, phone, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({
            success: false,
            error: 'Name, email, and message are required fields.'
        });
    }

    try {
        const savedMessage = saveContactMessage({
            name: name.trim(),
            email: email.trim(),
            subject: subject ? subject.trim() : null,
            phone: phone ? phone.trim() : null,
            message: message.trim()
        });

        return res.status(201).json({
            success: true,
            message: 'Your message has been safely saved! Mai Goro team will contact you shortly.',
            data: savedMessage
        });
    } catch (err) {
        console.error('Error saving contact message:', err);
        return res.status(500).json({ success: false, error: 'Failed to save message.' });
    }
});

app.get('/api/contact', requireAdmin, (req, res) => {
    try {
        const messages = getAllContactMessages();
        res.json({ success: true, count: messages.length, messages });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch messages.' });
    }
});

app.delete('/api/contact/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID.' });

    const deleted = deleteContactMessage(id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Message not found.' });

    res.json({ success: true, message: `Message #${id} deleted.` });
});

// ============================================================
// 4. PRIVATE VAULT ROUTES (Multer File Uploads & Downloads)
// ============================================================

// POST /api/vault/upload — Upload files to server disk (Protected)
app.post('/api/vault/upload', requireAdmin, uploadVault.array('files', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files selected for upload.' });
    }

    try {
        const savedFiles = req.files.map(file => {
            return saveVaultFile({
                original_name: file.originalname,
                stored_filename: file.filename,
                mime_type: file.mimetype,
                file_size: file.size,
                uploaded_by: req.user.id
            });
        });

        console.log(`📁 Saved ${savedFiles.length} file(s) into vault for user #${req.user.id}`);

        return res.status(201).json({
            success: true,
            message: `Successfully uploaded ${savedFiles.length} file(s)!`,
            files: savedFiles
        });
    } catch (err) {
        console.error('Vault upload database error:', err);
        return res.status(500).json({ success: false, error: 'Failed to save file metadata.' });
    }
});

// GET /api/vault/files — List all uploaded vault files (Protected)
app.get('/api/vault/files', requireAdmin, (req, res) => {
    try {
        const files = getAllVaultFiles();
        return res.json({ success: true, count: files.length, files });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to load vault files.' });
    }
});

// GET /api/vault/download/:id — Download a file from server disk (Protected with Header OR query token)
app.get('/api/vault/download/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid file ID.' });

    // Allow token from query param ?token=... (for direct <a> clicks) or Authorization header
    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
    if (!token) {
        return res.status(401).json({ success: false, error: 'Access denied. Please provide an authentication token.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ success: false, error: 'Administrator access required.' });
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }

    const fileRecord = getVaultFileById(id);
    if (!fileRecord) {
        return res.status(404).json({ success: false, error: 'File record not found.' });
    }

    const filePath = path.join(__dirname, 'uploads', 'vault', fileRecord.stored_filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Physical file missing from server.' });
    }

    // Streams file directly to client with original filename
    res.download(filePath, fileRecord.original_name);
});

// DELETE /api/vault/files/:id — Delete a file from disk and database (Protected)
app.delete('/api/vault/files/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid file ID.' });

    const fileRecord = getVaultFileById(id);
    if (!fileRecord) {
        return res.status(404).json({ success: false, error: 'File not found.' });
    }

    // Delete physical file from disk
    const filePath = path.join(__dirname, 'uploads', 'vault', fileRecord.stored_filename);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Failed to unlink file on disk:', err);
        }
    }

    // Delete record from SQLite
    deleteVaultFile(id);

    return res.json({ success: true, message: `File "${fileRecord.original_name}" deleted successfully.` });
});

// ============================================================
// 5. ACTIVITIES (DAILY LOG) ROUTES
// ============================================================

app.get('/api/activities', requireAdmin, (req, res) => {
    try {
        const activities = getAllActivities();
        res.json({ success: true, count: activities.length, activities });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch activities.' });
    }
});

app.post('/api/activities', requireAdmin, (req, res) => {
    const { title, notes, entry_date } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required.' });

    try {
        const activity = addActivity({ title, notes, entry_date });
        res.status(201).json({ success: true, activity });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to save activity.' });
    }
});

app.delete('/api/activities/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID.' });

    const deleted = deleteActivity(id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Activity not found.' });

    res.json({ success: true, message: `Activity #${id} deleted.` });
});

// ============================================================
// 5. NAIJAVERIFY IDENTITY & VIRTUAL ACCOUNTS GATEWAY
// ============================================================
const https = require('https');
const VERIFY_API_KEY = process.env.VERIFY_API_KEY;
const VERIFY_API_BASE = process.env.VERIFY_API_BASE || 'https://naijaverify.com';

// GET /api/verify/gateway-status — Check API Key & Gateway Connectivity
app.get('/api/verify/gateway-status', (req, res) => {
    res.json({
        success: Boolean(VERIFY_API_KEY),
        gateway: 'Configured verification provider',
        configured: Boolean(VERIFY_API_KEY),
        capabilities: VERIFY_API_KEY ? ['nin_verification'] : []
    });
});

// Keep the former path explicit while no real, eligible payment provider is configured.
app.post('/api/user/generate-virtual-account', requireAuth, (req, res) => {
    return res.status(503).json({
        success: false,
        error: 'Virtual account funding is not configured yet. No account has been created.'
    });
});

// POST /api/verify/nin — Instant NIN Verification via API Key
app.post('/api/verify/nin', requireAuth, async (req, res) => {
    const { nin, slip_type, user_name } = req.body;

    if (!nin || !/^\d{11}$/.test(nin.trim())) {
        return res.status(400).json({
            success: false,
            error: 'A valid 11-digit National Identity Number (NIN) is required.'
        });
    }

    const cleanNin = nin.trim();
    const type = slip_type || 'standard';

    if (!VERIFY_API_KEY) {
        return res.status(503).json({ success: false, error: 'NIN verification is temporarily unavailable.' });
    }

    console.log(`🔍 Processing NIN Verification for: ${cleanNin.slice(0, 3)}•••••${cleanNin.slice(-3)} via Naijaverify API`);

    // Call upstream API or construct verified response
    try {
        const payload = JSON.stringify({
            api_key: VERIFY_API_KEY,
            nin: cleanNin,
            type: type
        });

        const upstreamReq = https.request({
            hostname: new URL(VERIFY_API_BASE).hostname,
            path: new URL(VERIFY_API_BASE).pathname.replace(/\/$/, '') + '/api',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Authorization': `Bearer ${VERIFY_API_KEY}`,
                'x-api-key': VERIFY_API_KEY
            },
            timeout: 8000
        }, (upstreamRes) => {
            let body = '';
            upstreamRes.on('data', chunk => body += chunk);
            upstreamRes.on('end', () => {
                if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
                    return res.status(502).json({ success: false, error: 'Verification provider could not complete the request.' });
                }
                try {
                    const parsed = JSON.parse(body);
                    if (parsed && (parsed.status === 'success' || parsed.success === true) && parsed.data) {
                        return res.json({
                            success: true,
                            source: 'api_live',
                            data: parsed.data || parsed
                        });
                    }
                } catch(e) {}

                return res.status(502).json({ success: false, error: 'The provider returned an unreadable response. No verification was completed.' });
            });
        });

        upstreamReq.on('error', (err) => {
            console.warn('Verification provider request failed:', err.message);
            return res.status(502).json({ success: false, error: 'The verification provider is unavailable. No verification was completed.' });
        });
        upstreamReq.setTimeout(8000, () => upstreamReq.destroy(new Error('Provider timeout')));

        upstreamReq.write(payload);
        upstreamReq.end();

    } catch (err) {
        console.error('NIN Verification error:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to complete NIN lookup. Please try again or use desk processing.'
        });
    }
});

// ============================================================
// 6. SERVE FRONTEND STATIC FILES (All-in-One Deployment)
// ============================================================
const frontendPath = path.join(__dirname, '..');

// Serve all static assets (CSS, JS, images, videos)
app.use(express.static(frontendPath));

// Serve Admin Panel at /admin
app.use('/admin', express.static(path.join(frontendPath, 'mai-goro-admin-panel', 'admin')));

// Clean URL routing & Fallback: handles /about, /services, /contact, etc.
app.use((req, res, next) => {
    // Only handle GET requests
    if (req.method !== 'GET') {
        return next();
    }

    // Never intercept API routes
    if (req.path.startsWith('/api/')) {
        return next();
    }
    
    // Clean route check (e.g. /about -> about.html)
    const cleanName = req.path.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanName) {
        const potentialFile = path.join(frontendPath, `${cleanName}.html`);
        if (fs.existsSync(potentialFile)) {
            return res.sendFile(potentialFile);
        }
    }
    
    // Fallback to homepage
    return res.sendFile(path.join(frontendPath, 'index.html'));
});

// ============================================================
// AUTOMATIC ADMIN SEEDING (FOR EASY FIRST-TIME SETUP)
// ============================================================
async function ensureDefaultAdmin() {
    if (getAllUsers().some(user => user.role === 'admin')) return;
    const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
        console.warn('No administrator exists. Set ADMIN_EMAIL, ADMIN_USERNAME, and a 16+ character ADMIN_PASSWORD to provision one securely.');
        return;
    }
    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    createUser({ username: ADMIN_USERNAME, email: ADMIN_EMAIL, password_hash, role: 'admin' });
    console.log('Administrator account provisioned from environment configuration.');
}

// ============================================================
// START THE SERVER
// ============================================================
app.listen(PORT, async () => {
    await ensureDefaultAdmin();
    console.log(`===============================================`);
    console.log(`🚀 Mai Goro Server running at http://localhost:${PORT}`);
    console.log(`📁 Private Vault Endpoints:`);
    console.log(`   POST http://localhost:${PORT}/api/vault/upload`);
    console.log(`   GET  http://localhost:${PORT}/api/vault/files`);
    console.log(`   GET  http://localhost:${PORT}/api/vault/download/:id`);
    console.log(`===============================================`);
});
