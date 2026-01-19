/**
 * User Management System for Quiz Apps
 * Shared across all quiz applications
 *
 * Data structure in localStorage:
 * - quiz_users: Array of user names
 * - quiz_current_user: Currently selected user name
 * - quiz_user_{userName}_studied: Array of studied question IDs
 * - quiz_user_{userName}_difficult: Array of difficult question IDs
 * - quiz_user_{userName}_bookmarks: Array of bookmarked question IDs
 * - quiz_user_{userName}_stats: Statistics object
 * - quiz_user_{userName}_history: Learning history array
 * - quiz_user_{userName}_wrong: Wrong answers object
 */

const UserManager = (function() {
    // Storage keys
    const USERS_KEY = 'quiz_users';
    const CURRENT_USER_KEY = 'quiz_current_user';
    const USER_PREFIX = 'quiz_user_';

    // =====================
    // User Management Functions
    // =====================

    /**
     * Get all registered users
     * @returns {string[]} Array of user names
     */
    function getUsers() {
        const data = localStorage.getItem(USERS_KEY);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Save users list
     * @param {string[]} users - Array of user names
     */
    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    /**
     * Get current user
     * @returns {string|null} Current user name or null if not set
     */
    function getCurrentUser() {
        return localStorage.getItem(CURRENT_USER_KEY);
    }

    /**
     * Set current user
     * @param {string} userName - User name to set as current
     */
    function setCurrentUser(userName) {
        localStorage.setItem(CURRENT_USER_KEY, userName);
    }

    /**
     * Add a new user
     * @param {string} userName - Name of the new user
     * @returns {boolean} True if successful, false if user already exists
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
     * Delete a user and all their data
     * @param {string} userName - Name of the user to delete
     * @returns {boolean} True if successful
     */
    function deleteUser(userName) {
        const users = getUsers();
        const index = users.indexOf(userName);

        if (index === -1) {
            return { success: false, message: 'ユーザーが見つかりません' };
        }

        // Remove user from list
        users.splice(index, 1);
        saveUsers(users);

        // Clear user data from all apps
        const suffixes = ['_studied', '_difficult', '_bookmarks', '_stats', '_history', '_wrong'];
        const appPrefixes = ['_r1', '_r2', '_r3', '_r4', '_r5', '_r6', '_r7', '_takken', '_kenchikushi', '_keirishi', '_mental', ''];

        suffixes.forEach(suffix => {
            appPrefixes.forEach(appPrefix => {
                const key = USER_PREFIX + userName + appPrefix + suffix;
                localStorage.removeItem(key);
            });
        });

        // Also remove any keys that match the pattern
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(USER_PREFIX + userName)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // If deleted user was current user, clear current user
        if (getCurrentUser() === userName) {
            localStorage.removeItem(CURRENT_USER_KEY);
        }

        return { success: true, message: 'ユーザーを削除しました' };
    }

    /**
     * Select a user
     * @param {string} userName - Name of the user to select
     * @returns {boolean} True if successful
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
     * @returns {boolean} True if a user is currently selected
     */
    function hasCurrentUser() {
        const currentUser = getCurrentUser();
        const users = getUsers();
        return currentUser && users.includes(currentUser);
    }

    // =====================
    // User-prefixed Storage Functions
    // =====================

    /**
     * Get storage key for current user
     * @param {string} baseKey - Base key name (e.g., 'wrong_r7')
     * @returns {string|null} Full key with user prefix, or null if no user
     */
    function getUserKey(baseKey) {
        const currentUser = getCurrentUser();
        if (!currentUser) return null;
        return USER_PREFIX + currentUser + '_' + baseKey;
    }

    /**
     * Get data from user-specific storage
     * @param {string} baseKey - Base key name
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Stored value or default
     */
    function getUserData(baseKey, defaultValue = null) {
        const key = getUserKey(baseKey);
        if (!key) return defaultValue;

        const data = localStorage.getItem(key);
        if (data === null) return defaultValue;

        try {
            return JSON.parse(data);
        } catch {
            return data;
        }
    }

    /**
     * Save data to user-specific storage
     * @param {string} baseKey - Base key name
     * @param {*} value - Value to store
     * @returns {boolean} True if successful
     */
    function setUserData(baseKey, value) {
        const key = getUserKey(baseKey);
        if (!key) return false;

        const data = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, data);
        return true;
    }

    /**
     * Remove user-specific data
     * @param {string} baseKey - Base key name
     * @returns {boolean} True if successful
     */
    function removeUserData(baseKey) {
        const key = getUserKey(baseKey);
        if (!key) return false;

        localStorage.removeItem(key);
        return true;
    }

    // =====================
    // UI Functions
    // =====================

    /**
     * Show user selection modal
     * @param {Function} onSelect - Callback when user is selected
     */
    function showUserSelectionModal(onSelect) {
        // Remove existing modal if any
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

        // Add styles if not already added
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

        // Focus on input if no users
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

        // Update footer
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
     * @returns {HTMLElement} User indicator element
     */
    function createUserIndicator() {
        const currentUser = getCurrentUser();

        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.className = 'user-indicator';
        indicator.innerHTML = `
            <span class="user-icon">👤</span>
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
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
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

            /* User Indicator Styles */
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

            /* Dark mode support */
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

            /* Responsive */
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
     * Shows modal if no user is selected
     * @param {Function} onUserReady - Callback when user is ready
     */
    function init(onUserReady) {
        addUserModalStyles();

        // Check if user is selected
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

    /**
     * Add user indicator to page
     */
    function addUserIndicatorToPage() {
        // Remove existing indicator
        const existing = document.getElementById('user-indicator');
        if (existing) existing.remove();

        const indicator = createUserIndicator();
        document.body.appendChild(indicator);

        // Click to show modal
        indicator.addEventListener('click', () => {
            showUserSelectionModal((userName) => {
                // Update indicator
                const nameEl = indicator.querySelector('.user-current-name');
                if (nameEl) {
                    nameEl.textContent = userName;
                }
                // Reload page to refresh data
                window.location.reload();
            });
        });
    }

    // Public API
    return {
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
