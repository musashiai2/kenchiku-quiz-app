// アプリケーション状態
let currentQuestions = [];
let currentIndex = 0;
let correctCount = 0;
let userAnswers = [];
let studyMode = 'all';
let timerInterval = null;
let timeRemaining = 0;
let isTimerMode = false;
let selectedSession = null;
let isWrongReviewMode = false;  // 復習モードフラグ
let wrongAnswersData = {};      // 復習時の間違い履歴データ
let quizStartTime = null;       // 学習開始時間

// LocalStorage キー基底 (FP3級用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    wrongAnswers: 'wrong_fp3',
    stats: 'stats_fp3',
    bookmarks: 'bookmarks_fp3',
    history: 'history_fp3',
    categoryStats: 'category_stats_fp3',
    adaptiveLearning: 'adaptive_fp3',
    studyTime: 'quiz_study_time_fp3'
};

// 適応型学習の設定
const ADAPTIVE_CONFIG = {
    consecutiveCorrectToMaster: 3,  // 連続正解でマスター判定
    masterCooldownDays: 7,          // マスター後の出題抑制日数
    wrongPriorityWeight: 3,         // 間違い問題の優先度重み
    recentWrongBoost: 2,            // 最近間違えた問題のブースト
    recentWrongDays: 3              // 「最近」の定義（日数）
};

// ダークモードは共通設定
const DARK_MODE_KEY = 'quiz_dark_mode';

// 試験日カウントダウン用キー（FP3級）
const EXAM_DATE_KEY = 'exam_date_fp3';

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // ユーザー管理の初期化
    UserManager.init((userName) => {
        console.log('User ready:', userName);
        initializeApp();
        showScreen('start-screen');
    });
});

// アプリ初期化
function initializeApp() {
    const darkMode = localStorage.getItem(DARK_MODE_KEY) === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        updateDarkModeButton();
    }
    updateStatsDisplay();
    updateWrongCountDisplay();
    updateBookmarkCountDisplay();
    generateSessionButtons();
    updateCategoryStatsDisplay();
    initExamCountdown();
}

// =====================
// データ管理関数
// =====================

// 間違えた問題を取得
function getWrongAnswers() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.wrongAnswers, {});
}

// 間違えた問題を保存
function saveWrongAnswer(questionId) {
    const wrongAnswers = getWrongAnswers();
    if (!wrongAnswers[questionId]) {
        wrongAnswers[questionId] = { count: 0, lastWrong: null };
    }
    wrongAnswers[questionId].count++;
    wrongAnswers[questionId].lastWrong = new Date().toISOString();
    UserManager.setUserData(STORAGE_BASE_KEYS.wrongAnswers, wrongAnswers);

    // 適応型学習データを更新（間違い）
    updateAdaptiveLearning(questionId, false);
}

// 正解した問題を記録（間違い回数を減らす）
function recordCorrectAnswer(questionId) {
    const wrongAnswers = getWrongAnswers();
    if (wrongAnswers[questionId] && wrongAnswers[questionId].count > 0) {
        wrongAnswers[questionId].count--;
        wrongAnswers[questionId].lastCorrect = new Date().toISOString();
        if (wrongAnswers[questionId].count <= 0) {
            delete wrongAnswers[questionId];
        }
        UserManager.setUserData(STORAGE_BASE_KEYS.wrongAnswers, wrongAnswers);
    }

    // 適応型学習データを更新
    updateAdaptiveLearning(questionId, true);
}

// =====================
// 適応型学習システム
// =====================

// 適応型学習データを取得
function getAdaptiveLearning() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.adaptiveLearning, {});
}

// 適応型学習データを更新
function updateAdaptiveLearning(questionId, isCorrect) {
    const adaptive = getAdaptiveLearning();

    if (!adaptive[questionId]) {
        adaptive[questionId] = {
            consecutiveCorrect: 0,
            lastAnswered: null,
            masteredAt: null,
            totalCorrect: 0,
            totalAttempts: 0
        };
    }

    const data = adaptive[questionId];
    data.totalAttempts++;
    data.lastAnswered = new Date().toISOString();

    if (isCorrect) {
        data.consecutiveCorrect++;
        data.totalCorrect++;

        // 連続正解でマスター判定
        if (data.consecutiveCorrect >= ADAPTIVE_CONFIG.consecutiveCorrectToMaster) {
            data.masteredAt = new Date().toISOString();
        }
    } else {
        // 間違えたら連続正解リセット、マスター解除
        data.consecutiveCorrect = 0;
        data.masteredAt = null;
    }

    UserManager.setUserData(STORAGE_BASE_KEYS.adaptiveLearning, adaptive);
}

// 問題がマスター済みかチェック（クールダウン期間内）
function isQuestionMastered(questionId) {
    const adaptive = getAdaptiveLearning();
    const data = adaptive[questionId];

    if (!data || !data.masteredAt) return false;

    const masteredDate = new Date(data.masteredAt);
    const cooldownEnd = new Date(masteredDate);
    cooldownEnd.setDate(cooldownEnd.getDate() + ADAPTIVE_CONFIG.masterCooldownDays);

    return new Date() < cooldownEnd;
}

// 問題の優先度スコアを計算
function calculateQuestionPriority(question) {
    const wrongAnswers = getWrongAnswers();
    const adaptive = getAdaptiveLearning();
    const categoryStats = getCategoryStats();

    let score = 100; // ベーススコア

    const questionId = question.id;
    const wrongData = wrongAnswers[questionId];
    const adaptiveData = adaptive[questionId];
    const category = question.type || '未分類';
    const catStats = categoryStats[category];

    // 間違い回数による優先度アップ
    if (wrongData) {
        score += wrongData.count * ADAPTIVE_CONFIG.wrongPriorityWeight * 10;

        // 最近間違えた問題はさらにブースト
        if (wrongData.lastWrong) {
            const daysSinceWrong = (new Date() - new Date(wrongData.lastWrong)) / (1000 * 60 * 60 * 24);
            if (daysSinceWrong <= ADAPTIVE_CONFIG.recentWrongDays) {
                score += ADAPTIVE_CONFIG.recentWrongBoost * 20;
            }
        }
    }

    // 苦手分野の問題は優先度アップ
    if (catStats && catStats.total >= 3) {
        const accuracy = catStats.correct / catStats.total;
        if (accuracy < 0.5) {
            score += (0.5 - accuracy) * 50;
        }
    }

    // マスター済みの問題は優先度ダウン
    if (isQuestionMastered(questionId)) {
        score -= 80;
    }

    // 連続正解中の問題は少し優先度ダウン
    if (adaptiveData && adaptiveData.consecutiveCorrect > 0) {
        score -= adaptiveData.consecutiveCorrect * 10;
    }

    // 未回答の問題は少し優先度アップ
    if (!adaptiveData || adaptiveData.totalAttempts === 0) {
        score += 20;
    }

    return score;
}

