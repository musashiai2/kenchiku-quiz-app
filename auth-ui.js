/**
 * Authentication UI Component
 * Handles login, signup, and user management UI
 */

const AuthUI = (function() {
    let onAuthSuccessCallback = null;
    let isOnlineMode = false;

    // =====================================================
    // Initialization
    // =====================================================

    /**
     * Initialize Auth UI
     * @param {Function} onAuthSuccess - Callback when auth succeeds
     */
    function init(onAuthSuccess) {
        onAuthSuccessCallback = onAuthSuccess;

        // Check if Supabase is configured
        isOnlineMode = isSupabaseConfigured();

        if (isOnlineMode) {
            SupabaseService.init();
            checkExistingSession();
        } else {
            // Fall back to offline mode (use original UserManager)
            console.log('Running in offline mode (LocalStorage only)');
            UserManager.init(onAuthSuccess);
        }
    }

    /**
     * Check for existing session
     */
    async function checkExistingSession() {
        const { data } = await SupabaseService.getSession();

        if (data?.session) {
            // User is logged in
            addUserIndicator();
            if (onAuthSuccessCallback) {
                onAuthSuccessCallback(data.session.user);
            }
        } else {
            // Show auth modal
            showAuthModal();
        }
    }

    // =====================================================
    // Auth Modal
    // =====================================================

    /**
     * Show authentication modal
     */
    function showAuthModal() {
        // Remove existing modal
        const existing = document.getElementById('auth-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'auth-modal-overlay';
        modal.innerHTML = `
            <div class="auth-modal">
                <div class="auth-modal-header">
                    <h2>ログイン</h2>
                    <p class="auth-subtitle">クラウドに学習データを保存・同期</p>
                </div>

                <div class="auth-tabs">
                    <button class="auth-tab active" data-tab="login">ログイン</button>
                    <button class="auth-tab" data-tab="signup">新規登録</button>
                    <button class="auth-tab" data-tab="offline">オフライン</button>
                </div>

                <!-- Login Form -->
                <form id="login-form" class="auth-form active">
                    <div class="auth-field">
                        <label for="login-email">メールアドレス</label>
                        <input type="email" id="login-email" required placeholder="example@company.com">
                    </div>
                    <div class="auth-field">
                        <label for="login-password">パスワード</label>
                        <input type="password" id="login-password" required placeholder="********">
                    </div>
                    <div id="login-error" class="auth-error"></div>
                    <button type="submit" class="auth-btn auth-btn-primary">
                        <span class="btn-text">ログイン</span>
                        <span class="btn-loading hidden">処理中...</span>
                    </button>
                </form>

                <!-- Signup Form -->
                <form id="signup-form" class="auth-form">
                    <div class="auth-field">
                        <label for="signup-name">表示名</label>
                        <input type="text" id="signup-name" required placeholder="山田太郎" maxlength="20">
                    </div>
                    <div class="auth-field">
                        <label for="signup-email">メールアドレス</label>
                        <input type="email" id="signup-email" required placeholder="example@company.com">
                    </div>
                    <div class="auth-field">
                        <label for="signup-password">パスワード</label>
                        <input type="password" id="signup-password" required placeholder="8文字以上" minlength="8">
                    </div>
                    <div class="auth-field">
                        <label for="signup-password-confirm">パスワード確認</label>
                        <input type="password" id="signup-password-confirm" required placeholder="もう一度入力">
                    </div>
                    <div id="signup-error" class="auth-error"></div>
                    <button type="submit" class="auth-btn auth-btn-primary">
                        <span class="btn-text">アカウント作成</span>
                        <span class="btn-loading hidden">処理中...</span>
                    </button>
                </form>

                <!-- Offline Mode -->
                <div id="offline-form" class="auth-form">
                    <div class="offline-info">
                        <div class="offline-icon">📱</div>
                        <h3>オフラインモード</h3>
                        <p>このデバイスにのみデータが保存されます。</p>
                        <ul class="offline-notes">
                            <li>データは端末に保存されます</li>
                            <li>他のデバイスとは同期されません</li>
                            <li>ブラウザのデータ削除で消える可能性があります</li>
                        </ul>
                    </div>
                    <button type="button" class="auth-btn auth-btn-secondary" onclick="AuthUI.useOfflineMode()">
                        オフラインで利用する
                    </button>
                </div>

                <div class="auth-footer">
                    <p class="auth-note">クラウド同期で複数端末から学習データにアクセスできます</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        addAuthModalStyles();
        attachAuthEventListeners();
    }

    /**
     * Attach event listeners to auth modal
     */
    function attachAuthEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('.auth-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const forms = document.querySelectorAll('.auth-form');
                forms.forEach(f => f.classList.remove('active'));

                const targetForm = document.getElementById(`${tab.dataset.tab}-form`);
                if (targetForm) targetForm.classList.add('active');

                // Update header
                const header = document.querySelector('.auth-modal-header h2');
                const titles = {
                    login: 'ログイン',
                    signup: '新規登録',
                    offline: 'オフラインモード'
                };
                header.textContent = titles[tab.dataset.tab];
            });
        });

        // Login form
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', handleLogin);

        // Signup form
        const signupForm = document.getElementById('signup-form');
        signupForm.addEventListener('submit', handleSignup);
    }

    /**
     * Handle login form submission
     */
    async function handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        const btn = e.target.querySelector('.auth-btn');

        setButtonLoading(btn, true);
        errorEl.textContent = '';

        const { data, error } = await SupabaseService.signIn(email, password);

        setButtonLoading(btn, false);

        if (error) {
            errorEl.textContent = translateError(error.message);
            return;
        }

        // Success
        closeAuthModal();
        addUserIndicator();

        // Check if user has local data to sync
        await offerDataSync();

        if (onAuthSuccessCallback) {
            onAuthSuccessCallback(data.user);
        }
    }

    /**
     * Handle signup form submission
     */
    async function handleSignup(e) {
        e.preventDefault();

        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;
        const errorEl = document.getElementById('signup-error');
        const btn = e.target.querySelector('.auth-btn');

        // Validation
        if (password !== passwordConfirm) {
            errorEl.textContent = 'パスワードが一致しません';
            return;
        }

        setButtonLoading(btn, true);
        errorEl.textContent = '';

        const { data, error } = await SupabaseService.signUp(email, password, name);

        setButtonLoading(btn, false);

        if (error) {
            errorEl.textContent = translateError(error.message);
            return;
        }

        // Check if email confirmation is required
        if (data.user && !data.session) {
            errorEl.innerHTML = '<span class="success">確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。</span>';
            return;
        }

        // Success - auto login
        closeAuthModal();
        addUserIndicator();

        if (onAuthSuccessCallback) {
            onAuthSuccessCallback(data.user);
        }
    }

    /**
     * Use offline mode
     */
    function useOfflineMode() {
        closeAuthModal();
        isOnlineMode = false;
        UserManager.init(onAuthSuccessCallback);
    }

    /**
     * Close auth modal
     */
    function closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.remove();
    }

    // =====================================================
    // User Indicator
    // =====================================================

    /**
     * Add user indicator to page
     */
    async function addUserIndicator() {
        const existing = document.getElementById('user-indicator');
        if (existing) existing.remove();

        let displayName = 'ユーザー';
        let isAdmin = false;

        if (isOnlineMode) {
            const { data: profile } = await SupabaseService.getProfile();
            if (profile) {
                displayName = profile.display_name;
                isAdmin = profile.is_admin;
            }
        }

        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.className = 'user-indicator online-mode';
        indicator.innerHTML = `
            <span class="user-icon">${isAdmin ? '👑' : '👤'}</span>
            <span class="user-current-name">${escapeHtml(displayName)}</span>
            <span class="sync-status" title="クラウド同期">☁️</span>
            <button class="user-menu-btn" title="メニュー">▼</button>
        `;

        document.body.appendChild(indicator);

        // Click handler for menu
        indicator.addEventListener('click', showUserMenu);
    }

    /**
     * Show user menu dropdown
     */
    function showUserMenu(e) {
        e.stopPropagation();

        // Remove existing menu
        const existing = document.getElementById('user-menu-dropdown');
        if (existing) {
            existing.remove();
            return;
        }

        const menu = document.createElement('div');
        menu.id = 'user-menu-dropdown';
        menu.className = 'user-menu-dropdown';
        menu.innerHTML = `
            <button class="menu-item" onclick="AuthUI.syncData()">
                <span>🔄</span> データ同期
            </button>
            <button class="menu-item" onclick="AuthUI.showProfile()">
                <span>⚙️</span> プロフィール
            </button>
            <hr class="menu-divider">
            <button class="menu-item menu-item-danger" onclick="AuthUI.handleLogout()">
                <span>🚪</span> ログアウト
            </button>
        `;

        const indicator = document.getElementById('user-indicator');
        const rect = indicator.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;

        document.body.appendChild(menu);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', closeUserMenu, { once: true });
        }, 0);
    }

    /**
     * Close user menu
     */
    function closeUserMenu() {
        const menu = document.getElementById('user-menu-dropdown');
        if (menu) menu.remove();
    }

    /**
     * Handle logout
     */
    async function handleLogout() {
        closeUserMenu();

        if (confirm('ログアウトしますか？')) {
            await SupabaseService.signOut();
            window.location.reload();
        }
    }

    /**
     * Sync data manually
     */
    async function syncData() {
        closeUserMenu();
        showSyncStatus('同期中...');

        // Get current app ID from page
        const appId = getCurrentAppId();

        try {
            // Download latest data from cloud
            const { data, error } = await SupabaseService.downloadToLocal(appId);

            if (error) throw error;

            showSyncStatus('同期完了', 'success');

            // Optionally refresh the page
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            showSyncStatus('同期失敗: ' + e.message, 'error');
        }
    }

    /**
     * Show profile modal
     */
    async function showProfile() {
        closeUserMenu();

        const { data: profile } = await SupabaseService.getProfile();
        if (!profile) return;

        const modal = document.createElement('div');
        modal.id = 'profile-modal';
        modal.className = 'auth-modal-overlay';
        modal.innerHTML = `
            <div class="auth-modal profile-modal">
                <div class="auth-modal-header">
                    <h2>プロフィール</h2>
                    <button class="modal-close-btn" onclick="document.getElementById('profile-modal').remove()">×</button>
                </div>

                <form id="profile-form" class="auth-form active">
                    <div class="auth-field">
                        <label for="profile-name">表示名</label>
                        <input type="text" id="profile-name" value="${escapeHtml(profile.display_name)}" maxlength="20">
                    </div>
                    <div class="auth-field">
                        <label>メールアドレス</label>
                        <input type="email" value="${escapeHtml(SupabaseService.getCurrentUser()?.email || '')}" disabled>
                    </div>
                    <div class="auth-field">
                        <label>登録日</label>
                        <input type="text" value="${new Date(profile.created_at).toLocaleDateString('ja-JP')}" disabled>
                    </div>
                    <div id="profile-error" class="auth-error"></div>
                    <button type="submit" class="auth-btn auth-btn-primary">保存</button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Form submit handler
        document.getElementById('profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const displayName = document.getElementById('profile-name').value.trim();
            if (!displayName) {
                document.getElementById('profile-error').textContent = '表示名を入力してください';
                return;
            }

            const { error } = await SupabaseService.updateProfile({ display_name: displayName });

            if (error) {
                document.getElementById('profile-error').textContent = error.message;
                return;
            }

            modal.remove();

            // Update indicator
            const nameEl = document.querySelector('#user-indicator .user-current-name');
            if (nameEl) nameEl.textContent = displayName;
        });
    }

    // =====================================================
    // Data Sync
    // =====================================================

    /**
     * Offer to sync local data when logging in
     */
    async function offerDataSync() {
        const appId = getCurrentAppId();
        if (!appId) return;

        // Check if there's local data
        const hasLocalData = checkLocalData(appId);
        if (!hasLocalData) return;

        // Ask user if they want to sync
        if (confirm('このデバイスに保存された学習データがあります。クラウドにアップロードしますか？')) {
            await uploadLocalData(appId);
        }
    }

    /**
     * Check if local data exists
     */
    function checkLocalData(appId) {
        const keys = ['wrong', 'bookmarks', 'stats', 'history', 'adaptive'];
        const currentUser = localStorage.getItem('quiz_current_user');

        if (!currentUser) return false;

        for (const key of keys) {
            const fullKey = `quiz_user_${currentUser}_${key}_${appId}`;
            if (localStorage.getItem(fullKey)) return true;
        }

        return false;
    }

    /**
     * Upload local data to cloud
     */
    async function uploadLocalData(appId) {
        showSyncStatus('アップロード中...');

        const currentUser = localStorage.getItem('quiz_current_user');
        if (!currentUser) return;

        const prefix = `quiz_user_${currentUser}_`;

        const localData = {
            wrongAnswers: JSON.parse(localStorage.getItem(prefix + 'wrong_' + appId) || '{}'),
            bookmarks: JSON.parse(localStorage.getItem(prefix + 'bookmarks_' + appId) || '[]'),
            adaptiveLearning: JSON.parse(localStorage.getItem(prefix + 'adaptive_' + appId) || '{}'),
            history: JSON.parse(localStorage.getItem(prefix + 'history_' + appId) || '[]')
        };

        const result = await SupabaseService.syncLocalToSupabase(appId, localData);

        if (result.success) {
            showSyncStatus('アップロード完了', 'success');
        } else {
            showSyncStatus('一部のデータのアップロードに失敗しました', 'error');
            console.error('Sync errors:', result.errors);
        }
    }

    // =====================================================
    // Utilities
    // =====================================================

    /**
     * Show sync status message
     */
    function showSyncStatus(message, type = 'info') {
        const existing = document.getElementById('sync-status-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'sync-status-toast';
        toast.className = `sync-toast sync-toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        if (type !== 'info') {
            setTimeout(() => toast.remove(), 3000);
        }
    }

    /**
     * Set button loading state
     */
    function setButtonLoading(btn, loading) {
        const textEl = btn.querySelector('.btn-text');
        const loadingEl = btn.querySelector('.btn-loading');

        if (loading) {
            btn.disabled = true;
            if (textEl) textEl.classList.add('hidden');
            if (loadingEl) loadingEl.classList.remove('hidden');
        } else {
            btn.disabled = false;
            if (textEl) textEl.classList.remove('hidden');
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    /**
     * Translate error messages to Japanese
     */
    function translateError(message) {
        const translations = {
            'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
            'User already registered': 'このメールアドレスは既に登録されています',
            'Password should be at least 6 characters': 'パスワードは6文字以上にしてください',
            'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません',
            'Email rate limit exceeded': 'しばらく時間をおいてから再試行してください',
            'Network request failed': 'ネットワークエラーが発生しました'
        };

        return translations[message] || message;
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get current app ID from page
     */
    function getCurrentAppId() {
        // Try to detect from URL or page content
        const path = window.location.pathname;
        const match = path.match(/\/(r\d|takken|kenchikushi|keirishi|mental)\//);
        if (match) return match[1];

        // Fallback: try to get from global variable
        if (typeof STORAGE_BASE_KEYS !== 'undefined' && STORAGE_BASE_KEYS.wrongAnswers) {
            const match = STORAGE_BASE_KEYS.wrongAnswers.match(/wrong_(\w+)/);
            if (match) return match[1];
        }

        return null;
    }

    /**
     * Check if in online mode
     */
    function isOnline() {
        return isOnlineMode && SupabaseService.getCurrentUser() !== null;
    }

    // =====================================================
    // Styles
    // =====================================================

    function addAuthModalStyles() {
        if (document.getElementById('auth-modal-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'auth-modal-styles';
        styles.textContent = `
            .auth-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
                backdrop-filter: blur(4px);
            }

            .auth-modal {
                background: var(--card-bg, #ffffff);
                border-radius: 20px;
                padding: 30px;
                max-width: 420px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: authModalSlideIn 0.3s ease;
            }

            @keyframes authModalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            .auth-modal-header {
                text-align: center;
                margin-bottom: 24px;
                position: relative;
            }

            .auth-modal-header h2 {
                color: var(--primary-color, #2563eb);
                font-size: 1.5rem;
                margin-bottom: 8px;
            }

            .auth-subtitle {
                color: var(--text-light, #64748b);
                font-size: 0.9rem;
            }

            .modal-close-btn {
                position: absolute;
                top: 0;
                right: 0;
                background: none;
                border: none;
                font-size: 1.5rem;
                color: var(--text-light, #64748b);
                cursor: pointer;
            }

            .auth-tabs {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .auth-tab {
                flex: 1;
                padding: 12px;
                border: none;
                background: var(--bg-color, #f1f5f9);
                border-radius: 10px;
                font-size: 0.9rem;
                font-weight: 600;
                color: var(--text-light, #64748b);
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .auth-tab:hover {
                background: var(--border-color, #e2e8f0);
            }

            .auth-tab.active {
                background: var(--primary-color, #2563eb);
                color: white;
            }

            .auth-form {
                display: none;
            }

            .auth-form.active {
                display: block;
            }

            .auth-field {
                margin-bottom: 16px;
            }

            .auth-field label {
                display: block;
                font-size: 0.85rem;
                font-weight: 600;
                color: var(--text-color, #1e293b);
                margin-bottom: 6px;
            }

            .auth-field input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid var(--border-color, #e2e8f0);
                border-radius: 10px;
                font-size: 1rem;
                background: var(--bg-color, #f8fafc);
                color: var(--text-color, #1e293b);
                transition: border-color 0.2s ease;
                box-sizing: border-box;
            }

            .auth-field input:focus {
                outline: none;
                border-color: var(--primary-color, #2563eb);
            }

            .auth-field input:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .auth-error {
                color: #ef4444;
                font-size: 0.85rem;
                margin-bottom: 16px;
                min-height: 20px;
            }

            .auth-error .success {
                color: #22c55e;
            }

            .auth-btn {
                width: 100%;
                padding: 14px 20px;
                border: none;
                border-radius: 12px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .auth-btn-primary {
                background: linear-gradient(135deg, var(--primary-color, #2563eb), var(--accent-color, #8b5cf6));
                color: white;
            }

            .auth-btn-primary:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
            }

            .auth-btn-secondary {
                background: var(--bg-color, #f1f5f9);
                color: var(--text-color, #1e293b);
            }

            .auth-btn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }

            .auth-btn .hidden {
                display: none;
            }

            .offline-info {
                text-align: center;
                padding: 20px;
            }

            .offline-icon {
                font-size: 3rem;
                margin-bottom: 16px;
            }

            .offline-info h3 {
                margin-bottom: 10px;
                color: var(--text-color, #1e293b);
            }

            .offline-info p {
                color: var(--text-light, #64748b);
                margin-bottom: 16px;
            }

            .offline-notes {
                text-align: left;
                color: var(--text-light, #64748b);
                font-size: 0.85rem;
                margin: 16px 0;
                padding-left: 20px;
            }

            .offline-notes li {
                margin-bottom: 8px;
            }

            .auth-footer {
                margin-top: 20px;
                text-align: center;
            }

            .auth-note {
                color: var(--text-light, #64748b);
                font-size: 0.8rem;
            }

            /* User indicator styles for online mode */
            .user-indicator.online-mode {
                background: linear-gradient(135deg, var(--card-bg, #ffffff), var(--bg-color, #f8fafc));
            }

            .sync-status {
                font-size: 0.9rem;
                opacity: 0.8;
            }

            .user-menu-btn {
                background: none;
                border: none;
                color: var(--text-light, #64748b);
                font-size: 0.7rem;
                cursor: pointer;
                padding: 2px 4px;
            }

            .user-menu-dropdown {
                position: fixed;
                background: var(--card-bg, #ffffff);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                min-width: 160px;
                overflow: hidden;
            }

            .menu-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: none;
                text-align: left;
                font-size: 0.9rem;
                color: var(--text-color, #1e293b);
                cursor: pointer;
                transition: background 0.2s ease;
            }

            .menu-item:hover {
                background: var(--bg-color, #f1f5f9);
            }

            .menu-item-danger {
                color: #ef4444;
            }

            .menu-item-danger:hover {
                background: #fef2f2;
            }

            .menu-divider {
                border: none;
                border-top: 1px solid var(--border-color, #e2e8f0);
                margin: 4px 0;
            }

            .sync-toast {
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                border-radius: 10px;
                font-size: 0.9rem;
                z-index: 10002;
                animation: toastSlideIn 0.3s ease;
            }

            @keyframes toastSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }

            .sync-toast-info {
                background: var(--primary-color, #2563eb);
                color: white;
            }

            .sync-toast-success {
                background: #22c55e;
                color: white;
            }

            .sync-toast-error {
                background: #ef4444;
                color: white;
            }

            /* Dark mode */
            body.dark-mode .auth-modal {
                background: var(--card-bg, #1e293b);
            }

            body.dark-mode .auth-tab {
                background: var(--bg-color, #0f172a);
            }

            body.dark-mode .auth-field input {
                background: var(--bg-color, #0f172a);
                border-color: var(--border-color, #334155);
            }

            body.dark-mode .user-menu-dropdown {
                background: var(--card-bg, #1e293b);
            }

            body.dark-mode .menu-item:hover {
                background: var(--bg-color, #0f172a);
            }

            /* Responsive */
            @media (max-width: 480px) {
                .auth-modal {
                    padding: 20px;
                    margin: 10px;
                }

                .auth-tabs {
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    // Public API
    return {
        init,
        showAuthModal,
        useOfflineMode,
        handleLogout,
        syncData,
        showProfile,
        isOnline,
        getCurrentAppId
    };
})();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.AuthUI = AuthUI;
}
