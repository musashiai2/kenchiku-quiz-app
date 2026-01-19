/**
 * User Management System for Quiz Apps
 * Supports both Supabase (online) and LocalStorage (offline) modes
 *
 * When Supabase is configured and user is logged in:
 * - Data is synced to cloud
 * - Cross-device access enabled
 *
 * When offline or Supabase not configured:
 * - Data stored in LocalStorage
 * - Works as standalone app
 */

const UserManager = (function() {
    // Storage keys
    const USERS_KEY = 'quiz_users';
    const CURRENT_USER_KEY = 'quiz_current_user';
    const USER_PREFIX = 'quiz_user_';
    const ONLINE_MODE_KEY = 'quiz_online_mode';

    // State
    let isOnlineMode = false;
    let supabaseUser = null;

    // =====================================================
    // Mode Detection and Initialization
    // =====================================================

    /**
     * Check if running in online mode with Supabase
     */
    function checkOnlineMode() {
        // Check if Supabase is available and configured
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
            if (typeof SupabaseService !== 'undefined') {
                supabaseUser = SupabaseService.getCurrentUser();
                isOnlineMode = supabaseUser !== null;
            }
        }
        return isOnlineMode;
    }

    /**
     * Set online mode
     */
    function setOnlineMode(online, user = null) {
        isOnlineMode = online;
        supabaseUser = user;
        localStorage.setItem(ONLINE_MODE_KEY, online ? 'true' : 'false');
    }

    /**
     * Is currently in online mode
     */
    function isOnline() {
        return isOnlineMode && supabaseUser !== null;
    }

    // =====================================================
    // User Management Functions (Offline Mode)
    // =====================================================

    /**
     * Get all registered users (offline mode)
     */
    function getUsers() {
        const data = localStorage.getItem(USERS_KEY);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Save users list
     */
    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    /**
     * Get current user (offline mode)
     */
    function getCurrentUser() {
        if (isOnlineMode && supabaseUser) {
            return supabaseUser.email || supabaseUser.id;
        }
        return localStorage.getItem(CURRENT_USER_KEY);
    }

    /**
     * Set current user (offline mode)
     */
    function setCurrentUser(userName) {
        localStorage.setItem(CURRENT_USER_KEY, userName);
    }

    /**
     * Add a new user (offline mode)
     */
    function addUser(userName) {
        const trimmedName = userName.trim();
        if (!trimmedName) {
            return { success: false, message: 'ユーザー名を入力してください' };
        }

        const users = getUsers();
        if (users.includes(trimmedName)) {
            return { success: false, message: 'このユーザー名は既に登録されています' };
        }

        users.push(trimmedName);
        saveUsers(users);
        return { success: true, message: 'ユーザーを追加しました' };
    }

    /**
     * Delete a user and all their data (offline mode)
     */
    function deleteUser(userName) {
        const users = getUsers();
        const index = users.indexOf(userName);

        if (index === -1) {
            return { success: false, message: 'ユーザーが見つかりません' };
        }

        users.splice(index, 1);
        saveUsers(users);

        // Clear user data from all apps
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(USER_PREFIX + userName)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        if (getCurrentUser() === userName) {
            localStorage.removeItem(CURRENT_USER_KEY);
        }

        return { success: true, message: 'ユーザーを削除しました' };
    }

    /**
     * Select a user (offline mode)
     */
    function selectUser(userName) {
        const users = getUsers();
        if (!users.includes(userName)) {
            return { success: false, message: 'ユーザーが見つかりません' };
        }

        setCurrentUser(userName);
        return { success: true, message: `${userName}さんを選択しました` };
    }

    /**
     * Check if a user is selected
     */
    function hasCurrentUser() {
        if (isOnlineMode) {
            return supabaseUser !== null;
        }
        const currentUser = getCurrentUser();
        const users = getUsers();
        return currentUser && users.includes(currentUser);
    }

    // =====================================================
    // User-prefixed Storage Functions (Hybrid)
    // =====================================================

    /**
     * Get storage key for current user (offline mode)
     */
    function getUserKey(baseKey) {
        const currentUser = getCurrentUser();
        if (!currentUser) return null;
        return USER_PREFIX + currentUser + '_' + baseKey;
    }

    /**
     * Get data from user-specific storage
     * In online mode, also syncs from cloud
     */
    function getUserData(baseKey, defaultValue = null) {
        // First get from local storage (works offline)
        const key = getUserKey(baseKey);
        if (!key) return defaultValue;

        const data = localStorage.getItem(key);
        let result = defaultValue;

        if (data !== null) {
            try {
                result = JSON.parse(data);
            } catch {
                result = data;
            }
        }

        return result;
    }

    /**
     * Save data to user-specific storage
     * In online mode, also syncs to cloud
     */
    function setUserData(baseKey, value) {
        // Always save to localStorage first (offline-first)
        const key = getUserKey(baseKey);
        if (!key) return false;

        const data = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, data);

        // If online, also sync to cloud (non-blocking)
        if (isOnlineMode && supabaseUser && typeof SupabaseService !== 'undefined') {
            syncToCloud(baseKey, value);
        }

        return true;
    }

    /**
     * Remove user-specific data
     */
    function removeUserData(baseKey) {
        const key = getUserKey(baseKey);
        if (!key) return false;

        localStorage.removeItem(key);
        return true;
    }

    /**
     * Sync data to cloud (non-blocking)
     */
    async function syncToCloud(baseKey, value) {
        if (!isOnlineMode || !supabaseUser) return;

        try {
            // Extract app ID from baseKey (e.g., "wrong_r1" -> "r1")
            const appIdMatch = baseKey.match(/_(r\d|takken|kenchikushi|keirishi|mental)$/);
            if (!appIdMatch) return;

            const appId = appIdMatch[1];
            const dataType = baseKey.replace('_' + appId, '');

            // Sync based on data type
            switch (dataType) {
                case 'wrong':
                    // Sync wrong answers
                    for (const [qId, data] of Object.entries(value || {})) {
                        if (data.count > 0) {
                            await SupabaseService.saveWrongAnswer(appId, parseInt(qId));
                        }
                    }
                    break;

                case 'bookmarks':
                    // Bookmarks are synced individually via addBookmark/removeBookmark
                    break;

                case 'adaptive':
                    // Adaptive learning is synced during quiz
                    break;

                case 'stats':
                    // Stats are computed server-side
                    break;
            }
        } catch (e) {
            console.warn('Cloud sync failed:', e);
        }
    }

    // =====================================================
    // UI Functions
    // =====================================================

    /**
     * Show user selection modal (offline mode)
     */
    function showUserSelectionModal(onSelect) {
        const existingModal = document.getElementById('user-selection-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const users = getUsers();
        const currentUser = getCurrentUser();

        const modal = document.createElement('div');
        modal.id = 'user-selection-modal';
        modal.className = 'user-modal-overlay';
        modal.innerHTML = `
            <div class="user-modal">
                <div class="user-modal-header">
                    <h2>ユーザーを選択</h2>
                    <p class="user-modal-subtitle">学習データはユーザーごとに保存されます</p>
                </div>

                <div class="user-list" id="user-list">
                    ${users.length === 0 ?
                        '<p class="no-users">ユーザーが登録されていません。<br>新規ユーザーを追加してください。</p>' :
                        users.map(user => `
                            <div class="user-item ${user === currentUser ? 'current' : ''}" data-user="${escapeHtml(user)}">
                                <span class="user-name">${escapeHtml(user)}</span>
                                <button class="user-delete-btn" data-user="${escapeHtml(user)}" title="削除">×</button>
                            </div>
                        `).join('')
                    }
                </div>

                <div class="user-add-section">
                    <input type="text" id="new-user-name" class="user-input" placeholder="新しいユーザー名を入力" maxlength="20">
                    <button id="add-user-btn" class="user-btn user-btn-add">追加</button>
                </div>

                <div class="user-modal-footer">
                    ${hasCurrentUser() ? '<button id="user-cancel-btn" class="user-btn user-btn-secondary">キャンセル</button>' : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        addUserModalStyles();

        // Event listeners
        const userList = document.getElementById('user-list');
        userList.addEventListener('click', (e) => {
            const userItem = e.target.closest('.user-item');
            const deleteBtn = e.target.closest('.user-delete-btn');

            if (deleteBtn) {
                e.stopPropagation();
                const userName = deleteBtn.dataset.user;
                showDeleteConfirmation(userName, () => {
                    refreshUserList(onSelect);
                });
            } else if (userItem) {
                const userName = userItem.dataset.user;
                const result = selectUser(userName);
                if (result.success) {
                    modal.remove();
                    if (onSelect) onSelect(userName);
                }
            }
        });

        const addBtn = document.getElementById('add-user-btn');
        const nameInput = document.getElementById('new-user-name');

        addBtn.addEventListener('click', () => {
            const result = addUser(nameInput.value);
            if (result.success) {
                nameInput.value = '';
                refreshUserList(onSelect);
            } else {
                alert(result.message);
            }
        });

        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });

        const cancelBtn = document.getElementById('user-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.remove();
            });
        }

        if (users.length === 0) {
            nameInput.focus();
        }
    }

    /**
     * Refresh user list in modal
     */
    function refreshUserList(onSelect) {
        const users = getUsers();
        const currentUser = getCurrentUser();
        const userList = document.getElementById('user-list');

        if (!userList) return;

        userList.innerHTML = users.length === 0 ?
            '<p class="no-users">ユーザーが登録されていません。<br>新規ユーザーを追加してください。</p>' :
            users.map(user => `
                <div class="user-item ${user === currentUser ? 'current' : ''}" data-user="${escapeHtml(user)}">
                    <span class="user-name">${escapeHtml(user)}</span>
                    <button class="user-delete-btn" data-user="${escapeHtml(user)}" title="削除">×</button>
                </div>
            `).join('');

        const footer = document.querySelector('.user-modal-footer');
        if (footer) {
            footer.innerHTML = hasCurrentUser() ? '<button id="user-cancel-btn" class="user-btn user-btn-secondary">キャンセル</button>' : '';
            const cancelBtn = document.getElementById('user-cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    document.getElementById('user-selection-modal').remove();
                });
            }
        }
    }

    /**
     * Show delete confirmation dialog
     */
    function showDeleteConfirmation(userName, onConfirm) {
        const confirmed = confirm(`「${userName}」さんを削除しますか？\n\n※学習データも全て削除されます。この操作は取り消せません。`);
        if (confirmed) {
            const result = deleteUser(userName);
            if (result.success) {
                if (onConfirm) onConfirm();
            } else {
                alert(result.message);
            }
        }
    }

    /**
     * Create user indicator element
     */
    function createUserIndicator() {
        const currentUser = getCurrentUser();
        const isCloudMode = isOnlineMode && supabaseUser;

        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.className = `user-indicator ${isCloudMode ? 'online-mode' : ''}`;
        indicator.innerHTML = `
            <span class="user-icon">${isCloudMode ? '☁️' : '👤'}</span>
            <span class="user-current-name">${currentUser ? escapeHtml(currentUser) : '未選択'}</span>
            <button class="user-change-btn" title="ユーザー切替">▼</button>
        `;

        return indicator;
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Add modal styles to document
     */
    function addUserModalStyles() {
        if (document.getElementById('user-modal-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'user-modal-styles';
        styles.textContent = `
            .user-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
                backdrop-filter: blur(4px);
            }

            .user-modal {
                background: var(--card-bg, #ffffff);
                border-radius: 20px;
                padding: 30px;
                max-width: 400px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: modalSlideIn 0.3s ease;
            }

            @keyframes modalSlideIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .user-modal-header {
                text-align: center;
                margin-bottom: 24px;
            }

            .user-modal-header h2 {
                color: var(--primary-color, #2563eb);
                font-size: 1.5rem;
                margin-bottom: 8px;
            }

            .user-modal-subtitle {
                color: var(--text-light, #64748b);
                font-size: 0.9rem;
            }

            .user-list {
                margin-bottom: 20px;
                max-height: 250px;
                overflow-y: auto;
            }

            .no-users {
                text-align: center;
                color: var(--text-light, #64748b);
                padding: 30px 20px;
                line-height: 1.6;
            }

            .user-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                background: var(--bg-color, #f1f5f9);
                border-radius: 12px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 2px solid transparent;
            }

            .user-item:hover {
                background: var(--primary-color, #2563eb);
                color: white;
            }

            .user-item:hover .user-delete-btn {
                color: rgba(255, 255, 255, 0.7);
            }

            .user-item:hover .user-delete-btn:hover {
                color: white;
                background: rgba(255, 255, 255, 0.2);
            }

            .user-item.current {
                border-color: var(--primary-color, #2563eb);
            }

            .user-name {
                font-weight: 500;
                font-size: 1rem;
            }

            .user-delete-btn {
                background: none;
                border: none;
                color: var(--text-light, #64748b);
                font-size: 1.2rem;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                transition: all 0.2s ease;
            }

            .user-delete-btn:hover {
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
            }

            .user-add-section {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .user-input {
                flex: 1;
                padding: 12px 16px;
                border: 2px solid var(--border-color, #e2e8f0);
                border-radius: 10px;
                font-size: 1rem;
                background: var(--bg-color, #f1f5f9);
                color: var(--text-color, #1e293b);
                transition: border-color 0.2s ease;
            }

            .user-input:focus {
                outline: none;
                border-color: var(--primary-color, #2563eb);
            }

            .user-btn {
                padding: 12px 20px;
                border: none;
                border-radius: 10px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .user-btn-add {
                background: linear-gradient(135deg, var(--primary-color, #2563eb), var(--accent-color, #8b5cf6));
                color: white;
            }

            .user-btn-add:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
            }

            .user-btn-secondary {
                background: var(--bg-color, #f1f5f9);
                color: var(--text-color, #1e293b);
            }

            .user-btn-secondary:hover {
                background: var(--border-color, #e2e8f0);
            }

            .user-modal-footer {
                text-align: center;
            }

            .user-indicator {
                position: fixed;
                top: 20px;
                left: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 14px;
                background: var(--card-bg, #ffffff);
                border-radius: 30px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                z-index: 999;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .user-indicator:hover {
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
            }

            .user-indicator.online-mode {
                background: linear-gradient(135deg, var(--card-bg, #ffffff), #e0f2fe);
            }

            .user-icon {
                font-size: 1.1rem;
            }

            .user-current-name {
                font-weight: 500;
                color: var(--text-color, #1e293b);
                max-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .user-change-btn {
                background: none;
                border: none;
                color: var(--text-light, #64748b);
                font-size: 0.7rem;
                cursor: pointer;
                padding: 2px;
            }

            body.dark-mode .user-modal {
                background: var(--card-bg, #1e293b);
            }

            body.dark-mode .user-input {
                background: var(--bg-color, #0f172a);
                border-color: var(--border-color, #334155);
                color: var(--text-color, #f1f5f9);
            }

            body.dark-mode .user-item {
                background: var(--bg-color, #0f172a);
            }

            body.dark-mode .user-indicator {
                background: var(--card-bg, #1e293b);
            }

            @media (max-width: 480px) {
                .user-modal {
                    padding: 20px;
                    margin: 10px;
                }

                .user-indicator {
                    left: 10px;
                    top: 10px;
                    padding: 6px 12px;
                }

                .user-current-name {
                    max-width: 80px;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Initialize user management on page load
     * Uses AuthUI if Supabase is configured, otherwise shows local user modal
     */
    function init(onUserReady) {
        addUserModalStyles();

        // Check if Supabase/AuthUI is available
        if (typeof AuthUI !== 'undefined' && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
            // Use AuthUI for authentication
            AuthUI.init((user) => {
                if (user) {
                    // Online mode
                    setOnlineMode(true, user);
                }
                if (onUserReady) onUserReady(getCurrentUser());
            });
        } else {
            // Offline mode - use local user selection
            if (!hasCurrentUser()) {
                showUserSelectionModal((userName) => {
                    addUserIndicatorToPage();
                    if (onUserReady) onUserReady(userName);
                });
            } else {
                addUserIndicatorToPage();
                if (onUserReady) onUserReady(getCurrentUser());
            }
        }
    }

    /**
     * Add user indicator to page
     */
    function addUserIndicatorToPage() {
        const existing = document.getElementById('user-indicator');
        if (existing) existing.remove();

        const indicator = createUserIndicator();
        document.body.appendChild(indicator);

        indicator.addEventListener('click', () => {
            if (isOnlineMode && typeof AuthUI !== 'undefined') {
                // Online mode - show AuthUI menu
                AuthUI.showAuthModal();
            } else {
                // Offline mode - show user selection
                showUserSelectionModal((userName) => {
                    const nameEl = indicator.querySelector('.user-current-name');
                    if (nameEl) {
                        nameEl.textContent = userName;
                    }
                    window.location.reload();
                });
            }
        });
    }

    // Public API
    return {
        // Mode
        checkOnlineMode,
        setOnlineMode,
        isOnline,

        // User management
        getUsers,
        getCurrentUser,
        addUser,
        deleteUser,
        selectUser,
        hasCurrentUser,

        // User-prefixed storage
        getUserKey,
        getUserData,
        setUserData,
        removeUserData,

        // UI
        showUserSelectionModal,
        createUserIndicator,
        init,
        addUserIndicatorToPage
    };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserManager;
}
