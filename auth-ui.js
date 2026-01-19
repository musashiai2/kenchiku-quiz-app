/**
 * Simple User Name UI Component
 * No authentication - just enter user name to start
 */

const AuthUI = (function() {
    let onUserReadyCallback = null;

    /**
     * Initialize - show user name input if needed
     */
    function init(onUserReady) {
        onUserReadyCallback = onUserReady;

        // Initialize Supabase
        if (typeof SupabaseService !== 'undefined') {
            SupabaseService.init();
        }

        // Check if user name is saved
        const savedUser = localStorage.getItem('quiz_current_user');
        if (savedUser) {
            selectUser(savedUser);
        } else {
            showUserSelectModal();
        }
    }

    /**
     * Select user and initialize
     */
    async function selectUser(userName) {
        localStorage.setItem('quiz_current_user', userName);

        // Register in Supabase if available
        if (typeof SupabaseService !== 'undefined' && SupabaseService.isReady()) {
            await SupabaseService.ensureUser(userName);
        }

        addUserIndicator(userName);

        if (onUserReadyCallback) {
            onUserReadyCallback(userName);
        }
    }

    /**
     * Show user selection modal
     */
    function showUserSelectModal() {
        const existing = document.getElementById('user-select-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'user-select-modal';
        modal.className = 'user-select-overlay';
        modal.innerHTML = `
            <div class="user-select-modal">
                <div class="user-select-header">
                    <h2>ユーザー名を入力</h2>
                    <p>名前を入力するだけで始められます</p>
                </div>
                <div class="user-select-form">
                    <input type="text" id="user-name-input" placeholder="例: 山田太郎" maxlength="20" autofocus>
                    <button id="start-btn" class="user-select-btn">始める</button>
                </div>
                <div class="user-select-note">
                    <p>学習データはクラウドに保存されます</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        addStyles();

        const input = document.getElementById('user-name-input');
        const btn = document.getElementById('start-btn');

        btn.addEventListener('click', () => submitUserName(input.value));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitUserName(input.value);
        });

        input.focus();
    }

    /**
     * Submit user name
     */
    function submitUserName(name) {
        const trimmed = name.trim();
        if (!trimmed) {
            alert('ユーザー名を入力してください');
            return;
        }

        const modal = document.getElementById('user-select-modal');
        if (modal) modal.remove();

        selectUser(trimmed);
    }

    /**
     * Add user indicator to page
     */
    function addUserIndicator(userName) {
        const existing = document.getElementById('user-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'user-indicator';
        indicator.className = 'user-indicator';
        indicator.innerHTML = `
            <span class="user-icon">👤</span>
            <span class="user-name">${escapeHtml(userName)}</span>
            <button class="user-change-btn" title="ユーザー切替">▼</button>
        `;

        document.body.appendChild(indicator);

        indicator.addEventListener('click', () => {
            showUserSelectModal();
        });
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
                padding: 40px;
                max-width: 400px;
                width: 100%;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: modalIn 0.3s ease;
            }

            @keyframes modalIn {
                from { opacity: 0; transform: translateY(-20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .user-select-header h2 {
                color: var(--primary-color, #2563eb);
                font-size: 1.5rem;
                margin-bottom: 8px;
            }

            .user-select-header p {
                color: var(--text-light, #64748b);
                font-size: 0.9rem;
                margin-bottom: 24px;
            }

            .user-select-form {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .user-select-form input {
                padding: 16px 20px;
                border: 2px solid var(--border-color, #e2e8f0);
                border-radius: 12px;
                font-size: 1.1rem;
                text-align: center;
                background: var(--bg-color, #f8fafc);
                color: var(--text-color, #1e293b);
                transition: border-color 0.2s;
            }

            .user-select-form input:focus {
                outline: none;
                border-color: var(--primary-color, #2563eb);
            }

            .user-select-btn {
                padding: 16px 32px;
                background: linear-gradient(135deg, var(--primary-color, #2563eb), #8b5cf6);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .user-select-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
            }

            .user-select-note {
                margin-top: 20px;
            }

            .user-select-note p {
                color: var(--text-light, #64748b);
                font-size: 0.8rem;
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

            .user-name {
                font-weight: 600;
                color: var(--text-color, #1e293b);
                max-width: 120px;
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
                padding: 2px 4px;
            }

            body.dark-mode .user-select-modal {
                background: var(--card-bg, #1e293b);
            }

            body.dark-mode .user-select-form input {
                background: var(--bg-color, #0f172a);
                border-color: var(--border-color, #334155);
                color: var(--text-color, #f1f5f9);
            }

            body.dark-mode .user-indicator {
                background: var(--card-bg, #1e293b);
            }

            @media (max-width: 480px) {
                .user-select-modal {
                    padding: 30px 20px;
                }

                .user-indicator {
                    top: 10px;
                    left: 10px;
                    padding: 8px 12px;
                }

                .user-name {
                    max-width: 80px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // Public API
    return {
        init,
        showUserSelectModal,
        selectUser
    };
})();

if (typeof window !== 'undefined') {
    window.AuthUI = AuthUI;
}