// スマート問題選択（適応型学習ベース）
function selectQuestionsAdaptively(questions, count) {
    // 優先度スコアを計算
    const scoredQuestions = questions.map(q => ({
        question: q,
        score: calculateQuestionPriority(q),
        random: Math.random() // ランダム要素を追加
    }));

    // スコアでソート（高い順）、同点はランダム
    scoredQuestions.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) < 10) {
            return a.random - b.random;
        }
        return scoreDiff;
    });

    // 上位からcount件を選択し、シャッフル
    const selected = scoredQuestions.slice(0, count).map(sq => sq.question);
    return shuffleArray(selected);
}

// ブックマークを取得
function getBookmarks() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.bookmarks, []);
}

// ブックマークを保存
function toggleBookmark(questionId) {
    let bookmarks = getBookmarks();
    const index = bookmarks.indexOf(questionId);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.push(questionId);
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.bookmarks, bookmarks);
    updateBookmarkButton(questionId);
    updateBookmarkCountDisplay();
}

// 統計データを取得
function getStats() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.stats, {
        totalAttempts: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        sessions: []
    });
}

// 統計データを保存
function saveStats(correct, total, mode) {
    const stats = getStats();
    stats.totalAttempts++;
    stats.totalQuestions += total;
    stats.totalCorrect += correct;
    stats.sessions.push({
        date: new Date().toISOString(),
        correct: correct,
        total: total,
        mode: mode,
        rate: Math.round((correct / total) * 100)
    });
    if (stats.sessions.length > 50) {
        stats.sessions = stats.sessions.slice(-50);
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.stats, stats);
}

// 履歴を保存
function saveHistory(answers) {
    const history = UserManager.getUserData(STORAGE_BASE_KEYS.history, []);
    history.push({
        date: new Date().toISOString(),
        mode: studyMode,
        answers: answers.map(a => ({
            questionId: a.questionId,
            isCorrect: a.isCorrect,
            userAnswer: a.userAnswer
        }))
    });
    if (history.length > 20) {
        history.shift();
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.history, history);
}

// =====================
// 学習時間トラッキング
// =====================

// 累計学習時間を取得（秒）
function getTotalStudyTime() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.studyTime, 0);
}

// 学習時間を追加（秒）
function addStudyTime(seconds) {
    const current = getTotalStudyTime();
    UserManager.setUserData(STORAGE_BASE_KEYS.studyTime, current + seconds);
}

// 学習時間をフォーマット表示
function formatStudyTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
}

// =====================
// 分野別統計（弱点分析）
// =====================

// 分野別統計を取得
function getCategoryStats() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.categoryStats, {});
}

// 分野別統計を保存
function saveCategoryStats(categoryStats) {
    UserManager.setUserData(STORAGE_BASE_KEYS.categoryStats, categoryStats);
}

// 回答時に分野別統計を更新
function updateCategoryStatsOnAnswer(question, isCorrect) {
    const categoryStats = getCategoryStats();
    const category = question.type || '未分類';

    if (!categoryStats[category]) {
        categoryStats[category] = {
            correct: 0,
            total: 0
        };
    }

    categoryStats[category].total++;
    if (isCorrect) {
        categoryStats[category].correct++;
    }

    saveCategoryStats(categoryStats);
}

// 分野別正答率を計算
function calculateCategoryAccuracy() {
    const categoryStats = getCategoryStats();
    const result = [];

    // 全分野を取得
    const allCategories = [...new Set(quizData.map(q => q.type || '未分類'))];

    allCategories.forEach(category => {
        const stats = categoryStats[category] || { correct: 0, total: 0 };
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;

        result.push({
            name: category,
            correct: stats.correct,
            total: stats.total,
            accuracy: accuracy,
            isWeak: accuracy !== null && accuracy < 50,
            questionCount: quizData.filter(q => (q.type || '未分類') === category).length
        });
    });

    // 正答率が低い順にソート（未回答は最後）
    result.sort((a, b) => {
        if (a.accuracy === null && b.accuracy === null) return 0;
        if (a.accuracy === null) return 1;
        if (b.accuracy === null) return -1;
        return a.accuracy - b.accuracy;
    });

    return result;
}

// 苦手分野を取得（正答率50%未満）
function getWeakCategories() {
    return calculateCategoryAccuracy().filter(c => c.isWeak);
}

// 分野別統計表示を更新
function updateCategoryStatsDisplay() {
    const containers = [
        document.getElementById('category-stats'),
        document.getElementById('stats-category-analysis')
    ];

    const categoryData = calculateCategoryAccuracy();
    const weakCategories = getWeakCategories();

    containers.forEach(container => {
        if (!container) return;

        container.innerHTML = '';

        if (categoryData.length === 0) {
            container.innerHTML = '<p class="no-data-message">分野データがありません</p>';
            return;
        }

        // 学習データがあるかチェック
        const hasData = categoryData.some(c => c.total > 0);

        if (!hasData) {
            container.innerHTML = '<p class="no-data-message">まだ学習データがありません。問題を解くと分野別の正答率が表示されます。</p>';
            return;
        }

        categoryData.forEach(category => {
            const item = document.createElement('div');
            item.className = `category-item${category.isWeak ? ' weak' : ''}`;

            const accuracyText = category.accuracy !== null ? `${category.accuracy}%` : '未回答';

            item.innerHTML = `
                <div class="category-item-header">
                    <span class="category-name">${category.name}</span>
                    <span class="category-accuracy">${accuracyText}</span>
                </div>
                <div class="category-progress-bar">
                    <div class="category-progress-fill" style="width: ${category.accuracy || 0}%"></div>
                </div>
                <div class="category-detail">
                    <span class="category-count">${category.correct}/${category.total} 問正解</span>
                    ${category.isWeak ? '<span class="category-weak-badge">苦手分野</span>' : ''}
                </div>
            `;

            container.appendChild(item);
        });
    });

    // 苦手分野学習ボタンの有効/無効
    const weakBtns = [
        document.getElementById('weak-area-study-btn'),
        document.getElementById('stats-weak-area-btn')
    ];

    weakBtns.forEach(btn => {
        if (btn) {
            btn.disabled = weakCategories.length === 0;
            btn.style.opacity = weakCategories.length === 0 ? '0.5' : '1';
        }
    });
}

// 苦手分野の問題を集中学習
function startWeakAreaStudy() {
    const weakCategories = getWeakCategories();

    if (weakCategories.length === 0) {
        alert('苦手分野がありません。正答率50%未満の分野が苦手分野として表示されます。');
        return;
    }

    studyMode = 'weak_area';
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    isTimerMode = false;

    // 苦手分野の問題を集める
    const weakCategoryNames = weakCategories.map(c => c.name);
    currentQuestions = quizData.filter(q => weakCategoryNames.includes(q.type || '未分類'));

    // シャッフル
    currentQuestions = shuffleArray(currentQuestions);

    if (currentQuestions.length === 0) {
        alert('苦手分野の問題がありません');
        return;
    }

    document.getElementById('total-num').textContent = currentQuestions.length;
    document.getElementById('timer-display').classList.add('hidden');

    showScreen('quiz-screen');
    displayQuestion();
}

