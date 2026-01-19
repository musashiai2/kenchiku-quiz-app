/**
 * Supabase Service
 * Handles all Supabase operations: authentication and data sync
 */

const SupabaseService = (function() {
    let client = null;
    let currentUser = null;
    let authStateListeners = [];

    // =====================================================
    // Initialization
    // =====================================================

    /**
     * Initialize the service
     */
    function init() {
        if (!isSupabaseConfigured()) {
            console.warn('Supabase is not configured. Running in offline mode.');
            return false;
        }

        client = getSupabaseClient();

        // Listen for auth state changes
        client.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            authStateListeners.forEach(listener => listener(event, session));
        });

        return true;
    }

    /**
     * Add auth state listener
     */
    function onAuthStateChange(callback) {
        authStateListeners.push(callback);
    }

    // =====================================================
    // Authentication
    // =====================================================

    /**
     * Sign up with email and password
     */
    async function signUp(email, password, displayName) {
        if (!client) return { error: { message: 'Supabase not initialized' } };

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName
                }
            }
        });

        return { data, error };
    }

    /**
     * Sign in with email and password
     */
    async function signIn(email, password) {
        if (!client) return { error: { message: 'Supabase not initialized' } };

        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        return { data, error };
    }

    /**
     * Sign out
     */
    async function signOut() {
        if (!client) return { error: { message: 'Supabase not initialized' } };

        const { error } = await client.auth.signOut();
        currentUser = null;
        return { error };
    }

    /**
     * Get current user
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Get current session
     */
    async function getSession() {
        if (!client) return { data: { session: null } };

        const { data, error } = await client.auth.getSession();
        if (data?.session) {
            currentUser = data.session.user;
        }
        return { data, error };
    }

    /**
     * Get user profile
     */
    async function getProfile() {
        if (!client || !currentUser) return { data: null };

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        return { data, error };
    }

    /**
     * Update user profile
     */
    async function updateProfile(updates) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const { data, error } = await client
            .from('profiles')
            .update(updates)
            .eq('id', currentUser.id)
            .select()
            .single();

        return { data, error };
    }

    // =====================================================
    // Quiz Results
    // =====================================================

    /**
     * Save quiz result
     */
    async function saveQuizResult(appId, mode, totalQuestions, correctCount, timeSpent = null) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const scoreRate = (correctCount / totalQuestions * 100).toFixed(2);

        const { data, error } = await client
            .from('quiz_results')
            .insert({
                user_id: currentUser.id,
                app_id: appId,
                mode: mode,
                total_questions: totalQuestions,
                correct_count: correctCount,
                score_rate: scoreRate,
                time_spent: timeSpent
            })
            .select()
            .single();

        return { data, error };
    }

    /**
     * Get quiz history for an app
     */
    async function getQuizHistory(appId, limit = 10) {
        if (!client || !currentUser) return { data: [] };

        const { data, error } = await client
            .from('quiz_results')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .order('completed_at', { ascending: false })
            .limit(limit);

        return { data: data || [], error };
    }

    /**
     * Get overall statistics
     */
    async function getOverallStats(appId = null) {
        if (!client || !currentUser) return { data: null };

        let query = client
            .from('quiz_results')
            .select('total_questions, correct_count')
            .eq('user_id', currentUser.id);

        if (appId) {
            query = query.eq('app_id', appId);
        }

        const { data, error } = await query;

        if (!data || data.length === 0) {
            return {
                data: {
                    totalQuizzes: 0,
                    totalQuestions: 0,
                    totalCorrect: 0,
                    overallRate: 0
                }
            };
        }

        const totalQuestions = data.reduce((sum, r) => sum + r.total_questions, 0);
        const totalCorrect = data.reduce((sum, r) => sum + r.correct_count, 0);

        return {
            data: {
                totalQuizzes: data.length,
                totalQuestions,
                totalCorrect,
                overallRate: totalQuestions > 0 ? (totalCorrect / totalQuestions * 100).toFixed(1) : 0
            },
            error
        };
    }

    // =====================================================
    // Wrong Answers
    // =====================================================

    /**
     * Save wrong answer
     */
    async function saveWrongAnswer(appId, questionId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        // Check if already exists
        const { data: existing } = await client
            .from('wrong_answers')
            .select('id, wrong_count')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .eq('question_id', questionId)
            .single();

        if (existing) {
            // Update count
            const { data, error } = await client
                .from('wrong_answers')
                .update({
                    wrong_count: existing.wrong_count + 1,
                    last_wrong_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            return { data, error };
        } else {
            // Insert new
            const { data, error } = await client
                .from('wrong_answers')
                .insert({
                    user_id: currentUser.id,
                    app_id: appId,
                    question_id: questionId,
                    wrong_count: 1,
                    last_wrong_at: new Date().toISOString()
                })
                .select()
                .single();

            return { data, error };
        }
    }

    /**
     * Record correct answer (decrease wrong count)
     */
    async function recordCorrectAnswer(appId, questionId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const { data: existing } = await client
            .from('wrong_answers')
            .select('id, wrong_count')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .eq('question_id', questionId)
            .single();

        if (!existing) return { data: null };

        if (existing.wrong_count <= 1) {
            // Delete if count reaches 0
            const { error } = await client
                .from('wrong_answers')
                .delete()
                .eq('id', existing.id);

            return { data: null, error };
        } else {
            // Decrease count
            const { data, error } = await client
                .from('wrong_answers')
                .update({
                    wrong_count: existing.wrong_count - 1,
                    last_correct_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            return { data, error };
        }
    }

    /**
     * Get all wrong answers for an app
     */
    async function getWrongAnswers(appId) {
        if (!client || !currentUser) return { data: {} };

        const { data, error } = await client
            .from('wrong_answers')
            .select('question_id, wrong_count, last_wrong_at, last_correct_at')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId);

        if (!data) return { data: {}, error };

        // Convert to object format matching LocalStorage structure
        const wrongAnswers = {};
        data.forEach(item => {
            wrongAnswers[item.question_id] = {
                count: item.wrong_count,
                lastWrong: item.last_wrong_at,
                lastCorrect: item.last_correct_at
            };
        });

        return { data: wrongAnswers, error };
    }

    /**
     * Clear wrong answers
     */
    async function clearWrongAnswers(appId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const { error } = await client
            .from('wrong_answers')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('app_id', appId);

        return { error };
    }

    // =====================================================
    // Bookmarks
    // =====================================================

    /**
     * Add bookmark
     */
    async function addBookmark(appId, questionId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const { data, error } = await client
            .from('bookmarks')
            .insert({
                user_id: currentUser.id,
                app_id: appId,
                question_id: questionId
            })
            .select()
            .single();

        return { data, error };
    }

    /**
     * Remove bookmark
     */
    async function removeBookmark(appId, questionId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const { error } = await client
            .from('bookmarks')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .eq('question_id', questionId);

        return { error };
    }

    /**
     * Get all bookmarks for an app
     */
    async function getBookmarks(appId) {
        if (!client || !currentUser) return { data: [] };

        const { data, error } = await client
            .from('bookmarks')
            .select('question_id')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId);

        if (!data) return { data: [], error };

        return { data: data.map(b => b.question_id), error };
    }

    // =====================================================
    // Adaptive Learning
    // =====================================================

    /**
     * Update adaptive learning data
     */
    async function updateAdaptiveLearning(appId, questionId, isCorrect) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        // Get existing data
        const { data: existing } = await client
            .from('adaptive_learning')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .eq('question_id', questionId)
            .single();

        const now = new Date().toISOString();

        if (existing) {
            const updates = {
                total_attempts: existing.total_attempts + 1,
                last_answered_at: now
            };

            if (isCorrect) {
                updates.consecutive_correct = existing.consecutive_correct + 1;
                updates.total_correct = existing.total_correct + 1;

                if (updates.consecutive_correct >= 3) {
                    updates.mastered_at = now;
                }
            } else {
                updates.consecutive_correct = 0;
                updates.mastered_at = null;
            }

            const { data, error } = await client
                .from('adaptive_learning')
                .update(updates)
                .eq('id', existing.id)
                .select()
                .single();

            return { data, error };
        } else {
            // Insert new
            const { data, error } = await client
                .from('adaptive_learning')
                .insert({
                    user_id: currentUser.id,
                    app_id: appId,
                    question_id: questionId,
                    consecutive_correct: isCorrect ? 1 : 0,
                    total_correct: isCorrect ? 1 : 0,
                    total_attempts: 1,
                    last_answered_at: now,
                    mastered_at: null
                })
                .select()
                .single();

            return { data, error };
        }
    }

    /**
     * Get adaptive learning data for an app
     */
    async function getAdaptiveLearning(appId) {
        if (!client || !currentUser) return { data: {} };

        const { data, error } = await client
            .from('adaptive_learning')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId);

        if (!data) return { data: {}, error };

        // Convert to object format
        const adaptive = {};
        data.forEach(item => {
            adaptive[item.question_id] = {
                consecutiveCorrect: item.consecutive_correct,
                totalCorrect: item.total_correct,
                totalAttempts: item.total_attempts,
                lastAnswered: item.last_answered_at,
                masteredAt: item.mastered_at
            };
        });

        return { data: adaptive, error };
    }

    // =====================================================
    // Study Time
    // =====================================================

    /**
     * Record study time
     */
    async function recordStudyTime(appId, durationSeconds, questionsAnswered) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const today = new Date().toISOString().split('T')[0];

        // Check if record exists for today
        const { data: existing } = await client
            .from('study_time')
            .select('id, duration_seconds, questions_answered')
            .eq('user_id', currentUser.id)
            .eq('app_id', appId)
            .eq('study_date', today)
            .single();

        if (existing) {
            const { data, error } = await client
                .from('study_time')
                .update({
                    duration_seconds: existing.duration_seconds + durationSeconds,
                    questions_answered: existing.questions_answered + questionsAnswered
                })
                .eq('id', existing.id)
                .select()
                .single();

            return { data, error };
        } else {
            const { data, error } = await client
                .from('study_time')
                .insert({
                    user_id: currentUser.id,
                    app_id: appId,
                    study_date: today,
                    duration_seconds: durationSeconds,
                    questions_answered: questionsAnswered
                })
                .select()
                .single();

            return { data, error };
        }
    }

    /**
     * Get study time history
     */
    async function getStudyTimeHistory(days = 84) {
        if (!client || !currentUser) return { data: [] };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await client
            .from('study_time')
            .select('study_date, duration_seconds, questions_answered, app_id')
            .eq('user_id', currentUser.id)
            .gte('study_date', startDate.toISOString().split('T')[0])
            .order('study_date', { ascending: false });

        return { data: data || [], error };
    }

    // =====================================================
    // Achievements
    // =====================================================

    /**
     * Unlock achievement
     */
    async function unlockAchievement(achievementId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        // Check if already unlocked
        const { data: existing } = await client
            .from('achievements')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('achievement_id', achievementId)
            .single();

        if (existing) return { data: existing, error: null, alreadyUnlocked: true };

        const { data, error } = await client
            .from('achievements')
            .insert({
                user_id: currentUser.id,
                achievement_id: achievementId
            })
            .select()
            .single();

        return { data, error, alreadyUnlocked: false };
    }

    /**
     * Get all achievements
     */
    async function getAchievements() {
        if (!client || !currentUser) return { data: [] };

        const { data, error } = await client
            .from('achievements')
            .select('achievement_id, unlocked_at')
            .eq('user_id', currentUser.id);

        return { data: data || [], error };
    }

    // =====================================================
    // Sync Utilities
    // =====================================================

    /**
     * Sync local data to Supabase
     * Used when user logs in to upload existing LocalStorage data
     */
    async function syncLocalToSupabase(appId, localData) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        const results = { success: true, errors: [] };

        try {
            // Sync wrong answers
            if (localData.wrongAnswers) {
                for (const [qId, data] of Object.entries(localData.wrongAnswers)) {
                    const { error } = await client
                        .from('wrong_answers')
                        .upsert({
                            user_id: currentUser.id,
                            app_id: appId,
                            question_id: parseInt(qId),
                            wrong_count: data.count,
                            last_wrong_at: data.lastWrong,
                            last_correct_at: data.lastCorrect
                        }, { onConflict: 'user_id,app_id,question_id' });

                    if (error) results.errors.push({ type: 'wrongAnswers', error });
                }
            }

            // Sync bookmarks
            if (localData.bookmarks && localData.bookmarks.length > 0) {
                const bookmarkInserts = localData.bookmarks.map(qId => ({
                    user_id: currentUser.id,
                    app_id: appId,
                    question_id: qId
                }));

                const { error } = await client
                    .from('bookmarks')
                    .upsert(bookmarkInserts, { onConflict: 'user_id,app_id,question_id' });

                if (error) results.errors.push({ type: 'bookmarks', error });
            }

            // Sync adaptive learning
            if (localData.adaptiveLearning) {
                for (const [qId, data] of Object.entries(localData.adaptiveLearning)) {
                    const { error } = await client
                        .from('adaptive_learning')
                        .upsert({
                            user_id: currentUser.id,
                            app_id: appId,
                            question_id: parseInt(qId),
                            consecutive_correct: data.consecutiveCorrect || 0,
                            total_correct: data.totalCorrect || 0,
                            total_attempts: data.totalAttempts || 0,
                            last_answered_at: data.lastAnswered,
                            mastered_at: data.masteredAt
                        }, { onConflict: 'user_id,app_id,question_id' });

                    if (error) results.errors.push({ type: 'adaptiveLearning', error });
                }
            }

            // Sync quiz history
            if (localData.history && localData.history.length > 0) {
                for (const hist of localData.history) {
                    const { error } = await client
                        .from('quiz_results')
                        .insert({
                            user_id: currentUser.id,
                            app_id: appId,
                            mode: hist.mode || 'unknown',
                            total_questions: hist.total || 0,
                            correct_count: hist.correct || 0,
                            score_rate: hist.rate || 0,
                            time_spent: hist.timeSpent || null,
                            completed_at: hist.date || new Date().toISOString()
                        });

                    if (error && error.code !== '23505') { // Ignore duplicates
                        results.errors.push({ type: 'history', error });
                    }
                }
            }

            results.success = results.errors.length === 0;
        } catch (e) {
            results.success = false;
            results.errors.push({ type: 'general', error: e.message });
        }

        return results;
    }

    /**
     * Download cloud data to local storage
     */
    async function downloadToLocal(appId) {
        if (!client || !currentUser) return { error: { message: 'Not authenticated' } };

        try {
            const [wrongAnswers, bookmarks, adaptive, history, stats] = await Promise.all([
                getWrongAnswers(appId),
                getBookmarks(appId),
                getAdaptiveLearning(appId),
                getQuizHistory(appId, 100),
                getOverallStats(appId)
            ]);

            return {
                data: {
                    wrongAnswers: wrongAnswers.data,
                    bookmarks: bookmarks.data,
                    adaptiveLearning: adaptive.data,
                    history: history.data,
                    stats: stats.data
                }
            };
        } catch (e) {
            return { error: { message: e.message } };
        }
    }

    // =====================================================
    // Admin Functions (for admin users only)
    // =====================================================

    /**
     * Get all users (admin only)
     */
    async function getAllUsers() {
        if (!client || !currentUser) return { data: [] };

        const { data, error } = await client
            .from('user_statistics')
            .select('*')
            .order('last_active', { ascending: false, nullsFirst: false });

        return { data: data || [], error };
    }

    /**
     * Get user detail (admin only)
     */
    async function getUserDetail(userId) {
        if (!client || !currentUser) return { data: null };

        const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const { data: appStats } = await client
            .from('app_statistics')
            .select('*')
            .eq('user_id', userId);

        const { data: recentActivity } = await client
            .from('daily_activity')
            .select('*')
            .eq('user_id', userId)
            .limit(30);

        return {
            data: {
                profile,
                appStats: appStats || [],
                recentActivity: recentActivity || []
            }
        };
    }

    // Public API
    return {
        init,
        onAuthStateChange,

        // Auth
        signUp,
        signIn,
        signOut,
        getCurrentUser,
        getSession,
        getProfile,
        updateProfile,

        // Quiz Results
        saveQuizResult,
        getQuizHistory,
        getOverallStats,

        // Wrong Answers
        saveWrongAnswer,
        recordCorrectAnswer,
        getWrongAnswers,
        clearWrongAnswers,

        // Bookmarks
        addBookmark,
        removeBookmark,
        getBookmarks,

        // Adaptive Learning
        updateAdaptiveLearning,
        getAdaptiveLearning,

        // Study Time
        recordStudyTime,
        getStudyTimeHistory,

        // Achievements
        unlockAchievement,
        getAchievements,

        // Sync
        syncLocalToSupabase,
        downloadToLocal,

        // Admin
        getAllUsers,
        getUserDetail
    };
})();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.SupabaseService = SupabaseService;
}
