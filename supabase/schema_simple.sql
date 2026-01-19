-- =====================================================
-- Supabase Database Schema for Quiz App (Simple User Name Based)
-- No authentication required - just user name
-- =====================================================

-- Drop old tables if they exist (from previous schema)
DROP TABLE IF EXISTS public.achievements CASCADE;
DROP TABLE IF EXISTS public.study_time CASCADE;
DROP TABLE IF EXISTS public.adaptive_learning CASCADE;
DROP TABLE IF EXISTS public.bookmarks CASCADE;
DROP TABLE IF EXISTS public.wrong_answers CASCADE;
DROP TABLE IF EXISTS public.quiz_results CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop old views
DROP VIEW IF EXISTS public.user_statistics CASCADE;
DROP VIEW IF EXISTS public.app_statistics CASCADE;
DROP VIEW IF EXISTS public.daily_activity CASCADE;

-- =====================================================
-- Users table (simple user name based)
-- =====================================================
CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    user_name TEXT UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for simple access
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- Quiz Results table
-- =====================================================
CREATE TABLE public.quiz_results (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES public.users(user_name) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    score_rate DECIMAL(5,2) NOT NULL,
    time_spent INTEGER,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quiz_results DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_quiz_results_user ON public.quiz_results(user_name, app_id);

-- =====================================================
-- Wrong Answers table
-- =====================================================
CREATE TABLE public.wrong_answers (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES public.users(user_name) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    wrong_count INTEGER DEFAULT 1,
    last_wrong_at TIMESTAMPTZ DEFAULT NOW(),
    last_correct_at TIMESTAMPTZ,
    UNIQUE(user_name, app_id, question_id)
);

ALTER TABLE public.wrong_answers DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wrong_answers_user ON public.wrong_answers(user_name, app_id);

-- =====================================================
-- Bookmarks table
-- =====================================================
CREATE TABLE public.bookmarks (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES public.users(user_name) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_name, app_id, question_id)
);

ALTER TABLE public.bookmarks DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_name, app_id);

-- =====================================================
-- Adaptive Learning table
-- =====================================================
CREATE TABLE public.adaptive_learning (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES public.users(user_name) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    consecutive_correct INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    last_answered_at TIMESTAMPTZ,
    mastered_at TIMESTAMPTZ,
    UNIQUE(user_name, app_id, question_id)
);

ALTER TABLE public.adaptive_learning DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_adaptive_user ON public.adaptive_learning(user_name, app_id);

-- =====================================================
-- Study Time table
-- =====================================================
CREATE TABLE public.study_time (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES public.users(user_name) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    study_date DATE NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    UNIQUE(user_name, app_id, study_date)
);

ALTER TABLE public.study_time DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_study_time_user ON public.study_time(user_name, study_date);

-- =====================================================
-- Views for Admin Dashboard
-- =====================================================

CREATE VIEW public.user_statistics AS
SELECT
    u.user_name,
    u.is_admin,
    u.created_at AS joined_at,
    COUNT(DISTINCT qr.id) AS total_quizzes,
    COALESCE(SUM(qr.total_questions), 0) AS total_questions_answered,
    COALESCE(SUM(qr.correct_count), 0) AS total_correct,
    CASE
        WHEN SUM(qr.total_questions) > 0
        THEN ROUND(SUM(qr.correct_count)::DECIMAL / SUM(qr.total_questions) * 100, 2)
        ELSE 0
    END AS overall_accuracy,
    MAX(qr.completed_at) AS last_active
FROM public.users u
LEFT JOIN public.quiz_results qr ON u.user_name = qr.user_name
GROUP BY u.user_name, u.is_admin, u.created_at;

CREATE VIEW public.app_statistics AS
SELECT
    qr.user_name,
    qr.app_id,
    COUNT(*) AS quiz_count,
    SUM(qr.total_questions) AS total_questions,
    SUM(qr.correct_count) AS total_correct,
    ROUND(AVG(qr.score_rate), 2) AS avg_score_rate,
    MAX(qr.completed_at) AS last_quiz_at
FROM public.quiz_results qr
GROUP BY qr.user_name, qr.app_id;
