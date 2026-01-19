/**
 * Supabase Service (Simple User Name Based)
 * No authentication - just user name for identification
 */

const SupabaseService = (function() {
    let client = null;
    let currentUserName = null;

    // =====================================================
    // Initialization
    // =====================================================

    function init() {
        if (!isSupabaseConfigured()) {
            console.warn('Supabase is not configured. Running in offline mode.');
            return false;
        }
        client = getSupabaseClient();
        return true;
    }

    function isReady() {
        return client !== null;
    }

    // =====================================================
    // User Management (Simple)
    // =====================================================

    /**
     * Set current user name
     */
    function setCurrentUser(userName) {
        currentUserName = userName;
    }

    /**
     * Get current user name
     */
    function getCurrentUser() {
        return currentUserName;
    }

    /**
     * Register or get existing user
     */
    async function ensureUser(userName) {
        if (!client) return { error: { message: 'Not initialized' } };

        // Check if user exists
        const { data: existing } = await client
            .from('users')
            .select('user_name')
            .eq('user_name', userName)
            .single();

        if (existing) {
            currentUserName = userName;
            return { data: existing, isNew: false };
        }

        // Create new user
        const { data, error } = await client
            .from('users')
            .insert({ user_name: userName })
            .select()
            .single();

        if (!error) {
            currentUserName = userName;
        }

        return { data, error, isNew: true };
    }

    /**
     * Get all users
     */
    async function getAllUsers() {
        if (!client) return { data: [] };

        const { data, error } = await client
            .from('user_statistics')
            .select('*')
            .order('last_active', { ascending: false, nullsFirst: false });

        return { data: data || [], error };
    }

    /**
     * Check if user is admin
     */
    async function isAdmin(userName) {
        if (!client) return false;

        const { data } = await client
            .from('users')
            .select('is_admin')
            .eq('user_name', userName)
            .single();

        return data?.is_admin || false;
    }

    /**
     * Get all user names (simple list)
     */
    async function getUserList() {
        if (!client) return { data: [] };

        const { data, error } = await client
            .from('users')
            .select('user_name')
            .order('created_at', { ascending: true });

        return { data: data ? data.map(u => u.user_name) : [], error };
    }

    /**
     * Delete user and all related data
     */
    async function deleteUser(userName) {
        if (!client) return { error: { message: 'Not initialized' } };

        const { error } = await client
            .from('users')
            .delete()
            .eq('user_name', userName);

        return { error };
    }

    // =====================================================
    // Quiz Results
    // =====================================================

    async function saveQuizResult(appId, mode, totalQuestions, correctCount, timeSpent = null) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const scoreRate = (correctCount / totalQuestions * 100).toFixed(2);

        const { data, error } = await client
            .from('quiz_results')
            .insert({
                user_name: currentUserName,
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

    async function getQuizHistory(appId, limit = 10) {
        if (!client || !currentUserName) return { data: [] };

        const { data, error } = await client
            .from('quiz_results')
            .select('*')
            .eq('user_name', currentUserName)
            .eq('app_id', appId)
            .order('completed_at', { ascending: false })
            .limit(limit);

        return { data: data || [], error };
    }

    async function getOverallStats(appId = null) {
        if (!client || !currentUserName) return { data: null };

        let query = client
            .from('quiz_results')
            .select('total_questions, correct_count')
            .eq('user_name', currentUserName);

        if (appId) {
            query = query.eq('app_id', appId);
        }

        const { data, error } = await query;

        if (!data || data.length === 0) {
            return {
                data: { totalQuizzes: 0, totalQuestions: 0, totalCorrect: 0, overallRate: 0 }
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

    async function saveWrongAnswer(appId, questionId) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const { data: existing } = await client
            .from('wrong_answers')
            .select('id, wrong_count')
            .eq('user_name', currentUserName)
            .eq('app_id', appId)
            .eq('question_id', questionId)
            .single();

        if (existing) {
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
            const { data, error } = await client
                .from('wrong_answers')
                .insert({
                    user_name: currentUserName,
                    app_id: appId,
                    question_id: questionId
                })
                .select()
                .single();
            return { data, error };
        }
    }

    async function recordCorrectAnswer(appId, questionId) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const { data: existing } = await client
            .from('wrong_answers')
            .select('id, wrong_count')
            .eq('user_name', currentUserName)
            .eq('app_id', appId)
            .eq('question_id', questionId)
            .single();

        if (!existing) return { data: null };

        if (existing.wrong_count <= 1) {
            await client.from('wrong_answers').delete().eq('id', existing.id);
            return { data: null };
        } else {
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

    async function getWrongAnswers(appId) {
        if (!client || !currentUserName) return { data: {} };

        const { data, error } = await client
            .from('wrong_answers')
            .select('question_id, wrong_count, last_wrong_at, last_correct_at')
            .eq('user_name', currentUserName)
            .eq('app_id', appId);

        if (!data) return { data: {}, error };

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

    // =====================================================
    // Bookmarks
    // =====================================================

    async function addBookmark(appId, questionId) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const { data, error } = await client
            .from('bookmarks')
            .upsert({
                user_name: currentUserName,
                app_id: appId,
                question_id: questionId
            }, { onConflict: 'user_name,app_id,question_id' })
            .select()
            .single();

        return { data, error };
    }

    async function removeBookmark(appId, questionId) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const { error } = await client
            .from('bookmarks')
            .delete()
            .eq('user_name', currentUserName)
            .eq('app_id', appId)
            .eq('question_id', questionId);

        return { error };
    }

    async function getBookmarks(appId) {
        if (!client || !currentUserName) return { data: [] };

        const { data, error } = await client
            .from('bookmarks')
            .select('question_id')
            .eq('user_name', currentUserName)
            .eq('app_id', appId);

        return { data: data ? data.map(b => b.question_id) : [], error };
    }

    // =====================================================
    // Adaptive Learning
    // =====================================================

    async function updateAdaptiveLearning(appId, questionId, isCorrect) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const { data: existing } = await client
            .from('adaptive_learning')
            .select('*')
            .eq('user_name', currentUserName)
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
            const { data, error } = await client
                .from('adaptive_learning')
                .insert({
                    user_name: currentUserName,
                    app_id: appId,
                    question_id: questionId,
                    consecutive_correct: isCorrect ? 1 : 0,
                    total_correct: isCorrect ? 1 : 0,
                    total_attempts: 1,
                    last_answered_at: now
                })
                .select()
                .single();

            return { data, error };
        }
    }

    async function getAdaptiveLearning(appId) {
        if (!client || !currentUserName) return { data: {} };

        const { data, error } = await client
            .from('adaptive_learning')
            .select('*')
            .eq('user_name', currentUserName)
            .eq('app_id', appId);

        if (!data) return { data: {}, error };

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

    async function recordStudyTime(appId, durationSeconds, questionsAnswered) {
        if (!client || !currentUserName) return { error: { message: 'Not ready' } };

        const today = new Date().toISOString().split('T')[0];

        const { data: existing } = await client
            .from('study_time')
            .select('id, duration_seconds, questions_answered')
            .eq('user_name', currentUserName)
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
                    user_name: currentUserName,
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

    async function getStudyTimeHistory(days = 84) {
        if (!client || !currentUserName) return { data: [] };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await client
            .from('study_time')
            .select('study_date, duration_seconds, questions_answered, app_id')
            .eq('user_name', currentUserName)
            .gte('study_date', startDate.toISOString().split('T')[0])
            .order('study_date', { ascending: false });

        return { data: data || [], error };
    }

    // =====================================================
    // Admin Functions
    // =====================================================

    async function getUserDetail(userName) {
        if (!client) return { data: null };

        const { data: appStats } = await client
            .from('app_statistics')
            .select('*')
            .eq('user_name', userName);

        return {
            data: {
                userName,
                appStats: appStats || []
            }
        };
    }

    // =====================================================
    // Sync Utilities
    // =====================================================

    async function syncLocalToSupabase(appId, localData) {
        if (!client || !currentUserName) return { success: false };

        const results = { success: true, errors: [] };

        try {
            // Sync wrong answers
            if (localData.wrongAnswers) {
                for (const [qId, data] of Object.entries(localData.wrongAnswers)) {
                    if (data.count > 0) {
                        await client.from('wrong_answers').upsert({
                            user_name: currentUserName,
                            app_id: appId,
                            question_id: parseInt(qId),
                            wrong_count: data.count,
                            last_wrong_at: data.lastWrong
                        }, { onConflict: 'user_name,app_id,question_id' });
                    }
                }
            }

            // Sync bookmarks
            if (localData.bookmarks && localData.bookmarks.length > 0) {
                for (const qId of localData.bookmarks) {
                    await client.from('bookmarks').upsert({
                        user_name: currentUserName,
                        app_id: appId,
                        question_id: qId
                    }, { onConflict: 'user_name,app_id,question_id' });
                }
            }

            // Sync adaptive learning
            if (localData.adaptiveLearning) {
                for (const [qId, data] of Object.entries(localData.adaptiveLearning)) {
                    await client.from('adaptive_learning').upsert({
                        user_name: currentUserName,
                        app_id: appId,
                        question_id: parseInt(qId),
                        consecutive_correct: data.consecutiveCorrect || 0,
                        total_correct: data.totalCorrect || 0,
                        total_attempts: data.totalAttempts || 0,
                        last_answered_at: data.lastAnswered,
                        mastered_at: data.masteredAt
                    }, { onConflict: 'user_name,app_id,question_id' });
                }
            }

        } catch (e) {
            results.success = false;
            results.errors.push(e.message);
        }

        return results;
    }

    // Public API
    return {
        init,
        isReady,
        setCurrentUser,
        getCurrentUser,
        ensureUser,
        getAllUsers,
        getUserList,
        deleteUser,
        isAdmin,
        saveQuizResult,
        getQuizHistory,
        getOverallStats,
        saveWrongAnswer,
        recordCorrectAnswer,
        getWrongAnswers,
        addBookmark,
        removeBookmark,
        getBookmarks,
        updateAdaptiveLearning,
        getAdaptiveLearning,
        recordStudyTime,
        getStudyTimeHistory,
        getUserDetail,
        syncLocalToSupabase
    };
})();

if (typeof window !== 'undefined') {
    window.SupabaseService = SupabaseService;
}
