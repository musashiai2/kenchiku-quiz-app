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

// LocalStorage キー基底 (宅建用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    wrongAnswers: 'wrong_takken',
    stats: 'stats_takken',
    bookmarks: 'bookmarks_takken',
    history: 'history_takken',
    categoryStats: 'category_stats_takken'
};

// ダークモードは共通設定
const DARK_MODE_KEY = 'quiz_dark_mode';

// 試験日カウントダウン用キー（宅建）
const EXAM_DATE_KEY = 'exam_date_takken';

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
    // 最新50セッションのみ保持
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
    // 最新20回分のみ保持
    if (history.length > 20) {
        history.shift();
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.history, history);
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

// 画面切り替え
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

// 統計表示を更新
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

// 間違い数表示を更新
function updateWrongCountDisplay() {
    const wrongAnswers = getWrongAnswers();
    const count = Object.keys(wrongAnswers).length;
    const el = document.getElementById('wrong-count');
    if (el) {
        el.textContent = count + '問';
    }

    // 復習ボタンの有効/無効
    const reviewBtn = document.getElementById('review-wrong-btn');
    if (reviewBtn) {
        reviewBtn.disabled = count === 0;
        reviewBtn.style.opacity = count === 0 ? '0.5' : '1';
    }
}

// ブックマーク数表示を更新
function updateBookmarkCountDisplay() {
    const bookmarks = getBookmarks();
    const el = document.getElementById('bookmark-count');
    if (el) {
        el.textContent = bookmarks.length + '問';
    }

    // ブックマーク学習ボタンの有効/無効
    const bookmarkBtn = document.getElementById('study-bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.disabled = bookmarks.length === 0;
        bookmarkBtn.style.opacity = bookmarks.length === 0 ? '0.5' : '1';
    }
}

// ブックマークボタン更新
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

// クイズ開始
function startQuiz(mode, withTimer = false) {
    studyMode = mode;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    isTimerMode = withTimer;

    let questions = [...quizData];

    // 分野フィルタ
    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    // モードに応じて問題を選択
    switch (mode) {
        case 'all':
            currentQuestions = questions;
            break;
        case 'random':
            currentQuestions = shuffleArray(questions).slice(0, 20);
            break;
        case 'wrong':
            const wrongAnswers = getWrongAnswers();
            const wrongIds = Object.keys(wrongAnswers).map(id => parseInt(id));
            currentQuestions = questions.filter(q => wrongIds.includes(q.id));
            // 間違い回数が多い順にソート
            currentQuestions.sort((a, b) => {
                return (wrongAnswers[b.id]?.count || 0) - (wrongAnswers[a.id]?.count || 0);
            });
            break;
        case 'bookmark':
            const bookmarks = getBookmarks();
            currentQuestions = questions.filter(q => bookmarks.includes(q.id));
            break;
    }

    if (currentQuestions.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    document.getElementById('total-num').textContent = currentQuestions.length;

    // タイマーモードの設定
    if (isTimerMode) {
        // 1問あたり約2分で計算
        timeRemaining = currentQuestions.length * 120;
        document.getElementById('timer-display').classList.remove('hidden');
        startTimer();
    } else {
        document.getElementById('timer-display').classList.add('hidden');
    }

    showScreen('quiz-screen');
    displayQuestion();
}

// 旧API互換性
function startStudy(mode) {
    startQuiz(mode, false);
}

// タイマー開始
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

// タイマー表示更新
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

    // 残り時間が少なくなったら警告色
    const timerDisplay = document.getElementById('timer-display');
    if (timeRemaining <= 60) {
        timerDisplay.classList.add('warning');
    } else {
        timerDisplay.classList.remove('warning');
    }
}

// 配列シャッフル
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
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

// テキストをフォーマット
function formatText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