// =====================
// 画面表示関数
// =====================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');

    if (screenId === 'start-screen') {
        updateStatsDisplay();
        updateWrongCountDisplay();
        updateBookmarkCountDisplay();
        updateCategoryStatsDisplay();
    }
}

function updateStatsDisplay() {
    const stats = getStats();
    const rateEl = document.getElementById('overall-rate');
    const attemptsEl = document.getElementById('total-attempts');

    if (rateEl && stats.totalQuestions > 0) {
        rateEl.textContent = Math.round((stats.totalCorrect / stats.totalQuestions) * 100) + '%';
    } else if (rateEl) {
        rateEl.textContent = '--%';
    }

    if (attemptsEl) {
        attemptsEl.textContent = stats.totalAttempts + '回';
    }
}

function updateWrongCountDisplay() {
    const wrongAnswers = getWrongAnswers();
    const count = Object.keys(wrongAnswers).length;
    const el = document.getElementById('wrong-count');
    if (el) {
        el.textContent = count + '問';
    }

    const reviewBtn = document.getElementById('review-wrong-btn');
    if (reviewBtn) {
        reviewBtn.disabled = count === 0;
        reviewBtn.style.opacity = count === 0 ? '0.5' : '1';
    }
}

function updateBookmarkCountDisplay() {
    const bookmarks = getBookmarks();
    const el = document.getElementById('bookmark-count');
    if (el) {
        el.textContent = bookmarks.length + '問';
    }

    const bookmarkBtn = document.getElementById('study-bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.disabled = bookmarks.length === 0;
        bookmarkBtn.style.opacity = bookmarks.length === 0 ? '0.5' : '1';
    }
}

function updateBookmarkButton(questionId) {
    const bookmarks = getBookmarks();
    const btn = document.getElementById('bookmark-btn');
    if (btn) {
        const isBookmarked = bookmarks.includes(questionId);
        btn.innerHTML = isBookmarked ? '&#9733;' : '&#9734;';
        btn.classList.toggle('active', isBookmarked);
        btn.title = isBookmarked ? 'ブックマーク解除' : 'ブックマークに追加';
    }
}

// =====================
// セッション（分野）選択
// =====================

function generateSessionButtons() {
    const container = document.getElementById('session-buttons');
    if (!container) return;

    const types = [...new Set(quizData.map(q => q.type))].sort();
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'session-btn active';
    allBtn.textContent = '全て';
    allBtn.onclick = () => selectSession(null);
    container.appendChild(allBtn);

    types.forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'session-btn';
        btn.textContent = type;
        btn.onclick = () => selectSession(type);
        container.appendChild(btn);
    });
}

function selectSession(type) {
    selectedSession = type;
    document.querySelectorAll('.session-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((type === null && btn.textContent === '全て') ||
            (type !== null && btn.textContent === type)) {
            btn.classList.add('active');
        }
    });
}

// =====================
// クイズ機能
// =====================

