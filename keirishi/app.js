// アプリケーション状態
let currentQuestions = [];
let currentIndex = 0;
let correctCount = 0;
let wrongInSession = [];
let userAnswers = [];
let selectedSession = null;
let isTimerMode = false;
let timerInterval = null;
let remainingTime = 0;
let currentMode = '';
let isFlashcardMode = false;

// LocalStorage キー基底 (建設業経理士1級用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    wrongAnswers: 'wrong_keirishi',
    stats: 'stats_keirishi',
    bookmarks: 'bookmarks_keirishi',
    history: 'history_keirishi',
    categoryStats: 'category_stats_keirishi'
};

// ダークモードは共通設定
const DARK_MODE_KEY = 'quiz_dark_mode';

// 試験日カウントダウン用キー（建設業経理士）
const EXAM_DATE_KEY = 'exam_date_keirishi';

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
    generateSessionButtons();
    updateWrongCount();
    updateBookmarkCount();
    updateCategoryStatsDisplay();
    initExamCountdown();
}

// セッションボタン生成（分野別 - typeフィールドを使用）
function generateSessionButtons() {
    const container = document.getElementById('session-buttons');
    if (!container) return;

    // type フィールドからユニークな分野を取得
    const types = [...new Set(quizData.map(q => q.type))].sort();
    container.innerHTML = '';

    // 全て選択ボタン
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

// データ管理
function getWrongAnswers() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.wrongAnswers, {});
}

function saveWrongAnswer(questionId) {
    let wrong = getWrongAnswers();
    if (!wrong[questionId]) {
        wrong[questionId] = { count: 0, lastWrong: null };
    }
    wrong[questionId].count++;
    wrong[questionId].lastWrong = new Date().toISOString();
    UserManager.setUserData(STORAGE_BASE_KEYS.wrongAnswers, wrong);
}

function removeWrongAnswer(questionId) {
    let wrong = getWrongAnswers();
    delete wrong[questionId];
    UserManager.setUserData(STORAGE_BASE_KEYS.wrongAnswers, wrong);
}

function getStats() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.stats, {
        totalAttempts: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        sessions: []
    });
}

function saveStats(correct, total) {
    let stats = getStats();
    stats.totalAttempts++;
    stats.totalQuestions += total;
    stats.totalCorrect += correct;
    stats.sessions.push({
        date: new Date().toISOString(),
        correct: correct,
        total: total,
        mode: currentMode
    });
    // 直近100回分のみ保持
    if (stats.sessions.length > 100) {
        stats.sessions = stats.sessions.slice(-100);
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.stats, stats);
}

function getBookmarks() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.bookmarks, []);
}

function toggleBookmark(questionId) {
    let bookmarks = getBookmarks();
    const index = bookmarks.indexOf(questionId);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.push(questionId);
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.bookmarks, bookmarks);
    return bookmarks.includes(questionId);
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

    currentMode = 'weak_area';
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    wrongInSession = [];
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
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.classList.add('hidden');

    showScreen('quiz-screen');
    showQuestion();
}

// 表示更新
function updateStatsDisplay() {
    const stats = getStats();
    const rate = stats.totalQuestions > 0
        ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
        : 0;

    const overallRateEl = document.getElementById('overall-rate');
    const totalAttemptsEl = document.getElementById('total-attempts');

    if (overallRateEl) overallRateEl.textContent = stats.totalQuestions > 0 ? rate + '%' : '--%';
    if (totalAttemptsEl) totalAttemptsEl.textContent = stats.totalAttempts + '回';
}

function updateWrongCount() {
    const wrong = getWrongAnswers();
    const count = Object.keys(wrong).length;
    const el = document.getElementById('wrong-count');
    if (el) el.textContent = count + '問';

    const btn = document.getElementById('review-wrong-btn');
    if (btn) btn.disabled = count === 0;
}