// 解説をフォーマット（【正解】【解説】を見やすく整形）
function formatExplanation(text) {
    if (!text) return '';

    let formatted = text;

    // 【正解】を強調表示
    formatted = formatted.replace(/【正解】/g, '<div class="explanation-section correct-section"><span class="section-label correct-label">【正解】</span>');
    formatted = formatted.replace(/【解説】/g, '</div><div class="explanation-section explanation-detail"><span class="section-label explanation-label">【解説】</span>');

    // 正解: X の形式も整形
    formatted = formatted.replace(/正解[：:]\s*(\d)/g, '<strong class="correct-answer-text">正解: $1</strong>');

    // 改行とタブの処理
    formatted = formatted
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

    // 閉じタグがない場合は追加
    if (formatted.includes('explanation-section') && !formatted.endsWith('</div>')) {
        formatted += '</div>';
    }

    return formatted;
}

// 問題表示
function displayQuestion() {
    const question = currentQuestions[currentIndex];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.questionNo || question.id;
    document.getElementById('correct-count').textContent = correctCount;

    // プログレスバー更新
    const progress = ((currentIndex) / currentQuestions.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    // ブックマークボタン更新
    updateBookmarkButton(question.id);

    const questionText = document.getElementById('question-text');
    const choicesContainer = document.getElementById('choices');

    // 分野バッジ更新
    const sessionBadge = document.getElementById('session-badge');
    if (sessionBadge) {
        sessionBadge.textContent = question.type || '問題';
    }

    // 4択問題かどうか判定
    if (isMultipleChoiceQuestion(question.question)) {
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
            btn.onclick = () => selectAnswer(choice.number, true);
            choicesContainer.appendChild(btn);
        });

        // 解答表示ボタンを隠す
        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) {
            showAnswerBtn.classList.add('hidden');
        }
    } else {
        questionText.innerHTML = formatText(question.question);
        choicesContainer.innerHTML = '';
        choicesContainer.classList.add('hidden');

        // フラッシュカードモードでは「解答を表示」ボタンを表示
        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) {
            showAnswerBtn.classList.remove('hidden');
        }
    }

    // フィードバックとボタン非表示
    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');

    // フラッシュカードコントロールを隠す
    const flashcardControls = document.getElementById('flashcard-controls');
    if (flashcardControls) {
        flashcardControls.classList.add('hidden');
    }

    // 解答セクションを隠す
    const answerSection = document.getElementById('answer-section');
    if (answerSection) {
        answerSection.classList.add('hidden');
    }
}

// 解答を表示（フラッシュカードモード用）
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

// フラッシュカード：わかった
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

// フラッシュカード：難しい
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

// 回答選択
function selectAnswer(selected, isQuizMode = false) {
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

    // 選択肢のスタイル更新
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        btn.classList.add('disabled');
        btn.onclick = null;

        if (index + 1 === correctAnswer) {
            btn.classList.add('correct');
        } else if (index + 1 === selected && !isCorrect) {
            btn.classList.add('wrong');
        }

        if (index + 1 === selected) {
            btn.classList.add('selected');
        }
    });

    // フィードバック表示
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

    // 解説を表示
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

    // 次へボタン表示
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

// 次の問題
function nextQuestion() {
    currentIndex++;

    // フラッシュカードコントロールを隠す
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

// 合格ライン（宅建: 70%）
const PASS_LINE = 70;

// 結果表示
function showResult() {
    // タイマー停止
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const total = currentQuestions.length;
    const rate = Math.round((correctCount / total) * 100);

    // 統計保存
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

    // メッセージ設定
    const messageEl = document.getElementById('result-message');
    messageEl.className = 'result-message';

    if (rate >= 90) {
        messageEl.classList.add('excellent');
        messageEl.textContent = '素晴らしい！ほぼ完璧です！';
    } else if (rate >= PASS_LINE) {
        messageEl.classList.add('good');
        messageEl.textContent = '良い成績です！合格ラインクリア！';
    } else if (rate >= 60) {
        messageEl.classList.add('pass');
        messageEl.textContent = 'もう少しで合格ライン！頑張りましょう！';
    } else {
        messageEl.classList.add('fail');
        messageEl.textContent = '復習が必要です。繰り返し学習しましょう！';
    }

    // 間違えた問題の数を表示
    const wrongCount = userAnswers.filter(a => !a.isCorrect).length;
    document.getElementById('wrong-in-session').textContent = wrongCount;

    // 苦手分野分析を表示
    displayWeakCategoryAnalysis();

    showScreen('result-screen');
    window.scrollTo(0, 0);
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
    displayReviewList('all');
    showScreen('review-screen');
    window.scrollTo(0, 0);
}

// レビューリスト表示
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

// フィルター切り替え
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

    // 全体統計
    document.getElementById('stats-total-attempts').textContent = stats.totalAttempts;
    document.getElementById('stats-total-questions').textContent = stats.totalQuestions;
    document.getElementById('stats-total-correct').textContent = stats.totalCorrect;

    const overallRate = stats.totalQuestions > 0
        ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
        : 0;
    document.getElementById('stats-overall-rate').textContent = overallRate + '%';

    // 苦手問題リスト
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

    // 学習履歴グラフ
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
        'wrong': '復習',
        'bookmark': 'ブックマーク',
        'weak_area': '苦手分野'
    };
    return labels[mode] || mode;
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