function startQuiz(mode, withTimer = false) {
    studyMode = mode;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    isTimerMode = withTimer;
    quizStartTime = Date.now();  // 学習開始時間を記録

    let questions = [...quizData];

    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    switch (mode) {
        case 'all':
            // 全問題モードでもシャッフル
            currentQuestions = shuffleArray(questions);
            break;
        case 'random':
            // 適応型学習で賢く選択
            currentQuestions = selectQuestionsAdaptively(questions, 20);
            break;
        case 'smart':
            // スマート学習モード（苦手問題優先）
            currentQuestions = selectQuestionsAdaptively(questions, Math.min(30, questions.length));
            break;
        case 'wrong':
            const wrongAnswers = getWrongAnswers();
            const wrongIds = Object.keys(wrongAnswers).map(id => parseInt(id));
            currentQuestions = questions.filter(q => wrongIds.includes(q.id));
            // 間違い回数が多い順 + 最近間違えた順でソート後シャッフル
            currentQuestions.sort((a, b) => {
                const countDiff = (wrongAnswers[b.id]?.count || 0) - (wrongAnswers[a.id]?.count || 0);
                if (countDiff !== 0) return countDiff;
                // 同じ回数なら最近間違えた順
                const aDate = wrongAnswers[a.id]?.lastWrong ? new Date(wrongAnswers[a.id].lastWrong) : new Date(0);
                const bDate = wrongAnswers[b.id]?.lastWrong ? new Date(wrongAnswers[b.id].lastWrong) : new Date(0);
                return bDate - aDate;
            });
            // 上位50%をシャッフル（順番を少し変える）
            const halfLength = Math.ceil(currentQuestions.length / 2);
            const topHalf = shuffleArray(currentQuestions.slice(0, halfLength));
            const bottomHalf = currentQuestions.slice(halfLength);
            currentQuestions = [...topHalf, ...bottomHalf];
            break;
        case 'bookmark':
            const bookmarks = getBookmarks();
            currentQuestions = questions.filter(q => bookmarks.includes(q.id));
            currentQuestions = shuffleArray(currentQuestions);
            break;
    }

    if (currentQuestions.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    document.getElementById('total-num').textContent = currentQuestions.length;

    if (isTimerMode) {
        timeRemaining = currentQuestions.length * 120;
        document.getElementById('timer-display').classList.remove('hidden');
        startTimer();
    } else {
        document.getElementById('timer-display').classList.add('hidden');
    }

    showScreen('quiz-screen');
    displayQuestion();
}

function startStudy(mode) {
    startQuiz(mode, false);
}

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            alert('時間切れです！');
            showResult();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;

    let display = '';
    if (hours > 0) {
        display = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    document.getElementById('timer-text').textContent = display;

    const timerDisplay = document.getElementById('timer-display');
    if (timeRemaining <= 60) {
        timerDisplay.classList.add('warning');
    } else {
        timerDisplay.classList.remove('warning');
    }
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

function isMultipleChoiceQuestion(questionText) {
    const pattern = /\n[1-4]\.\s/;
    return pattern.test(questionText);
}

function parseMultipleChoiceQuestion(questionText) {
    const firstChoiceMatch = questionText.match(/\n1\.\s/);
    if (!firstChoiceMatch) {
        return { questionBody: questionText, choices: [] };
    }

    const firstChoiceIndex = questionText.indexOf(firstChoiceMatch[0]);
    const questionBody = questionText.substring(0, firstChoiceIndex).trim();
    const choicesText = questionText.substring(firstChoiceIndex);

    const choices = [];
    const parts = choicesText.split(/\n[1-4]\.\s+/).filter(s => s.trim());

    parts.forEach((text, index) => {
        if (text.trim()) {
            choices.push({
                number: index + 1,
                text: text.trim()
            });
        }
    });

    return { questionBody, choices };
}

function extractCorrectAnswer(answerText) {
    const patterns = [
        /【正解】\s*(\d)/,
        /正解[：:]\s*(\d)/,
        /答え[：:]\s*(\d)/,
        /解答[：:]\s*(\d)/,
        /^(\d)\s*$/m,
        /正解は\s*(\d)/,
        /(\d)\s*が正解/
    ];

    for (const pattern of patterns) {
        const match = answerText.match(pattern);
        if (match) {
            return parseInt(match[1]);
        }
    }
    return null;
}

function formatText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

function formatExplanation(text) {
    if (!text) return '';

    let formatted = text;

    formatted = formatted.replace(/【正解】/g, '<div class="explanation-section correct-section"><span class="section-label correct-label">【正解】</span>');
    formatted = formatted.replace(/【解説】/g, '</div><div class="explanation-section explanation-detail"><span class="section-label explanation-label">【解説】</span>');
    formatted = formatted.replace(/正解[：:]\s*(\d)/g, '<strong class="correct-answer-text">正解: $1</strong>');

    formatted = formatted
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

    if (formatted.includes('explanation-section') && !formatted.endsWith('</div>')) {
        formatted += '</div>';
    }

    return formatted;
}

// =====================
// 復習モード強化機能
// =====================

// 復習モード時の間違い回数バッジを表示
function displayWrongReviewBadge(question) {
    // 既存のバッジを削除
    const existingBadge = document.getElementById('wrong-review-badge');
    if (existingBadge) {
        existingBadge.remove();
    }

    // 既存のヒントを削除
    const existingHint = document.getElementById('review-hint');
    if (existingHint) {
        existingHint.remove();
    }

    if (!isWrongReviewMode) return;

    const wrongData = wrongAnswersData[question.id];
    if (!wrongData) return;

    // 間違い回数バッジを作成
    const badge = document.createElement('div');
    badge.id = 'wrong-review-badge';
    badge.className = 'wrong-review-badge';

    const wrongCount = wrongData.count || 0;
    let urgencyClass = '';
    let urgencyText = '';

    if (wrongCount >= 3) {
        urgencyClass = 'high-priority';
        urgencyText = '要注意';
    } else if (wrongCount >= 2) {
        urgencyClass = 'medium-priority';
        urgencyText = '復習推奨';
    } else {
        urgencyClass = 'low-priority';
        urgencyText = '確認';
    }

    badge.classList.add(urgencyClass);
    badge.innerHTML = `
        <span class="badge-icon">&#128270;</span>
        <span class="badge-text">${urgencyText}: ${wrongCount}回間違い</span>
    `;

    // バッジを問題番号の近くに挿入
    const questionHeader = document.querySelector('.question-header') || document.querySelector('.quiz-header');
    if (questionHeader) {
        questionHeader.appendChild(badge);
    }

    // 間違えやすいポイントのヒントを表示
    displayReviewHint(question, wrongData);
}

// 間違えやすいポイントのヒントを表示
function displayReviewHint(question, wrongData) {
    const hintContainer = document.createElement('div');
    hintContainer.id = 'review-hint';
    hintContainer.className = 'review-hint';

    const wrongCount = wrongData.count || 0;
    const lastWrong = wrongData.lastWrong ? new Date(wrongData.lastWrong) : null;

    let hintText = '';
    let tipsList = [];

    // 間違い回数に応じたメッセージ
    if (wrongCount >= 3) {
        hintText = 'この問題は複数回間違えています。';
        tipsList.push('解説をよく読んで、なぜ間違えたか考えましょう');
        tipsList.push('選択肢の違いを明確に理解することが重要です');
    } else if (wrongCount >= 2) {
        hintText = 'この問題は以前も間違えています。';
        tipsList.push('前回の間違いを思い出して慎重に解答しましょう');
    } else {
        hintText = 'この問題で一度間違えています。';
        tipsList.push('落ち着いて問題文を読みましょう');
    }

    // 最後に間違えた日時
    let lastWrongText = '';
    if (lastWrong) {
        const now = new Date();
        const diffDays = Math.floor((now - lastWrong) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            lastWrongText = '今日間違えました';
        } else if (diffDays === 1) {
            lastWrongText = '昨日間違えました';
        } else if (diffDays < 7) {
            lastWrongText = `${diffDays}日前に間違えました`;
        } else {
            lastWrongText = `${Math.floor(diffDays / 7)}週間前に間違えました`;
        }
    }

    hintContainer.innerHTML = `
        <div class="hint-header">
            <span class="hint-icon">&#128161;</span>
            <span class="hint-title">復習ポイント</span>
        </div>
        <div class="hint-content">
            <p class="hint-message">${hintText}</p>
            ${lastWrongText ? `<p class="hint-last-wrong">${lastWrongText}</p>` : ''}
            <ul class="hint-tips">
                ${tipsList.map(tip => `<li>${tip}</li>`).join('')}
            </ul>
        </div>
    `;

    // ヒントを問題文の前に挿入
    const questionText = document.getElementById('question-text');
    if (questionText && questionText.parentNode) {
        questionText.parentNode.insertBefore(hintContainer, questionText);
    }
}

// 復習完了後の傾向分析を生成
function generateReviewAnalysis() {
    if (!isWrongReviewMode || userAnswers.length === 0) return null;

    const analysis = {
        totalReviewed: userAnswers.length,
        improved: 0,
        stillWrong: 0,
        frequentWrong: [],
        categoryAnalysis: {},
        recommendations: []
    };

    userAnswers.forEach(answer => {
        const question = currentQuestions.find(q => q.id === answer.questionId);
        if (!question) return;

        const category = question.type || '未分類';
        if (!analysis.categoryAnalysis[category]) {
            analysis.categoryAnalysis[category] = { correct: 0, wrong: 0 };
        }

        if (answer.isCorrect) {
            analysis.improved++;
            analysis.categoryAnalysis[category].correct++;
        } else {
            analysis.stillWrong++;
            analysis.categoryAnalysis[category].wrong++;

            const wrongData = wrongAnswersData[answer.questionId];
            if (wrongData && wrongData.count >= 3) {
                analysis.frequentWrong.push({
                    id: answer.questionId,
                    count: wrongData.count,
                    category: category
                });
            }
        }
    });

    const improvementRate = Math.round((analysis.improved / analysis.totalReviewed) * 100);

    if (improvementRate >= 80) {
        analysis.recommendations.push('素晴らしい改善です！この調子で学習を続けましょう。');
    } else if (improvementRate >= 60) {
        analysis.recommendations.push('良い進歩です。まだ間違える問題は重点的に復習しましょう。');
    } else if (improvementRate >= 40) {
        analysis.recommendations.push('まだ改善の余地があります。解説をよく読んで理解を深めましょう。');
    } else {
        analysis.recommendations.push('基礎からの復習が必要かもしれません。教科書も併せて確認しましょう。');
    }

    const weakCategories = Object.entries(analysis.categoryAnalysis)
        .filter(([_, stats]) => stats.wrong > stats.correct)
        .map(([name, _]) => name);

    if (weakCategories.length > 0) {
        analysis.recommendations.push(`特に「${weakCategories.join('」「')}」の分野を重点的に学習しましょう。`);
    }

    if (analysis.frequentWrong.length > 0) {
        analysis.recommendations.push(`問題${analysis.frequentWrong.map(q => q.id).join(', ')}は何度も間違えています。解説を印刷して覚えることをお勧めします。`);
    }

    return analysis;
}

// 復習完了後の傾向分析を表示
function displayReviewAnalysis() {
    const analysis = generateReviewAnalysis();
    if (!analysis) return;

    const container = document.getElementById('result-weak-analysis');
    if (!container) return;

    const improvementRate = Math.round((analysis.improved / analysis.totalReviewed) * 100);

    const analysisHTML = `
        <div class="review-analysis">
            <div class="analysis-header">
                <span class="analysis-icon">&#128200;</span>
                <span class="analysis-title">復習結果の分析</span>
            </div>

            <div class="analysis-summary">
                <div class="summary-item improvement">
                    <span class="summary-label">改善率</span>
                    <span class="summary-value ${improvementRate >= 70 ? 'good' : improvementRate >= 50 ? 'moderate' : 'needs-work'}">${improvementRate}%</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">正解（改善）</span>
                    <span class="summary-value">${analysis.improved}問</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">不正解（要継続）</span>
                    <span class="summary-value">${analysis.stillWrong}問</span>
                </div>
            </div>

            ${analysis.frequentWrong.length > 0 ? `
                <div class="frequent-wrong-section">
                    <div class="section-header">
                        <span class="warning-icon">&#9888;</span>
                        <span>繰り返し間違える問題</span>
                    </div>
                    <ul class="frequent-wrong-list">
                        ${analysis.frequentWrong.map(q => `
                            <li>問題 ${q.id}（${q.category}）- ${q.count}回間違い</li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            <div class="recommendations-section">
                <div class="section-header">
                    <span class="bulb-icon">&#128161;</span>
                    <span>学習アドバイス</span>
                </div>
                <ul class="recommendations-list">
                    ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('afterbegin', analysisHTML);
}

// 現在の問題の選択肢マッピング（シャッフル対応）
let currentChoiceMapping = [];

function displayQuestion() {
    const question = currentQuestions[currentIndex];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.questionNo || question.id;
    document.getElementById('correct-count').textContent = correctCount;

    const progress = ((currentIndex) / currentQuestions.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    updateBookmarkButton(question.id);

    // 復習モード時の間違い回数バッジ表示
    displayWrongReviewBadge(question);

    const questionText = document.getElementById('question-text');
    const choicesContainer = document.getElementById('choices');

    const sessionBadge = document.getElementById('session-badge');
    if (sessionBadge) {
        sessionBadge.textContent = question.type || '問題';
    }

    if (isMultipleChoiceQuestion(question.question)) {
        const parsed = parseMultipleChoiceQuestion(question.question);
        questionText.innerHTML = formatText(parsed.questionBody);

        choicesContainer.innerHTML = '';
        choicesContainer.classList.remove('hidden');

        // 選択肢をシャッフル
        const shuffledChoices = shuffleChoices(parsed.choices);
        currentChoiceMapping = shuffledChoices.map(c => c.originalNumber);

        shuffledChoices.forEach((choice, displayIndex) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.innerHTML = `
                <span class="choice-number">${displayIndex + 1}</span>
                <span class="choice-text">${formatText(choice.text)}</span>
            `;
            btn.dataset.originalNumber = choice.originalNumber;
            btn.onclick = () => selectAnswer(choice.originalNumber, true, displayIndex + 1);
            choicesContainer.appendChild(btn);
        });

        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) {
            showAnswerBtn.classList.add('hidden');
        }
    } else {
        questionText.innerHTML = formatText(question.question);
        choicesContainer.innerHTML = '';
        choicesContainer.classList.add('hidden');
        currentChoiceMapping = [];

        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) {
            showAnswerBtn.classList.remove('hidden');
        }
    }

    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');

    const flashcardControls = document.getElementById('flashcard-controls');
    if (flashcardControls) {
        flashcardControls.classList.add('hidden');
    }

    const answerSection = document.getElementById('answer-section');
    if (answerSection) {
        answerSection.classList.add('hidden');
    }
}

// 選択肢をシャッフルする関数
function shuffleChoices(choices) {
    const shuffled = choices.map(c => ({
        originalNumber: c.number,
        text: c.text
    }));
    // Fisher-Yatesシャッフル
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function showAnswer() {
    const question = currentQuestions[currentIndex];

    const answerSection = document.getElementById('answer-section');
    const answerText = document.getElementById('answer-text');

    answerText.innerHTML = formatExplanation(question.answer);
    answerSection.classList.remove('hidden');

    const showAnswerBtn = document.getElementById('show-answer-btn');
    if (showAnswerBtn) {
        showAnswerBtn.classList.add('hidden');
    }

    const flashcardControls = document.getElementById('flashcard-controls');
    if (flashcardControls) {
        flashcardControls.classList.remove('hidden');
    }
}

function markCorrect() {
    const question = currentQuestions[currentIndex];

    userAnswers.push({
        questionId: question.id,
        question: question.question,
        userAnswer: 'correct',
        correctAnswer: 'correct',
        isCorrect: true
    });

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, true);

    correctCount++;
    recordCorrectAnswer(question.id);

    nextQuestion();
}

function markWrong() {
    const question = currentQuestions[currentIndex];

    userAnswers.push({
        questionId: question.id,
        question: question.question,
        userAnswer: 'wrong',
        correctAnswer: 'correct',
        isCorrect: false
    });

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, false);

    saveWrongAnswer(question.id);

    nextQuestion();
}

function selectAnswer(selected, isQuizMode = false, displayNumber = null) {
    const question = currentQuestions[currentIndex];
    const correctAnswer = extractCorrectAnswer(question.answer);
    const isCorrect = selected === correctAnswer;

    userAnswers.push({
        questionId: question.id,
        question: question.question,
        choices: isQuizMode ? parseMultipleChoiceQuestion(question.question).choices : [],
        userAnswer: selected,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect
    });

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, isCorrect);

    if (isCorrect) {
        correctCount++;
        document.getElementById('correct-count').textContent = correctCount;
        recordCorrectAnswer(question.id);
    } else {
        saveWrongAnswer(question.id);
    }

    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        btn.classList.add('disabled');
        btn.onclick = null;

        const originalNum = parseInt(btn.dataset.originalNumber) || (index + 1);

        // 正解の選択肢をハイライト
        if (originalNum === correctAnswer) {
            btn.classList.add('correct');
        }
        // 間違いで選択した選択肢をハイライト
        if (originalNum === selected && !isCorrect) {
            btn.classList.add('wrong');
        }
        // 選択した選択肢をマーク
        if (originalNum === selected) {
            btn.classList.add('selected');
        }
    });

    const feedback = document.getElementById('result-feedback');
    feedback.classList.remove('hidden', 'correct-feedback', 'wrong-feedback');

    if (isCorrect) {
        feedback.classList.add('correct-feedback');
        document.getElementById('feedback-icon').innerHTML = '&#9711;';
        document.getElementById('feedback-text').textContent = '正解！';
        document.getElementById('correct-answer').textContent = '';
    } else {
        feedback.classList.add('wrong-feedback');
        document.getElementById('feedback-icon').innerHTML = '&#10005;';
        document.getElementById('feedback-text').textContent = '不正解';
        document.getElementById('correct-answer').textContent =
            `正解は ${correctAnswer !== null && correctAnswer !== undefined ? correctAnswer : '(データなし)'} です`;
    }

    const answerSection = document.getElementById('answer-section');
    const answerText = document.getElementById('answer-text');
    if (answerSection && answerText) {
        answerText.innerHTML = formatExplanation(question.answer);
        answerSection.classList.remove('hidden');
    }

    // フィードバック内に解説を表示（R1形式）
    const explanationEl = document.getElementById('explanation');
    if (explanationEl && question.answer) {
        // 【解説】部分を抽出
        const explanationMatch = question.answer.match(/【解説】([\s\S]*?)$/);
        if (explanationMatch) {
            explanationEl.innerHTML = `
                <div class="explanation-title">【解説】</div>
                <div class="explanation-content">${explanationMatch[1].trim()}</div>
            `;
            explanationEl.classList.remove('hidden');
        } else {
            explanationEl.classList.add('hidden');
        }
    }

    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.remove('hidden');

    if (currentIndex === currentQuestions.length - 1) {
        nextBtn.innerHTML = '<span class="btn-icon">&#128202;</span>結果を見る';
        nextBtn.onclick = showResult;
    } else {
        nextBtn.innerHTML = '<span class="btn-icon">&#8594;</span>次の問題へ';
        nextBtn.onclick = nextQuestion;
    }
}

function nextQuestion() {
    currentIndex++;

    const flashcardControls = document.getElementById('flashcard-controls');
    if (flashcardControls) {
        flashcardControls.classList.add('hidden');
    }

    if (currentIndex >= currentQuestions.length) {
        showResult();
    } else {
        displayQuestion();
        window.scrollTo(0, 0);
    }
}

// 合格ライン（FP3級: 60%）
const PASS_LINE = 60;

function showResult() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 学習時間を計算して保存
    if (quizStartTime) {
        const elapsedSeconds = Math.floor((Date.now() - quizStartTime) / 1000);
        addStudyTime(elapsedSeconds);
        quizStartTime = null;
    }

    const total = currentQuestions.length;
    const rate = Math.round((correctCount / total) * 100);

    saveStats(correctCount, total, studyMode);
    saveHistory(userAnswers);

    document.getElementById('final-score').textContent = correctCount;
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-total').textContent = total;
    document.getElementById('result-rate').textContent = rate;

    // 合格ライン比較表示
    const passLineComparison = document.getElementById('pass-line-comparison');
    if (passLineComparison) {
        const isPassed = rate >= PASS_LINE;
        passLineComparison.innerHTML = `
            <div class="pass-line-display ${isPassed ? 'passed' : 'failed'}">
                <span class="pass-line-label">合格ライン: ${PASS_LINE}%</span>
                <span class="pass-line-separator">/</span>
                <span class="your-score-label">あなた: ${rate}%</span>
                <span class="pass-result-badge">${isPassed ? '合格' : '不合格'}</span>
            </div>
        `;
    }

    const messageEl = document.getElementById('result-message');
    messageEl.className = 'result-message';

    if (rate >= 90) {
        messageEl.classList.add('excellent');
        messageEl.textContent = '素晴らしい！ほぼ完璧です！';
    } else if (rate >= 70) {
        messageEl.classList.add('good');
        messageEl.textContent = '良い成績です！合格ラインを余裕でクリア！';
    } else if (rate >= PASS_LINE) {
        messageEl.classList.add('pass');
        messageEl.textContent = '合格ラインクリア！さらに上を目指しましょう！';
    } else {
        messageEl.classList.add('fail');
        messageEl.textContent = '復習が必要です。繰り返し学習しましょう！';
    }

    const wrongCount = userAnswers.filter(a => !a.isCorrect).length;
    document.getElementById('wrong-in-session').textContent = wrongCount;

    // 苦手分野分析を表示
    displayWeakCategoryAnalysis();

    // 復習モード時は傾向分析を表示
    if (isWrongReviewMode) {
        displayReviewAnalysis();
    }

    showScreen('result-screen');
    window.scrollTo(0, 0);

    // 復習モードをリセット
    isWrongReviewMode = false;
    wrongAnswersData = {};
}

// 苦手分野分析を結果画面に表示
function displayWeakCategoryAnalysis() {
    const container = document.getElementById('result-weak-analysis');
    if (!container) return;

    // 今回のセッションでの分野別正答率を計算
    const categoryResults = {};
    userAnswers.forEach(answer => {
        const question = currentQuestions.find(q => q.id === answer.questionId);
        if (question) {
            const category = question.type || '未分類';
            if (!categoryResults[category]) {
                categoryResults[category] = { correct: 0, total: 0 };
            }
            categoryResults[category].total++;
            if (answer.isCorrect) {
                categoryResults[category].correct++;
            }
        }
    });

    // 正答率が低い順にソート
    const sortedCategories = Object.entries(categoryResults)
        .map(([name, stats]) => ({
            name,
            correct: stats.correct,
            total: stats.total,
            accuracy: Math.round((stats.correct / stats.total) * 100)
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    // 苦手分野（正答率50%未満）を抽出
    const weakCategories = sortedCategories.filter(c => c.accuracy < 50);

    container.innerHTML = '';

    if (sortedCategories.length === 0) {
        container.innerHTML = '<p class="no-data-message">分野データがありません</p>';
        return;
    }

    // 苦手分野がある場合のアドバイス
    if (weakCategories.length > 0) {
        const adviceDiv = document.createElement('div');
        adviceDiv.className = 'weak-category-advice';
        const weakNames = weakCategories.map(c => c.name).join('、');
        adviceDiv.innerHTML = `
            <div class="advice-icon">&#128161;</div>
            <div class="advice-text">
                <strong>${weakNames}</strong>の分野を重点的に学習しましょう
            </div>
        `;
        container.appendChild(adviceDiv);
    }

    // 分野別の正答率を表示
    const statsDiv = document.createElement('div');
    statsDiv.className = 'session-category-stats';

    sortedCategories.forEach(category => {
        const isWeak = category.accuracy < 50;
        const item = document.createElement('div');
        item.className = `session-category-item${isWeak ? ' weak' : ''}`;
        item.innerHTML = `
            <div class="session-category-header">
                <span class="session-category-name">${category.name}</span>
                <span class="session-category-accuracy">${category.accuracy}%</span>
            </div>
            <div class="session-category-bar">
                <div class="session-category-fill" style="width: ${category.accuracy}%"></div>
            </div>
            <div class="session-category-detail">
                ${category.correct}/${category.total}問正解
                ${isWeak ? '<span class="weak-badge">要復習</span>' : ''}
            </div>
        `;
        statsDiv.appendChild(item);
    });

    container.appendChild(statsDiv);
}

function reviewAnswers() {
    displayReviewList('all');
    showScreen('review-screen');
    window.scrollTo(0, 0);
}

function displayReviewList(filter) {
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    let filteredAnswers = userAnswers;
    if (filter === 'correct') {
        filteredAnswers = userAnswers.filter(a => a.isCorrect);
    } else if (filter === 'wrong') {
        filteredAnswers = userAnswers.filter(a => !a.isCorrect);
    }

    if (filteredAnswers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 40px;">該当する問題はありません</p>';
        return;
    }

    filteredAnswers.forEach(answer => {
        const item = document.createElement('div');
        item.className = `review-item ${answer.isCorrect ? 'correct' : 'wrong'}`;

        const questionPreview = answer.question.length > 100
            ? answer.question.substring(0, 100) + '...'
            : answer.question;

        const bookmarks = getBookmarks();
        const isBookmarked = bookmarks.includes(answer.questionId);

        item.innerHTML = `
            <div class="review-item-header">
                <span class="review-item-number">問題 ${answer.questionId}</span>
                <div class="review-item-actions">
                    <button class="bookmark-mini-btn ${isBookmarked ? 'active' : ''}"
                            onclick="toggleBookmark(${answer.questionId}); this.classList.toggle('active');">
                        ${isBookmarked ? '&#9733;' : '&#9734;'}
                    </button>
                    <span class="review-item-status ${answer.isCorrect ? 'correct' : 'wrong'}">
                        ${answer.isCorrect ? '正解' : '不正解'}
                    </span>
                </div>
            </div>
            <div class="review-item-question">${questionPreview}</div>
            <div class="review-item-answer">
                ${!answer.isCorrect && answer.userAnswer !== 'wrong' ? `<span class="your-answer">あなたの回答: ${answer.userAnswer}</span> / ` : ''}
                ${answer.correctAnswer !== 'correct' ? `<span class="correct-ans">正解: ${answer.correctAnswer}</span>` : ''}
            </div>
        `;

        container.appendChild(item);
    });
}

function filterReview(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    displayReviewList(filter);
}

// =====================
// ダークモード
// =====================

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem(DARK_MODE_KEY, isDark);
    updateDarkModeButton();
}

function updateDarkModeButton() {
    const btn = document.getElementById('dark-mode-btn');
    if (btn) {
        const isDark = document.body.classList.contains('dark-mode');
        btn.innerHTML = isDark ? '&#9788;' : '&#127769;';
        btn.title = isDark ? 'ライトモード' : 'ダークモード';
    }
}

// =====================
// 統計画面
// =====================

function showStatsScreen() {
    const stats = getStats();
    const wrongAnswers = getWrongAnswers();

    document.getElementById('stats-total-attempts').textContent = stats.totalAttempts;
    document.getElementById('stats-total-questions').textContent = stats.totalQuestions;
    document.getElementById('stats-total-correct').textContent = stats.totalCorrect;

    const overallRate = stats.totalQuestions > 0
        ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
        : 0;
    document.getElementById('stats-overall-rate').textContent = overallRate + '%';

    const weakList = document.getElementById('weak-questions-list');
    weakList.innerHTML = '';

    const wrongEntries = Object.entries(wrongAnswers)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    if (wrongEntries.length === 0) {
        weakList.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 20px;">苦手な問題はありません</p>';
    } else {
        wrongEntries.forEach(([id, data]) => {
            const question = quizData.find(q => q.id === parseInt(id));
            if (question) {
                const item = document.createElement('div');
                item.className = 'weak-item';
                item.innerHTML = `
                    <div class="weak-item-header">
                        <span class="weak-item-number">問題 ${id}</span>
                        <span class="weak-item-count">間違い ${data.count}回</span>
                    </div>
                    <div class="weak-item-question">${question.question.substring(0, 80)}...</div>
                `;
                weakList.appendChild(item);
            }
        });
    }

    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    const recentSessions = stats.sessions.slice(-10).reverse();

    if (recentSessions.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 20px;">学習履歴はありません</p>';
    } else {
        recentSessions.forEach(session => {
            const date = new Date(session.date);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-date">${dateStr}</div>
                <div class="history-mode">${getModeLabel(session.mode)}</div>
                <div class="history-score">${session.correct}/${session.total}</div>
                <div class="history-rate ${session.rate >= 70 ? 'good' : session.rate >= 60 ? 'pass' : 'fail'}">${session.rate}%</div>
            `;
            historyList.appendChild(item);
        });
    }

    // 分野別統計を更新
    updateCategoryStatsDisplay();

    showScreen('stats-screen');
}

function getModeLabel(mode) {
    const labels = {
        'all': '全問題',
        'random': 'ランダム',
        'smart': 'スマート学習',
        'wrong': '復習',
        'bookmark': 'ブックマーク',
        'weak_area': '苦手分野'
    };
    return labels[mode] || mode;
}

function resetAllData() {
    const currentUser = UserManager.getCurrentUser();
    if (confirm(`${currentUser}さんの学習データをリセットしますか？\n（間違い記録、統計、ブックマーク、分野別統計、適応型学習データが削除されます）`)) {
        UserManager.removeUserData(STORAGE_BASE_KEYS.wrongAnswers);
        UserManager.removeUserData(STORAGE_BASE_KEYS.stats);
        UserManager.removeUserData(STORAGE_BASE_KEYS.bookmarks);
        UserManager.removeUserData(STORAGE_BASE_KEYS.history);
        UserManager.removeUserData(STORAGE_BASE_KEYS.categoryStats);
        UserManager.removeUserData(STORAGE_BASE_KEYS.adaptiveLearning);
        alert('データをリセットしました');
        goHome();
    }
}

// =====================
// ナビゲーション
// =====================

function goToResult() {
    showScreen('result-screen');
}

function restartQuiz() {
    startQuiz(studyMode, isTimerMode);
}

function goHome() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    showScreen('start-screen');
    window.scrollTo(0, 0);
}

