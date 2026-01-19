/**
 * Simple User Management UI
 * Save, add, delete user names
 */

const AuthUI = (function() {
    const USERS_KEY = 'quiz_users';
    const CURRENT_USER_KEY = 'quiz_current_user';
    let onUserReadyCallback = null;

    /**
     * Get saved users list
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
     * Get current user
     */
    function getCurrentUser() {
        return localStorage.getItem(CURRENT_USER_KEY);
    }

    /**
     * Initialize
     */
    function init(onUserReady) {
        onUserReadyCallback = onUserReady;

        // Initialize Supabase
        if (typeof SupabaseService !== 'undefined') {
            SupabaseService.init();
        }

        // Check if user is selected
        const currentUser = getCurrentUser();
        const users = getUsers();

        if (currentUser && users.includes(currentUser)) {
            selectUser(currentUser);
        } else {
            showUserSelectModal();
        }
    }

    /**
     * Select user
     */
    async function selectUser(userName) {
        localStorage.setItem(CURRENT_USER_KEY, userName);

        // Register in Supabase
        if (typeof SupabaseService !== 'undefined' && SupabaseService.isReady()) {
            await SupabaseService.ensureUser(userName);
        }

        addUserIndicator(userName);

        if (onUserReadyCallback) {
            onUserReadyCallback(userName);
        }
    }

    /**
     * Add new user
     */
    function addUser(userName) {
        const trimmed = userName.trim();
        if (!trimmed) return { success: false, message: 'ユーザー名を入力してください' };

        const users = getUsers();
        if (users.includes(trimmed)) {
            return { success: false, message: 'このユーザー名は既に登録されています' };
        }

        users.push(trimmed);
        saveUsers(users);
        return { success: true };
    }

    /**
     * Delete user
     */
    function deleteUser(userName) {
        let users = getUsers();
        users = users.filter(u => u !== userName);
        saveUsers(users);

        // Clear current user if deleted
        if (getCurrentUser() === userName) {
            localStorage.removeItem(CURRENT_USER_KEY);
        }

        return { success: true };
    }

    /**
     * Show user selection modal
     */
    function showUserSelectModal() {
        const existing = document.getElementById('user-select-modal');
        if (existing) existing.remove();

        const users = getUsers();
        const currentUser = getCurrentUser();

        const modal = document.createElement('div');
        modal.id = 'user-select-modal';
        modal.className = 'user-select-overlay';
        modal.innerHTML = `
            <div class="user-select-modal">
                <div class="user-select-header">
                    <h2>ユーザーを選択</h2>
                    <p>学習データはユーザーごとに保存されます</p>
                </div>

                <div class="user-list" id="user-list">
                    ${users.length === 0
                        ? '<p class="no-users">ユーザーが登録されていません</p>'
                        : users.map(user => `
                            <div class="user-item ${user === currentUser ? 'current' : ''}" data-user="${escapeHtml(user)}">
                                <span class="user-item-name">${escapeHtml(user)}</span>
                                <button class="user-delete-btn" data-user="${escapeHtml(user)}" title="削除">×</button>
                            </div>
                        `).join('')
                    }
                </div>

                <div class="user-add-section">
                    <input type="text" id="new-user-input" placeholder="新しいユーザー名" maxlength="20">
                    <button id="add-user-btn" class="user-add-btn">追加</button>
                </div>

                ${users.length > 0 && currentUser ? `
                    <div class="user-modal-footer">
                        <button id="cancel-btn" class="user-cancel-btn">キャンセル</button>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);
        addStyles();

        // Event listeners
        const userList = document.getElementById('user-list');
        userList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.user-delete-btn');
            const userItem = e.target.closest('.user-item');

            if (deleteBtn) {
                e.stopPropagation();
                const userName = deleteBtn.dataset.user;
                if (confirm(`「${userName}」を削除しますか？`)) {
                    deleteUser(userName);
                    refreshUserList();
                }
            } else if (userItem) {
                const userName = userItem.dataset.user;
                modal.remove();
                selectUser(userName);
            }
        });

        const addBtn = document.getElementById('add-user-btn');
        const input = document.getElementById('new-user-input');

        addBtn.addEventListener('click', () => {
            const result = addUser(input.value);
            if (result.success) {
                input.value = '';
                refreshUserList();
            } else {
                alert(result.message);
            }
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => modal.remove());
        }

        input.focus();
    }

    /**
     * Refresh user list in modal
     */
    function refreshUserList() {
        const users = getUsers();
        const currentUser = getCurrentUser();
        const userList = document.getElementById('user-list');

        if (!userList) return;

        userList.innerHTML = users.length === 0
            ? '<p class="no-users">ユーザーが登録されていません</p>'
            : users.map(user => `
                <div class="user-item ${user === currentUser ? 'current' : ''}" data-user="${escapeHtml(user)}">
                    <span class="user-item-name">${escapeHtml(user)}</span>
                    <button class="user-delete-btn" data-user="${escapeHtml(user)}" title="削除">×</button>
                </div>
            `).join('');
    }

    /**
     * Add user indicator
     */
    function addUserIndicator(userName) {
        const existing = document.getElementById('user-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.className = 'user-indicator';
        indicator.innerHTML = `
            <span class="user-icon">👤</span>
            <span class="user-name-display">${escapeHtml(userName)}</span>
            <span class="user-change-icon">▼</span>
        `;

        document.body.appendChild(indicator);
        indicator.addEventListener('click', showUserSelectModal);
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
     * Add CSS styles
     */
    function addStyles() {
        if (document.getElementById('user-select-styles')) return;

        const style = document.createElement('style');
        style.id = 'user-select-styles';
        style.textContent = `
            .user-select-overlay {
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

            .user-select-modal {
                background: var(--card-bg, #ffffff);
                border-radius: 20px;
                padding: 30px;
                max-width: 400px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: modalIn 0.3s ease;
            }

            @keyframes modalIn {
                from { opacity: 0; transform: translateY(-20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .user-select-header {
                text-align: center;
                margin-bottom: 24px;
            }

            .user-select-header h2 {
                color: var(--primary-color, #2563eb);
                font-size: 1.4rem;
                margin-bottom: 8px;
            }

            .user-select-header p {
                color: var(--text-light, #64748b);
                font-size: 0.85rem;
            }

            .user-list {
                max-height: 250px;
                overflow-y: auto;
                margin-bottom: 20px;
            }

            .no-users {
                text-align: center;
                color: var(--text-light, #64748b);
                padding: 30px;
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
                transition: all 0.2s;
                border: 2px solid transparent;
            }

            .user-item:hover {
                background: var(--primary-color, #2563eb);
                color: white;
            }

            .user-item.current {
                border-color: var(--primary-color, #2563eb);
            }

            .user-item-name {
                font-weight: 500;
                font-size: 1rem;
            }

            .user-delete-btn {
                background: none;
                border: none;
                color: var(--text-light, #64748b);
                font-size: 1.3rem;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                transition: all 0.2s;
                line-height: 1;
            }

            .user-item:hover .user-delete-btn {
                color: rgba(255, 255, 255, 0.7);
            }

            .user-delete-btn:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444 !important;
            }

            .user-add-section {
                display: flex;
                gap: 10px;
            }

            .user-add-section input {
                flex: 1;
                padding: 14px 16px;
                border: 2px solid var(--border-color, #e2e8f0);
                border-radius: 12px;
                font-size: 1rem;
                background: var(--bg-color, #f8fafc);
                color: var(--text-color, #1e293b);
                transition: border-color 0.2s;
            }

            .user-add-section input:focus {
                outline: none;
                border-color: var(--primary-color, #2563eb);
            }

            .user-add-btn {
                padding: 14px 24px;
                background: linear-gradient(135deg, var(--primary-color, #2563eb), #8b5cf6);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .user-add-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
            }

            .user-modal-footer {
                margin-top: 16px;
                text-align: center;
            }

            .user-cancel-btn {
                padding: 12px 24px;
                background: var(--bg-color, #f1f5f9);
                color: var(--text-color, #1e293b);
                border: none;
                border-radius: 10px;
                font-size: 0.95rem;
                cursor: pointer;
                transition: all 0.2s;
            }

            .user-cancel-btn:hover {
                background: var(--border-color, #e2e8f0);
            }

            .user-indicator {
                position: fixed;
                top: 20px;
                left: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                background: var(--card-bg, #ffffff);
                border-radius: 30px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                z-index: 999;
                cursor: pointer;
                transition: all 0.2s;
            }

            .user-indicator:hover {
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
                transform: translateY(-2px);
            }

            .user-icon {
                font-size: 1.2rem;
            }

            .user-name-display {
                font-weight: 600;
                color: var(--text-color, #1e293b);
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .user-change-icon {
                color: var(--text-light, #64748b);
                font-size: 0.7rem;
            }

            body.dark-mode .user-select-modal {
                background: var(--card-bg, #1e293b);
            }

            body.dark-mode .user-add-section input {
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
                .user-select-modal {
                    padding: 24px 20px;
                }

                .user-indicator {
                    top: 10px;
                    left: 10px;
                    padding: 8px 12px;
                }

                .user-name-display {
                    max-width: 80px;
                }

                .user-add-section {
                    flex-direction: column;
                }

                .user-add-btn {
                    width: 100%;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // Public API
    return {
        init,
        getUsers,
        getCurrentUser,
        addUser,
        deleteUser,
        selectUser,
        showUserSelectModal
    };
})();

if (typeof window !== 'undefined') {
    window.AuthUI = AuthUI;
}