// 復習モード（間違えた問題）
function startWrongReview() {
    startQuiz('wrong', false);
}

// ブックマーク学習
function startBookmarkStudy() {
    startQuiz('bookmark', false);
}

// タイマーモード開始
function startTimerMode(mode) {
    startQuiz(mode, true);
}

// ブックマーク追加（クイズ中）
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
        '試験日を入力してください (例: 2025-10-19)\n\n' +
        '【宅建試験 試験日目安】\n' +
        '・試験日: 10月第3日曜日',
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

// デフォルトの試験日を取得（次の10月第3日曜日）
function getDefaultExamDate() {
    const today = new Date();
    let year = today.getFullYear();
    let examDate = getThirdSunday(year, 10);
    if (examDate < today) {
        examDate = getThirdSunday(year + 1, 10);
    }
    return formatDate(examDate);
}

// 指定月の第3日曜日を取得
function getThirdSunday(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const firstSunday = 1 + (7 - firstDay.getDay()) % 7;
    return new Date(year, month - 1, firstSunday + 14);
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
    // クイズ画面でのみ有効
    const quizScreen = document.getElementById('quiz-screen');
    if (!quizScreen || !quizScreen.classList.contains('active')) return;

    // 選択肢が無効化されているか確認
    const choiceButtons = document.querySelectorAll('.choice-btn');
    const isAnswered = choiceButtons.length > 0 && choiceButtons[0].classList.contains('disabled');
    const isQuizMode = choiceButtons.length > 0 && !document.getElementById('choices').classList.contains('hidden');

    // 解答セクションの表示状態
    const answerSection = document.getElementById('answer-section');
    const isAnswerVisible = answerSection && !answerSection.classList.contains('hidden');

    // 1-4キーで回答選択（回答前のみ、クイズモード）
    if (!isAnswered && isQuizMode && ['1', '2', '3', '4'].includes(e.key)) {
        const choiceIndex = parseInt(e.key);
        if (choiceIndex <= choiceButtons.length) {
            selectAnswer(choiceIndex, true);
        }
    }

    // スペースキーで解答表示（フラッシュカードモード）
    if (!isQuizMode && !isAnswerVisible && e.key === ' ') {
        e.preventDefault();
        showAnswer();
    }

    // Enterキーまたはスペースキーで次へ（回答後のみ）
    if ((isAnswered || isAnswerVisible) && (e.key === 'Enter' || (isQuizMode && e.key === ' '))) {
        e.preventDefault();
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) {
            nextBtn.click();
        } else if (!isQuizMode && isAnswerVisible) {
            // フラッシュカードモードで解答表示中
        }
    }

    // フラッシュカードモード: ArrowRight/O でわかった
    if (!isQuizMode && isAnswerVisible && (e.key === 'ArrowRight' || e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        markCorrect();
    }

    // フラッシュカードモード: ArrowLeft/X で難しい
    if (!isQuizMode && isAnswerVisible && (e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        markWrong();
    }

    // Bキーでブックマーク
    if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        bookmarkCurrentQuestion();
    }

    // Escapeキーでホームに戻る
    if (e.key === 'Escape') {
        e.preventDefault();
        goHome();
    }
});