function startWrongReview() {
    // 復習モードフラグを設定
    isWrongReviewMode = true;
    // 間違い履歴データを保存（復習中に参照するため）
    wrongAnswersData = getWrongAnswers();
    startQuiz('wrong', false);
}

function startBookmarkStudy() {
    startQuiz('bookmark', false);
}

function startTimerMode(mode) {
    startQuiz(mode, true);
}

function bookmarkCurrentQuestion() {
    const question = currentQuestions[currentIndex];
    toggleBookmark(question.id);
}

// =====================
// 試験日カウントダウン機能
// =====================

// カウントダウン初期化
function initExamCountdown() {
    const savedDate = localStorage.getItem(EXAM_DATE_KEY);
    if (savedDate) {
        updateCountdownDisplay(savedDate);
    }
}

// 試験日を設定
function setExamDate() {
    const savedDate = localStorage.getItem(EXAM_DATE_KEY);
    const defaultDate = savedDate || getDefaultExamDate();

    const input = prompt(
        '試験日を入力してください (例: 2025-05-31)\n\n' +
        '【FP3級 試験日情報】\n' +
        '・FP3級はCBT方式で随時受検可能です。\n' +
        '・次回の受検予定日を入力してください。',
        defaultDate
    );

    if (input) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(input)) {
            const testDate = new Date(input);
            if (!isNaN(testDate.getTime())) {
                localStorage.setItem(EXAM_DATE_KEY, input);
                updateCountdownDisplay(input);
                return;
            }
        }
        alert('日付の形式が正しくありません。\nYYYY-MM-DD の形式で入力してください。');
    }
}