function updateBookmarkCount() {
    const bookmarks = getBookmarks();
    const el = document.getElementById('bookmark-count');
    if (el) el.textContent = bookmarks.length + '問';

    const btn = document.getElementById('study-bookmark-btn');
    if (btn) btn.disabled = bookmarks.length === 0;
}

function updateBookmarkButton() {
    const question = currentQuestions[currentIndex];
    if (!question) return;

    const bookmarks = getBookmarks();
    const btn = document.getElementById('bookmark-btn');
    if (btn) {
        const isBookmarked = bookmarks.includes(question.id);
        btn.innerHTML = isBookmarked ? '&#9733;' : '&#9734;';
        btn.classList.toggle('active', isBookmarked);
    }
}

// ダークモード
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem(DARK_MODE_KEY, isDark);
    updateDarkModeButton();
}

function updateDarkModeButton() {
    const btn = document.getElementById('dark-mode-btn');
    const isDark = document.body.classList.contains('dark-mode');
    if (btn) {
        btn.innerHTML = isDark ? '&#9788;' : '&#127769;';
        btn.title = isDark ? 'ライトモード' : 'ダークモード';
    }
}

// 画面遷移
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
}

// クイズ開始
function startQuiz(mode) {
    currentMode = mode;
    isTimerMode = false;
    isFlashcardMode = false;
    let questions = [...quizData];

    // 分野フィルタ
    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (mode === 'random') {
        questions = shuffleArray(questions).slice(0, 20);
    }

    if (questions.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    currentQuestions = questions;
    currentIndex = 0;
    correctCount = 0;
    wrongInSession = [];
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuestions.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

// タイマーモード開始
function startTimerMode(mode) {
    currentMode = 'timer-' + mode;
    isTimerMode = true;
    isFlashcardMode = false;
    let questions = [...quizData];

    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (mode === 'random') {
        questions = shuffleArray(questions).slice(0, 20);
    }

    if (questions.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    currentQuestions = questions;
    currentIndex = 0;
    correctCount = 0;
    wrongInSession = [];
    userAnswers = [];

    // タイマー設定（1問あたり90秒）
    remainingTime = currentQuestions.length * 90;

    document.getElementById('total-num').textContent = currentQuestions.length;
    document.getElementById('timer-display').classList.remove('hidden');

    startTimer();
    showQuestion();
    showScreen('quiz-screen');
}

// 間違えた問題の復習
function startWrongReview() {
    const wrong = getWrongAnswers();
    const wrongIds = Object.keys(wrong).map(id => parseInt(id));

    if (wrongIds.length === 0) {
        alert('間違えた問題はありません');
        return;
    }

    currentMode = 'wrong-review';
    isTimerMode = false;
    isFlashcardMode = false;
    let questions = quizData.filter(q => wrongIds.includes(q.id));

    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (questions.length === 0) {
        alert('選択した分野に間違えた問題はありません');
        return;
    }

    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    correctCount = 0;
    wrongInSession = [];
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuestions.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

// ブックマーク学習
function startBookmarkStudy() {
    const bookmarks = getBookmarks();

    if (bookmarks.length === 0) {
        alert('ブックマークされた問題はありません');
        return;
    }

    currentMode = 'bookmark';
    isTimerMode = false;
    isFlashcardMode = true;
    let questions = quizData.filter(q => bookmarks.includes(q.id));

    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (questions.length === 0) {
        alert('選択した分野にブックマークされた問題はありません');
        return;
    }

    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    correctCount = 0;
    wrongInSession = [];
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuestions.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

// タイマー管理
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        remainingTime--;
        updateTimerDisplay();

        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            finishQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timer-text').textContent = display;

    const timerDisplay = document.getElementById('timer-display');
    if (remainingTime <= 60) {
        timerDisplay.classList.add('warning');
    } else {
        timerDisplay.classList.remove('warning');
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// 4択問題かどうかを判定
function isMultipleChoiceQuestion(questionText) {
    const pattern = /\n[1-4]\.\s/;
    return pattern.test(questionText);
}

// 4択問題のテキストと選択肢を分離
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

// 正解番号を抽出
function extractCorrectAnswer(answerText) {
    const patterns = [
        /【正解】(\d)/,
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

// 問題表示
function showQuestion() {
    const question = currentQuestions[currentIndex];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.questionNo || (currentIndex + 1);
    document.getElementById('session-badge').textContent = question.type || '問題';
    document.getElementById('correct-count').textContent = correctCount;

    const questionText = document.getElementById('question-text');
    const choicesContainer = document.getElementById('choices');

    // 4択問題かどうか判定
    if (isMultipleChoiceQuestion(question.question) && !isFlashcardMode) {
        const parsed = parseMultipleChoiceQuestion(question.question);
        questionText.innerHTML = formatText(parsed.questionBody);

        choicesContainer.innerHTML = '';
        choicesContainer.classList.remove('hidden');

        parsed.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.innerHTML = `
                <span class="choice-number">${choice.number}</span>
                <span class="choice-text">${formatText(choice.text)}</span>
            `;
            btn.onclick = () => selectChoice(choice.number);
            choicesContainer.appendChild(btn);
        });

        document.getElementById('show-answer-btn').classList.add('hidden');
        document.getElementById('flashcard-controls').classList.add('hidden');
    } else {
        // フラッシュカードモード
        questionText.innerHTML = formatText(question.question);
        choicesContainer.innerHTML = '';
        choicesContainer.classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');
        document.getElementById('flashcard-controls').classList.add('hidden');
    }

    // 進捗バー更新
    const progress = (currentIndex / currentQuestions.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    // 解答セクションを隠す
    document.getElementById('answer-section').classList.add('hidden');
    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');

    // ブックマークボタン更新
    updateBookmarkButton();
}

// 選択肢を選んだ時の処理
function selectChoice(selectedNumber) {
    const question = currentQuestions[currentIndex];
    const correctAnswer = extractCorrectAnswer(question.answer);
    const isCorrect = selectedNumber === correctAnswer;

    userAnswers.push({
        questionId: question.id,
        selected: selectedNumber,
        correct: correctAnswer,
        isCorrect: isCorrect
    });

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, isCorrect);

    // 全ての選択肢ボタンを無効化し、正解/不正解を表示
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        const btnNumber = index + 1;
        btn.classList.add('disabled');
        btn.onclick = null;

        if (btnNumber === correctAnswer) {
            btn.classList.add('correct');
        } else if (btnNumber === selectedNumber && !isCorrect) {
            btn.classList.add('wrong');
        }

        if (btnNumber === selectedNumber) {
            btn.classList.add('selected');
        }
    });

    // フィードバック表示
    const feedback = document.getElementById('result-feedback');
    feedback.classList.remove('hidden', 'correct', 'wrong');

    if (isCorrect) {
        feedback.classList.add('correct');
        feedback.innerHTML = `
            <div class="feedback-icon">&#9711;</div>
            <div class="feedback-text">正解!</div>
        `;
        correctCount++;
        removeWrongAnswer(question.id);
    } else {
        feedback.classList.add('wrong');
        feedback.innerHTML = `
            <div class="feedback-icon">&#10005;</div>
            <div class="feedback-text">不正解</div>
            <div class="correct-answer">正解は ${correctAnswer !== null && correctAnswer !== undefined ? correctAnswer : '(データなし)'} です</div>
        `;
        wrongInSession.push(question.id);
        saveWrongAnswer(question.id);
    }

    document.getElementById('correct-count').textContent = correctCount;

    // 解説を表示
    showExplanation(question.answer);

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

    document.getElementById('next-btn').classList.remove('hidden');
}

// 解答表示（フラッシュカードモード用）
function showAnswer() {
    const question = currentQuestions[currentIndex];
    showExplanation(question.answer);
    document.getElementById('show-answer-btn').classList.add('hidden');
    document.getElementById('flashcard-controls').classList.remove('hidden');
}

// 解説のフォーマットと表示
function formatExplanation(text) {
    if (!text) return '';

    let formatted = text;

    // 【正解】セクションを検出してスタイリング
    formatted = formatted.replace(/【正解】([^\n【]*)/g,
        '<div class="explanation-section correct-section"><span class="explanation-label">【正解】</span>$1</div>');

    // 【解説】セクションを検出してスタイリング
    formatted = formatted.replace(/【解説】/g,
        '<div class="explanation-section explanation-detail"><span class="explanation-label">【解説】</span>');

    // 解説セクションの終了タグを追加（次のセクションまたは終端まで）
    if (formatted.includes('explanation-detail')) {
        formatted = formatted.replace(/(<div class="explanation-section explanation-detail">.*?)$/s, '$1</div>');
    }

    // 残りのテキストをフォーマット
    formatted = formatted
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

    return formatted;
}

function showExplanation(answerText) {
    const answerEl = document.getElementById('answer-text');
    answerEl.innerHTML = formatExplanation(answerText);
    document.getElementById('answer-section').classList.remove('hidden');
}

function formatText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

// フラッシュカードの評価
function markCorrect() {
    const question = currentQuestions[currentIndex];

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, true);

    correctCount++;
    removeWrongAnswer(question.id);
    userAnswers.push({
        questionId: question.id,
        isCorrect: true
    });
    document.getElementById('correct-count').textContent = correctCount;
    nextQuestion();
}

function markWrong() {
    const question = currentQuestions[currentIndex];

    // 分野別統計を更新
    updateCategoryStatsOnAnswer(question, false);

    wrongInSession.push(question.id);
    saveWrongAnswer(question.id);
    userAnswers.push({
        questionId: question.id,
        isCorrect: false
    });
    nextQuestion();
}

// 次の問題へ
function nextQuestion() {
    currentIndex++;
    if (currentIndex >= currentQuestions.length) {
        finishQuiz();
    } else {
        showQuestion();
    }
}

// 合格ライン（建設業経理士: 70%）
const PASS_LINE = 70;

// クイズ終了
function finishQuiz() {
    stopTimer();

    const total = currentQuestions.length;
    const score = Math.round((correctCount / total) * 100);

    saveStats(correctCount, total);
    updateStatsDisplay();
    updateWrongCount();

    document.getElementById('final-score').textContent = score;
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-total').textContent = total;
    document.getElementById('result-rate').textContent = score;
    document.getElementById('wrong-in-session').textContent = wrongInSession.length;

    // 合格ライン比較表示
    const passLineComparison = document.getElementById('pass-line-comparison');
    if (passLineComparison) {
        const isPassed = score >= PASS_LINE;
        passLineComparison.innerHTML = `
            <div class="pass-line-display ${isPassed ? 'passed' : 'failed'}">
                <span class="pass-line-label">合格ライン: ${PASS_LINE}%</span>
                <span class="pass-line-separator">/</span>
                <span class="your-score-label">あなた: ${score}%</span>
                <span class="pass-result-badge">${isPassed ? '合格' : '不合格'}</span>
            </div>
        `;
    }

    const messageEl = document.getElementById('result-message');
    messageEl.className = 'result-message';

    if (score >= 90) {
        messageEl.classList.add('excellent');
        messageEl.textContent = '素晴らしい！完璧な成績です！';
    } else if (score >= PASS_LINE) {
        messageEl.classList.add('good');
        messageEl.textContent = 'よくできました！合格ラインクリア！';
    } else if (score >= 50) {
        messageEl.classList.add('pass');
        messageEl.textContent = 'もう少しです。復習して再挑戦しましょう！';
    } else {
        messageEl.classList.add('fail');
        messageEl.textContent = '基礎からしっかり復習しましょう。';
    }

    // 苦手分野分析を表示
    displayWeakCategoryAnalysis();

    showScreen('result-screen');
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

// 解答確認
function reviewAnswers() {
    const reviewList = document.getElementById('review-list');
    reviewList.innerHTML = '';

    userAnswers.forEach((answer, index) => {
        const question = quizData.find(q => q.id === answer.questionId);
        if (!question) return;

        const div = document.createElement('div');
        div.className = `review-item ${answer.isCorrect ? 'correct' : 'wrong'}`;
        div.dataset.correct = answer.isCorrect;

        const questionPreview = question.question.substring(0, 100) + (question.question.length > 100 ? '...' : '');

        div.innerHTML = `
            <div class="review-item-header">
                <span class="review-item-number">問${index + 1}</span>
                <span class="review-item-status ${answer.isCorrect ? 'correct' : 'wrong'}">
                    ${answer.isCorrect ? '正解' : '不正解'}
                </span>
            </div>
            <div class="review-item-question">${formatText(questionPreview)}</div>
            ${answer.selected !== undefined ? `
            <div class="review-item-answer">
                あなたの解答: <span class="your-answer">${answer.selected}</span>
                ${!answer.isCorrect ? `/ 正解: <span class="correct-ans">${answer.correct}</span>` : ''}
            </div>
            ` : ''}
        `;

        reviewList.appendChild(div);
    });

    showScreen('review-screen');
}

function filterReview(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(filter === 'all' ? '全て' : filter === 'wrong' ? '不正解' : '正解')) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.review-item').forEach(item => {
        const isCorrect = item.dataset.correct === 'true';
        if (filter === 'all') {
            item.style.display = 'block';
        } else if (filter === 'wrong') {
            item.style.display = isCorrect ? 'none' : 'block';
        } else if (filter === 'correct') {
            item.style.display = isCorrect ? 'block' : 'none';
        }
    });
}

function goToResult() {
    showScreen('result-screen');
}

// もう一度挑戦
function restartQuiz() {
    if (currentMode.startsWith('timer-')) {
        startTimerMode(currentMode.replace('timer-', ''));
    } else if (currentMode === 'wrong-review') {
        startWrongReview();
    } else if (currentMode === 'bookmark') {
        startBookmarkStudy();
    } else {
        startQuiz(currentMode);
    }
}

// ブックマーク操作
function bookmarkCurrentQuestion() {
    const question = currentQuestions[currentIndex];
    if (question) {
        toggleBookmark(question.id);
        updateBookmarkButton();
        updateBookmarkCount();
    }
}

// 統計画面
function showStatsScreen() {
    const stats = getStats();
    const wrong = getWrongAnswers();

    document.getElementById('stats-total-attempts').textContent = stats.totalAttempts;
    document.getElementById('stats-total-questions').textContent = stats.totalQuestions;
    document.getElementById('stats-total-correct').textContent = stats.totalCorrect;

    const rate = stats.totalQuestions > 0
        ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
        : 0;
    document.getElementById('stats-overall-rate').textContent = rate + '%';

    // 苦手な問題TOP10
    const weakList = document.getElementById('weak-questions-list');
    weakList.innerHTML = '';

    const wrongEntries = Object.entries(wrong)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    if (wrongEntries.length === 0) {
        weakList.innerHTML = '<p class="no-data">苦手な問題はありません</p>';
    } else {
        wrongEntries.forEach(([id, data]) => {
            const question = quizData.find(q => q.id === id);
            if (!question) return;

            const div = document.createElement('div');
            div.className = 'weak-item';
            div.innerHTML = `
                <div class="weak-item-header">
                    <span class="weak-item-number">${question.type || '問題'}</span>
                    <span class="weak-item-count">間違い: ${data.count}回</span>
                </div>
                <div class="weak-item-question">${question.question.substring(0, 80)}...</div>
            `;
            weakList.appendChild(div);
        });
    }

    // 学習履歴
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    const recentSessions = stats.sessions.slice(-10).reverse();

    if (recentSessions.length === 0) {
        historyList.innerHTML = '<p class="no-data">学習履歴はありません</p>';
    } else {
        recentSessions.forEach(session => {
            const date = new Date(session.date);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            const rate = Math.round((session.correct / session.total) * 100);

            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <span class="history-date">${dateStr}</span>
                <span class="history-mode">${session.mode || '通常'}</span>
                <span class="history-score">${session.correct}/${session.total}</span>
                <span class="history-rate ${rate >= 70 ? 'good' : rate >= 50 ? 'pass' : 'fail'}">${rate}%</span>
            `;
            historyList.appendChild(div);
        });
    }

    // 分野別統計を更新
    updateCategoryStatsDisplay();

    showScreen('stats-screen');
}

// データリセット
function resetAllData() {
    const currentUser = UserManager.getCurrentUser();
    if (confirm(`${currentUser}さんの学習データをリセットしますか？\n（間違い記録、統計、ブックマーク、分野別統計が削除されます）`)) {
        UserManager.removeUserData(STORAGE_BASE_KEYS.wrongAnswers);
        UserManager.removeUserData(STORAGE_BASE_KEYS.stats);
        UserManager.removeUserData(STORAGE_BASE_KEYS.bookmarks);
        UserManager.removeUserData(STORAGE_BASE_KEYS.history);
        UserManager.removeUserData(STORAGE_BASE_KEYS.categoryStats);

        updateStatsDisplay();
        updateWrongCount();
        updateBookmarkCount();
        updateCategoryStatsDisplay();
        alert('データをリセットしました');
        goHome();
    }
}

// ナビゲーション
function goHome() {
    stopTimer();
    updateStatsDisplay();
    updateWrongCount();
    updateBookmarkCount();
    updateCategoryStatsDisplay();
    showScreen('start-screen');
}

// ユーティリティ
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
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
        '試験日を入力してください (例: 2025-09-14)\n\n' +
        '【建設業経理士 試験日目安】\n' +
        '・9月試験: 9月第2日曜日\n' +
        '・3月試験: 3月第2日曜日',
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

// デフォルトの試験日を取得（次の9月or3月第2日曜日）
function getDefaultExamDate() {
    const today = new Date();
    let year = today.getFullYear();

    // 次の試験日を計算（9月または3月）
    let sept = getSecondSunday(year, 9);
    let march = getSecondSunday(year + 1, 3);

    if (sept > today) {
        return formatDate(sept);
    } else if (march > today) {
        return formatDate(march);
    } else {
        return formatDate(getSecondSunday(year + 1, 9));
    }
}

// 指定月の第2日曜日を取得
function getSecondSunday(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const firstSunday = 1 + (7 - firstDay.getDay()) % 7;
    return new Date(year, month - 1, firstSunday + 7);
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

    const answerSection = document.getElementById('answer-section');
    const isAnswerVisible = answerSection && !answerSection.classList.contains('hidden');
    const choicesContainer = document.getElementById('choices');
    const isQuizMode = choicesContainer && !choicesContainer.classList.contains('hidden') && choicesContainer.children.length > 0;
    const flashcardControls = document.getElementById('flashcard-controls');
    const isFlashcardControlsVisible = flashcardControls && !flashcardControls.classList.contains('hidden');

    switch (e.key) {
        case ' ':
        case 'Enter':
            e.preventDefault();
            if (!isAnswerVisible && !isQuizMode) {
                showAnswer();
            } else if (isAnswerVisible && !isFlashcardControlsVisible) {
                nextQuestion();
            }
            break;
        case '1':
        case '2':
        case '3':
        case '4':
            if (isQuizMode && !isAnswerVisible) {
                e.preventDefault();
                selectChoice(parseInt(e.key));
            }
            break;
        case 'ArrowRight':
        case 'o':
        case 'O':
            e.preventDefault();
            if (isFlashcardControlsVisible) {
                markCorrect();
            } else if (isAnswerVisible) {
                nextQuestion();
            }
            break;
        case 'ArrowLeft':
        case 'x':
        case 'X':
            e.preventDefault();
            if (isFlashcardControlsVisible) {
                markWrong();
            }
            break;
        case 'b':
        case 'B':
            e.preventDefault();
            bookmarkCurrentQuestion();
            break;
        case 'Escape':
            e.preventDefault();
            goHome();
            break;
    }
});
