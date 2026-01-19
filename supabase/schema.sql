-- =====================================================
-- Supabase Database Schema for Quiz App
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Users table (extends Supabase auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    display_name TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- =====================================================
-- Quiz Results table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.quiz_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    app_id TEXT NOT NULL, -- r1, r2, r3, r4, r5, r6, r7, takken, kenchikushi, keirishi, mental
    mode TEXT NOT NULL, -- all, am, pm, random, wrong_review, bookmark, mock_am, mock_pm
    total_questions INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    score_rate DECIMAL(5,2) NOT NULL,
    time_spent INTEGER, -- seconds
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own results" ON public.quiz_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own results" ON public.quiz_results
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all results" ON public.quiz_results
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_app ON public.quiz_results(user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed_at ON public.quiz_results(completed_at DESC);

-- =====================================================
-- Wrong Answers table (tracking mistakes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wrong_answers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    wrong_count INTEGER DEFAULT 1,
    last_wrong_at TIMESTAMPTZ DEFAULT NOW(),
    last_correct_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, app_id, question_id)
);

ALTER TABLE public.wrong_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wrong answers" ON public.wrong_answers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wrong answers" ON public.wrong_answers
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

CREATE INDEX IF NOT EXISTS idx_wrong_answers_user_app ON public.wrong_answers(user_id, app_id);

-- =====================================================
-- Bookmarks table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, app_id, question_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_app ON public.bookmarks(user_id, app_id);

-- =====================================================
-- Adaptive Learning table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.adaptive_learning (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    app_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    consecutive_correct INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    last_answered_at TIMESTAMPTZ,
    mastered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, app_id, question_id)
);

ALTER TABLE public.adaptive_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own adaptive learning" ON public.adaptive_learning
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all adaptive learning" ON public.adaptive_learning
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

CREATE INDEX IF NOT EXISTS idx_adaptive_learning_user_app ON public.adaptive_learning(user_id, app_id);

-- =====================================================
-- Study Time table (daily study tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.study_time (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    app_id TEXT NOT NULL,
    study_date DATE NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, app_id, study_date)
);

ALTER TABLE public.study_time ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own study time" ON public.study_time
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all study time" ON public.study_time
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

CREATE INDEX IF NOT EXISTS idx_study_time_user_date ON public.study_time(user_id, study_date DESC);

-- =====================================================
-- Achievements table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.achievements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    achievement_id TEXT NOT NULL, -- first_quiz, streak_7days, perfect_score, etc.
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own achievements" ON public.achievements
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_wrong_answers_updated_at
    BEFORE UPDATE ON public.wrong_answers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_adaptive_learning_updated_at
    BEFORE UPDATE ON public.adaptive_learning
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_study_time_updated_at
    BEFORE UPDATE ON public.study_time
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Views for Admin Dashboard
-- =====================================================

-- User statistics view
CREATE OR REPLACE VIEW public.user_statistics AS
SELECT
    p.id AS user_id,
    p.display_name,
    p.created_at AS joined_at,
    COUNT(DISTINCT qr.id) AS total_quizzes,
    COALESCE(SUM(qr.total_questions), 0) AS total_questions_answered,
    COALESCE(SUM(qr.correct_count), 0) AS total_correct,
    CASE
        WHEN SUM(qr.total_questions) > 0
        THEN ROUND(SUM(qr.correct_count)::DECIMAL / SUM(qr.total_questions) * 100, 2)
        ELSE 0
    END AS overall_accuracy,
    MAX(qr.completed_at) AS last_active
FROM public.profiles p
LEFT JOIN public.quiz_results qr ON p.id = qr.user_id
GROUP BY p.id, p.display_name, p.created_at;

-- App-wise statistics view
CREATE OR REPLACE VIEW public.app_statistics AS
SELECT
    qr.user_id,
    qr.app_id,
    COUNT(*) AS quiz_count,
    SUM(qr.total_questions) AS total_questions,
    SUM(qr.correct_count) AS total_correct,
    ROUND(AVG(qr.score_rate), 2) AS avg_score_rate,
    MAX(qr.completed_at) AS last_quiz_at
FROM public.quiz_results qr
GROUP BY qr.user_id, qr.app_id;

-- Daily activity view
CREATE OR REPLACE VIEW public.daily_activity AS
SELECT
    st.user_id,
    st.study_date,
    SUM(st.duration_seconds) AS total_seconds,
    SUM(st.questions_answered) AS total_questions,
    STRING_AGG(DISTINCT st.app_id, ', ') AS apps_studied
FROM public.study_time st
GROUP BY st.user_id, st.study_date
ORDER BY st.study_date DESC;