// デフォルトの試験日を取得（次の5月末日）
function getDefaultExamDate() {
    const today = new Date();
    let year = today.getFullYear();
    let month = 4; // 5月（0始まり）
    // 5月末日を取得
    let examDate = new Date(year, month + 1, 0); // 5月の最終日
    if (examDate < today) {
        examDate = new Date(year + 1, month + 1, 0);
    }
    return formatDate(examDate);
}

// 指定月の第1日曜日を取得
function getFirstSunday(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const firstSunday = 1 + (7 - firstDay.getDay()) % 7;
    return new Date(year, month - 1, firstSunday);
}

// 日付をYYYY-MM-DD形式に
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// カウントダウン表示を更新
function updateCountdownDisplay(dateStr) {
    const examDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);

    const diffTime = examDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const daysEl = document.getElementById('countdown-days');
    const dateEl = document.getElementById('countdown-date');
    const countdownEl = document.getElementById('exam-countdown');

    if (daysEl && dateEl && countdownEl) {
        daysEl.textContent = diffDays;
        const displayDate = new Date(dateStr);
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        dateEl.textContent = displayDate.toLocaleDateString('ja-JP', options);

        countdownEl.classList.remove('warning', 'urgent', 'passed');
        if (diffDays < 0) {
            countdownEl.classList.add('passed');
            daysEl.textContent = '終了';
        } else if (diffDays <= 7) {
            countdownEl.classList.add('urgent');
        } else if (diffDays <= 30) {
            countdownEl.classList.add('warning');
        }
    }
}

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    const quizScreen = document.getElementById('quiz-screen');
    if (!quizScreen || !quizScreen.classList.contains('active')) return;

    const choiceButtons = document.querySelectorAll('.choice-btn');
    const isAnswered = choiceButtons.length > 0 && choiceButtons[0].classList.contains('disabled');
    const isQuizMode = choiceButtons.length > 0 && !document.getElementById('choices').classList.contains('hidden');

    const answerSection = document.getElementById('answer-section');
    const isAnswerVisible = answerSection && !answerSection.classList.contains('hidden');

    if (!isAnswered && isQuizMode && ['1', '2', '3', '4'].includes(e.key)) {
        const choiceIndex = parseInt(e.key);
        if (choiceIndex <= choiceButtons.length) {
            selectAnswer(choiceIndex, true);
        }
    }

    if (!isQuizMode && !isAnswerVisible && e.key === ' ') {
        e.preventDefault();
        showAnswer();
    }

    if ((isAnswered || isAnswerVisible) && (e.key === 'Enter' || (isQuizMode && e.key === ' '))) {
        e.preventDefault();
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) {
            nextBtn.click();
        }
    }

    if (!isQuizMode && isAnswerVisible && (e.key === 'ArrowRight' || e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        markCorrect();
    }

    if (!isQuizMode && isAnswerVisible && (e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        markWrong();
    }

    if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        bookmarkCurrentQuestion();
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        goHome();
    }
});

