// ============================================================
// MAI GORO e-Digital Solutions — Database Module (SQLite)
// ============================================================
// We use Node.js's official built-in SQLite engine (node:sqlite).
// Data is stored safely on disk in 'maigoro.db' — so it never gets lost!

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Path to SQLite database file
const dbPath = path.join(__dirname, 'maigoro.db');
const db = new DatabaseSync(dbPath);

console.log(`💾 SQLite Database connected: ${dbPath}`);

// ============================================================
// 1. INITIALIZE DATABASE TABLES
// ============================================================

db.exec(`
  -- Table: Users & Admins (Authentication)
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table: Contact Form Messages
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'unread',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table: Daily Activities (for Admin Dashboard)
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date DATE DEFAULT (DATE('now')),
    title TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table: Homepage Slider / Opportunities
  CREATE TABLE IF NOT EXISTS slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table: Private Vault Files
  CREATE TABLE IF NOT EXISTS vault_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    uploaded_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ============================================================
// 2. USERS (AUTHENTICATION) HELPER FUNCTIONS
// ============================================================

/**
 * Creates a new user with a hashed password.
 */
function createUser({ username, email, password_hash, role = 'customer' }) {
  const statement = db.prepare(`
    INSERT INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);
  const result = statement.run(username.toLowerCase(), email.toLowerCase(), password_hash, role);
  return findUserById(result.lastInsertRowid);
}

/**
 * Finds a user by email (used during login).
 */
function findUserByEmail(email) {
  const statement = db.prepare(`
    SELECT * FROM users 
    WHERE email = ?
  `);
  return statement.get(email.toLowerCase());
}

/**
 * Finds a user by username.
 */
function findUserByUsername(username) {
  const statement = db.prepare(`
    SELECT * FROM users 
    WHERE username = ?
  `);
  return statement.get(username.toLowerCase());
}

/**
 * Finds a user by ID (excludes password_hash for safety).
 */
function findUserById(id) {
  const statement = db.prepare(`
    SELECT id, username, email, role, created_at FROM users 
    WHERE id = ?
  `);
  return statement.get(id);
}

/**
 * Retrieves all registered users (without passwords).
 */
function getAllUsers() {
  const statement = db.prepare(`
    SELECT id, username, email, role, created_at FROM users 
    ORDER BY created_at DESC
  `);
  return statement.all();
}

// ============================================================
// 3. CONTACT MESSAGES HELPER FUNCTIONS
// ============================================================

function saveContactMessage({ name, email, subject, phone, message }) {
  const statement = db.prepare(`
    INSERT INTO contact_messages (name, email, subject, phone, message)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    name,
    email,
    subject || 'No subject',
    phone || 'Not provided',
    message
  );

  return getContactMessageById(result.lastInsertRowid);
}

function getAllContactMessages() {
  const statement = db.prepare(`
    SELECT * FROM contact_messages 
    ORDER BY created_at DESC
  `);
  return statement.all();
}

function getContactMessageById(id) {
  const statement = db.prepare(`
    SELECT * FROM contact_messages 
    WHERE id = ?
  `);
  return statement.get(id);
}

function deleteContactMessage(id) {
  const statement = db.prepare(`
    DELETE FROM contact_messages 
    WHERE id = ?
  `);
  const result = statement.run(id);
  return result.changes > 0;
}

// ============================================================
// 4. ACTIVITIES (ADMIN LOG) HELPER FUNCTIONS
// ============================================================

function addActivity({ title, notes, entry_date }) {
  const statement = db.prepare(`
    INSERT INTO activities (title, notes, entry_date)
    VALUES (?, ?, COALESCE(?, DATE('now')))
  `);
  const result = statement.run(title, notes || '', entry_date || null);
  return getActivityById(result.lastInsertRowid);
}

function getAllActivities() {
  const statement = db.prepare(`
    SELECT * FROM activities 
    ORDER BY entry_date DESC, created_at DESC
  `);
  return statement.all();
}

function getActivityById(id) {
  const statement = db.prepare(`
    SELECT * FROM activities 
    WHERE id = ?
  `);
  return statement.get(id);
}

function deleteActivity(id) {
  const statement = db.prepare(`
    DELETE FROM activities 
    WHERE id = ?
  `);
  const result = statement.run(id);
  return result.changes > 0;
}

// ============================================================
// 5. PRIVATE VAULT FILES HELPER FUNCTIONS
// ============================================================

function saveVaultFile({ original_name, stored_filename, mime_type, file_size, uploaded_by }) {
  const statement = db.prepare(`
    INSERT INTO vault_files (original_name, stored_filename, mime_type, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = statement.run(original_name, stored_filename, mime_type, file_size, uploaded_by || null);
  return getVaultFileById(result.lastInsertRowid);
}

function getAllVaultFiles() {
  const statement = db.prepare(`
    SELECT v.*, u.username as uploader_name 
    FROM vault_files v
    LEFT JOIN users u ON v.uploaded_by = u.id
    ORDER BY v.created_at DESC
  `);
  return statement.all();
}

function getVaultFileById(id) {
  const statement = db.prepare(`
    SELECT * FROM vault_files 
    WHERE id = ?
  `);
  return statement.get(id);
}

function deleteVaultFile(id) {
  const statement = db.prepare(`
    DELETE FROM vault_files 
    WHERE id = ?
  `);
  const result = statement.run(id);
  return result.changes > 0;
}

// Export database operations
module.exports = {
  db,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  getAllUsers,
  saveContactMessage,
  getAllContactMessages,
  getContactMessageById,
  deleteContactMessage,
  addActivity,
  getAllActivities,
  getActivityById,
  deleteActivity,
  saveVaultFile,
  getAllVaultFiles,
  getVaultFileById,
  deleteVaultFile
};
