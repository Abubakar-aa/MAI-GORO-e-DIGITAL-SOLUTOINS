// ============================================================
// MAI GORO — Private Vault Client (Backend Connected)
// ============================================================
// Connects to the Express & Multer backend API on http://localhost:5000.
// Files are securely uploaded to disk and tracked in SQLite.

(() => {
    const API_BASE = (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '5000'))
        ? 'http://localhost:5000/api'
        : '/api';
    const TOKEN_KEY = 'maigoro_token';

    const loginPanel = document.querySelector('#loginPanel');
    const vaultPanel = document.querySelector('#vaultPanel');
    const loginForm = document.querySelector('#loginForm');
    const vaultEmail = document.querySelector('#vaultEmail');
    const vaultPassword = document.querySelector('#vaultPassword');
    const loginError = document.querySelector('#loginError');
    const filePicker = document.querySelector('#filePicker');
    const fileList = document.querySelector('#fileList');
    const emptyState = document.querySelector('#emptyState');
    const fileCount = document.querySelector('#fileCount');
    const logoutButton = document.querySelector('#logoutButton');

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function removeToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function showVault() {
        if (loginPanel) loginPanel.hidden = true;
        if (vaultPanel) vaultPanel.hidden = false;
        loadVaultFiles();
    }

    function showLogin() {
        if (vaultPanel) vaultPanel.hidden = true;
        if (loginPanel) loginPanel.hidden = false;
        if (vaultPassword) vaultPassword.value = '';
    }

    // 1. Load all vault files from backend server
    async function loadVaultFiles() {
        const token = getToken();
        if (!token) { showLogin(); return; }

        try {
            const res = await fetch(`${API_BASE}/vault/files`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401) {
                removeToken();
                showLogin();
                return;
            }

            const data = await res.json();
            renderFileList(data.files || []);
        } catch (err) {
            console.error('Error fetching vault files:', err);
            fileList.innerHTML = '<p class="vault-empty" style="color:#dc2626;">Could not connect to backend server. Make sure it is running at http://localhost:5000.</p>';
        }
    }

    // 2. Render files in UI
    function renderFileList(files) {
        fileList.replaceChildren();
        fileCount.textContent = files.length;
        emptyState.hidden = files.length > 0;

        const token = getToken();

        files.forEach((file) => {
            const item = document.createElement('article');
            item.className = 'file-item';
            
            const downloadUrl = `${API_BASE}/vault/download/${file.id}?token=${token}`;
            const dateStr = new Date(file.created_at).toLocaleDateString();

            item.innerHTML = `
                <div class="file-icon"><i class="fa-solid fa-file"></i></div>
                <div class="file-details">
                    <strong></strong>
                    <span>${formatSize(file.file_size)} · ${file.mime_type || 'File'} · Added ${dateStr}</span>
                </div>
                <a class="file-download" href="${downloadUrl}" download="${encodeURIComponent(file.original_name)}" aria-label="Download ${file.original_name}">
                    <i class="fa-solid fa-download"></i>
                </a>
                <button type="button" class="file-delete" aria-label="Delete ${file.original_name}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;

            item.querySelector('strong').textContent = file.original_name;

            // Delete action
            item.querySelector('.file-delete').addEventListener('click', async () => {
                if (!window.confirm(`Delete "${file.original_name}" from the secure vault?`)) return;
                try {
                    const delRes = await fetch(`${API_BASE}/vault/files/${file.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (delRes.ok) {
                        loadVaultFiles();
                    } else {
                        window.alert('Failed to delete file.');
                    }
                } catch (e) {
                    window.alert('Server error deleting file.');
                }
            });

            fileList.append(item);
        });
    }

    // 3. Handle File Uploads via Multer multipart/form-data
    filePicker?.addEventListener('change', async () => {
        if (!filePicker.files || filePicker.files.length === 0) return;

        const token = getToken();
        if (!token) { showLogin(); return; }

        const formData = new FormData();
        for (const file of filePicker.files) {
            formData.append('files', file);
        }

        // Show uploading state
        emptyState.hidden = false;
        emptyState.textContent = 'Uploading file(s) to server...';

        try {
            const res = await fetch(`${API_BASE}/vault/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await res.json();
            if (res.ok && result.success) {
                filePicker.value = '';
                loadVaultFiles();
            } else {
                window.alert(result.error || 'Upload failed.');
                loadVaultFiles();
            }
        } catch (err) {
            console.error('Upload error:', err);
            window.alert('Could not upload file. Make sure backend server is running.');
            loadVaultFiles();
        }
    });

    // 4. Handle Login Form Submission
    loginForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        loginError.hidden = true;

        const email = vaultEmail.value.trim();
        const password = vaultPassword.value;

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok && data.success && data.token) {
                setToken(data.token);
                showVault();
            } else {
                loginError.hidden = false;
                loginError.textContent = data.error || 'Invalid email or password.';
                vaultPassword.select();
            }
        } catch (err) {
            loginError.hidden = false;
            loginError.textContent = 'Could not connect to backend server. Make sure http://localhost:5000 is running.';
        }
    });

    // 5. Logout action
    logoutButton?.addEventListener('click', () => {
        removeToken();
        showLogin();
    });

    // 6. Check if already authenticated on initial load
    async function checkAuthOnLoad() {
        const token = getToken();
        if (!token) {
            showLogin();
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showVault();
            } else {
                removeToken();
                showLogin();
            }
        } catch {
            showLogin();
        }
    }

    checkAuthOnLoad();
})();