// =====================
// スワイプナビゲーション
// =====================
(function() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    const minSwipeDistance = 80;
    const maxVerticalDistance = 100;
    let swipeHintShown = false;

    function createSwipeHint() {
        if (document.querySelector('.swipe-hint')) return;
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.innerHTML = '左にスワイプで次の問題へ';
        document.body.appendChild(hint);
    }

    function showSwipeHint() {
        if (swipeHintShown) return;
        const hint = document.querySelector('.swipe-hint');
        if (hint) {
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 3000);
            swipeHintShown = true;
            localStorage.setItem('swipeHintShown', 'true');
        }
    }

    function initSwipeHint() {
        createSwipeHint();
        if (!localStorage.getItem('swipeHintShown')) {
            setTimeout(showSwipeHint, 2000);
        } else {
            swipeHintShown = true;
        }
    }

    function handleSwipe() {
        const quizScreen = document.getElementById('quiz-screen');
        if (!quizScreen || !quizScreen.classList.contains('active')) return;

        const diffX = touchStartX - touchEndX;
        const diffY = Math.abs(touchStartY - touchEndY);

        if (diffY > maxVerticalDistance) return;

        if (diffX > minSwipeDistance) {
            const nextBtn = document.getElementById('next-btn');
            if (nextBtn && !nextBtn.classList.contains('hidden')) {
                nextBtn.click();
            }
        }
    }

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSwipeHint);
    } else {
        initSwipeHint();
    }
})();

// =====================
// 印刷用問題集生成
// =====================
function generatePrintableQuiz() {
    const questions = quizData;
    if (!questions || questions.length === 0) { alert('問題データがありません'); return; }
    let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>FP3級 過去問題集</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;font-size:11pt;line-height:1.6;padding:20mm}.header{text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #333}.header h1{font-size:16pt;margin-bottom:5px}.header p{font-size:10pt;color:#666}.question{margin-bottom:20px;page-break-inside:avoid}.question-header{font-weight:bold;margin-bottom:8px;padding:5px 10px;background:#f0f0f0;border-left:4px solid #2563eb}.question-text{margin-bottom:10px;padding-left:10px}.choices{padding-left:20px}.choice{margin-bottom:5px;display:flex}.choice-num{min-width:25px;font-weight:bold}.answer-section{margin-top:40px;page-break-before:always}.answer-section h2{font-size:14pt;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #333}.answer-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.answer-item{padding:5px 10px;background:#f9f9f9;border:1px solid #ddd;text-align:center;font-size:10pt}@media print{body{padding:15mm}.question{page-break-inside:avoid}}</style></head><body><div class="header"><h1>FP3級 過去問題集</h1><p>問題集（全${questions.length}問）</p></div>`;
    questions.forEach((q, index) => {
        html += `<div class="question"><div class="question-header">問題 ${q.id}</div><div class="question-text">${escapeHtml(q.question)}</div><div class="choices">`;
        q.choices.forEach((choice, i) => { html += `<div class="choice"><span class="choice-num">${i+1}.</span><span>${escapeHtml(choice)}</span></div>`; });
        html += `</div></div>`;
        if ((index + 1) % 4 === 0 && index < questions.length - 1) html += `<div style="page-break-after:always;"></div>`;
    });
    html += `<div class="answer-section"><h2>解答一覧</h2><div class="answer-grid">`;
    questions.forEach(q => { html += `<div class="answer-item">問${q.id}: ${q.correct}</div>`; });
    html += `</div></div></body></html>`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = function() { printWindow.print(); };
}
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
