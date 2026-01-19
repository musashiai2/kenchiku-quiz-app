// アプリケーション状態
let currentQuiz = [];
let currentIndex = 0;
let correctCount = 0;
let userAnswers = [];
let quizMode = 'all';
let timerInterval = null;
let timeRemaining = 0;
let isTimerMode = false;
let isMockExamMode = false;
let mockExamStartTime = null;
let mockExamType = null; // 'am' or 'pm'
let isWrongReviewMode = false;  // 復習モードフラグ
let wrongAnswersData = {};      // 復習時の間違い履歴データ

// 本番形式模擬試験の設定
const MOCK_EXAM_CONFIG = {
    am: {
        questionCount: 44,
        timeLimit: 150 * 60, // 2時間30分 = 150分 = 9000秒
        startQuestion: 1,
        endQuestion: 44,
        name: '午前の部'
    },
    pm: {
        questionCount: 28,
        timeLimit: 120 * 60, // 2時間 = 120分 = 7200秒
        startQuestion: 45,
        endQuestion: 72,
        name: '午後の部'
    }
};
const PASS_RATE = 60; // 合格ライン60%

// LocalStorage キー基底 (令和2年度用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    wrongAnswers: 'wrong_r2',
    stats: 'stats_r2',
    bookmarks: 'bookmarks_r2',
    history: 'history_r2',
    adaptiveLearning: 'adaptive_r2'
};

// 適応型学習の設定
const ADAPTIVE_CONFIG = {
    consecutiveCorrectToMaster: 3,
    masterCooldownDays: 7,
    wrongPriorityWeight: 3,
    recentWrongBoost: 2,
    recentWrongDays: 3
};

// ダークモードは共通設定
const DARK_MODE_KEY = 'quiz_dark_mode';

// 試験日カウントダウン用キー（1級建築施工管理技士共通）
const EXAM_DATE_KEY = 'exam_date_sekoukanri1';

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
    // ダークモード復元
    const darkMode = localStorage.getItem(DARK_MODE_KEY) === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        updateDarkModeButton();
    }

    // 統計情報を更新
    updateStatsDisplay();
    updateWrongCountDisplay();
    updateBookmarkCountDisplay();

    // 試験日カウントダウン初期化
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
    updateAdaptiveLearning(questionId, true);
}

// =====================
// 適応型学習システム
// =====================

function getAdaptiveLearning() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.adaptiveLearning, {});
}

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
        if (data.consecutiveCorrect >= ADAPTIVE_CONFIG.consecutiveCorrectToMaster) {
            data.masteredAt = new Date().toISOString();
        }
    } else {
        data.consecutiveCorrect = 0;
        data.masteredAt = null;
    }
    UserManager.setUserData(STORAGE_BASE_KEYS.adaptiveLearning, adaptive);
}

function isQuestionMastered(questionId) {
    const adaptive = getAdaptiveLearning();
    const data = adaptive[questionId];
    if (!data || !data.masteredAt) return false;
    const masteredDate = new Date(data.masteredAt);
    const cooldownEnd = new Date(masteredDate);
    cooldownEnd.setDate(cooldownEnd.getDate() + ADAPTIVE_CONFIG.masterCooldownDays);
    return new Date() < cooldownEnd;
}

function calculateQuestionPriority(question) {
    const wrongAnswers = getWrongAnswers();
    const adaptive = getAdaptiveLearning();
    let score = 100;
    const questionId = question.id;
    const wrongData = wrongAnswers[questionId];
    const adaptiveData = adaptive[questionId];

    if (wrongData) {
        score += wrongData.count * ADAPTIVE_CONFIG.wrongPriorityWeight * 10;
        if (wrongData.lastWrong) {
            const daysSinceWrong = (new Date() - new Date(wrongData.lastWrong)) / (1000 * 60 * 60 * 24);
            if (daysSinceWrong <= ADAPTIVE_CONFIG.recentWrongDays) {
                score += ADAPTIVE_CONFIG.recentWrongBoost * 20;
            }
        }
    }
    if (isQuestionMastered(questionId)) {
        score -= 80;
    }
    if (adaptiveData && adaptiveData.consecutiveCorrect > 0) {
        score -= adaptiveData.consecutiveCorrect * 10;
    }
    if (!adaptiveData || adaptiveData.totalAttempts === 0) {
        score += 20;
    }
    return score;
}

function selectQuestionsAdaptively(questions, count) {
    const scoredQuestions = questions.map(q => ({
        question: q,
        score: calculateQuestionPriority(q),
        random: Math.random()
    }));
    scoredQuestions.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) < 10) return a.random - b.random;
        return scoreDiff;
    });
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
        mode: quizMode,
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
        btn.innerHTML = isBookmarked ? '★' : '☆';
        btn.classList.toggle('active', isBookmarked);
        btn.title = isBookmarked ? 'ブックマーク解除' : 'ブックマークに追加';
    }
}

// =====================
// クイズ機能
// =====================

// クイズ開始
function startQuiz(mode, withTimer = false) {
    quizMode = mode;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    isTimerMode = withTimer;

    // モードに応じて問題を選択
    switch (mode) {
        case 'all':
            // 全問題モードでもシャッフル
            currentQuiz = shuffleArray([...quizData]);
            break;
        case 'am':
            currentQuiz = shuffleArray(quizData.filter(q => q.id <= 50));
            break;
        case 'pm':
            currentQuiz = shuffleArray(quizData.filter(q => q.id > 50));
            break;
        case 'random':
            // 適応型学習で賢く選択
            currentQuiz = selectQuestionsAdaptively([...quizData], 20);
            break;
        case 'smart':
            // スマート学習モード（苦手問題優先）
            currentQuiz = selectQuestionsAdaptively([...quizData], Math.min(30, quizData.length));
            break;
        case 'wrong':
            const wrongAnswers = getWrongAnswers();
            const wrongIds = Object.keys(wrongAnswers).map(id => parseInt(id));
            currentQuiz = quizData.filter(q => wrongIds.includes(q.id));
            // 間違い回数が多い順+最近間違えた順でソート後シャッフル
            currentQuiz.sort((a, b) => {
                const countDiff = (wrongAnswers[b.id]?.count || 0) - (wrongAnswers[a.id]?.count || 0);
                if (countDiff !== 0) return countDiff;
                const aDate = wrongAnswers[a.id]?.lastWrong ? new Date(wrongAnswers[a.id].lastWrong) : new Date(0);
                const bDate = wrongAnswers[b.id]?.lastWrong ? new Date(wrongAnswers[b.id].lastWrong) : new Date(0);
                return bDate - aDate;
            });
            // 上位50%をシャッフル
            const halfLength = Math.ceil(currentQuiz.length / 2);
            const topHalf = shuffleArray(currentQuiz.slice(0, halfLength));
            const bottomHalf = currentQuiz.slice(halfLength);
            currentQuiz = [...topHalf, ...bottomHalf];
            break;
        case 'bookmark':
            const bookmarks = getBookmarks();
            currentQuiz = shuffleArray(quizData.filter(q => bookmarks.includes(q.id)));
            break;
    }

    if (currentQuiz.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    document.getElementById('total-num').textContent = currentQuiz.length;

    // タイマーモードの設定
    if (isTimerMode) {
        // 1問あたり約2分で計算
        timeRemaining = currentQuiz.length * 120;
        document.getElementById('timer-display').classList.remove('hidden');
        startTimer();
    } else {
        document.getElementById('timer-display').classList.add('hidden');
    }

    showScreen('quiz-screen');
    displayQuestion();
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

// 現在の問題の選択肢マッピング（シャッフル対応）
let currentChoiceMapping = [];

// =====================
// 復習モード強化機能
// =====================

function displayWrongReviewBadge(question) {
    const existingBadge = document.getElementById('wrong-review-badge');
    if (existingBadge) existingBadge.remove();
    const existingHint = document.getElementById('review-hint');
    if (existingHint) existingHint.remove();

    if (!isWrongReviewMode) return;

    const wrongData = wrongAnswersData[question.id];
    if (!wrongData) return;

    const badge = document.createElement('div');
    badge.id = 'wrong-review-badge';
    badge.className = 'wrong-review-badge';

    const wrongCount = wrongData.count || 0;
    let urgencyClass = '', urgencyText = '';

    if (wrongCount >= 3) { urgencyClass = 'high-priority'; urgencyText = '要注意'; }
    else if (wrongCount >= 2) { urgencyClass = 'medium-priority'; urgencyText = '復習推奨'; }
    else { urgencyClass = 'low-priority'; urgencyText = '確認'; }

    badge.classList.add(urgencyClass);
    badge.innerHTML = `<span class="badge-icon">&#128270;</span><span class="badge-text">${urgencyText}: ${wrongCount}回間違い</span>`;

    const questionHeader = document.querySelector('.question-header') || document.querySelector('.quiz-header');
    if (questionHeader) questionHeader.appendChild(badge);

    displayReviewHint(question, wrongData);
}

function displayReviewHint(question, wrongData) {
    const hintContainer = document.createElement('div');
    hintContainer.id = 'review-hint';
    hintContainer.className = 'review-hint';

    const wrongCount = wrongData.count || 0;
    const lastWrong = wrongData.lastWrong ? new Date(wrongData.lastWrong) : null;

    let hintText = '', tipsList = [];

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

    let lastWrongText = '';
    if (lastWrong) {
        const diffDays = Math.floor((new Date() - lastWrong) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) lastWrongText = '今日間違えました';
        else if (diffDays === 1) lastWrongText = '昨日間違えました';
        else if (diffDays < 7) lastWrongText = `${diffDays}日前に間違えました`;
        else lastWrongText = `${Math.floor(diffDays / 7)}週間前に間違えました`;
    }

    hintContainer.innerHTML = `
        <div class="hint-header"><span class="hint-icon">&#128161;</span><span class="hint-title">復習ポイント</span></div>
        <div class="hint-content">
            <p class="hint-message">${hintText}</p>
            ${lastWrongText ? `<p class="hint-last-wrong">${lastWrongText}</p>` : ''}
            <ul class="hint-tips">${tipsList.map(tip => `<li>${tip}</li>`).join('')}</ul>
        </div>
    `;

    const questionText = document.getElementById('question-text');
    if (questionText && questionText.parentNode) questionText.parentNode.insertBefore(hintContainer, questionText);
}

function generateReviewAnalysis() {
    if (!isWrongReviewMode || userAnswers.length === 0) return null;

    const analysis = { totalReviewed: userAnswers.length, improved: 0, stillWrong: 0, frequentWrong: [], recommendations: [] };

    userAnswers.forEach(answer => {
        if (answer.isCorrect) {
            analysis.improved++;
        } else {
            analysis.stillWrong++;
            const wrongData = wrongAnswersData[answer.questionId];
            if (wrongData && wrongData.count >= 3) analysis.frequentWrong.push({ id: answer.questionId, count: wrongData.count });
        }
    });

    const improvementRate = Math.round((analysis.improved / analysis.totalReviewed) * 100);
    if (improvementRate >= 80) analysis.recommendations.push('素晴らしい改善です！この調子で学習を続けましょう。');
    else if (improvementRate >= 60) analysis.recommendations.push('良い進歩です。まだ間違える問題は重点的に復習しましょう。');
    else if (improvementRate >= 40) analysis.recommendations.push('まだ改善の余地があります。解説をよく読んで理解を深めましょう。');
    else analysis.recommendations.push('基礎からの復習が必要かもしれません。教科書も併せて確認しましょう。');

    if (analysis.frequentWrong.length > 0) analysis.recommendations.push(`問題${analysis.frequentWrong.map(q => q.id).join(', ')}は何度も間違えています。`);

    return analysis;
}

function displayReviewAnalysis() {
    const analysis = generateReviewAnalysis();
    if (!analysis) return;

    const container = document.getElementById('wrong-questions-list') || document.querySelector('.result-details');
    if (!container) return;

    const improvementRate = Math.round((analysis.improved / analysis.totalReviewed) * 100);
    const analysisHTML = `
        <div class="review-analysis">
            <div class="analysis-header"><span class="analysis-icon">&#128200;</span><span class="analysis-title">復習結果の分析</span></div>
            <div class="analysis-summary">
                <div class="summary-item improvement"><span class="summary-label">改善率</span><span class="summary-value ${improvementRate >= 70 ? 'good' : improvementRate >= 50 ? 'moderate' : 'needs-work'}">${improvementRate}%</span></div>
                <div class="summary-item"><span class="summary-label">正解（改善）</span><span class="summary-value">${analysis.improved}問</span></div>
                <div class="summary-item"><span class="summary-label">不正解（要継続）</span><span class="summary-value">${analysis.stillWrong}問</span></div>
            </div>
            ${analysis.frequentWrong.length > 0 ? `<div class="frequent-wrong-section"><div class="section-header"><span class="warning-icon">&#9888;</span><span>繰り返し間違える問題</span></div><ul class="frequent-wrong-list">${analysis.frequentWrong.map(q => `<li>問題 ${q.id} - ${q.count}回間違い</li>`).join('')}</ul></div>` : ''}
            <div class="recommendations-section"><div class="section-header"><span class="bulb-icon">&#128161;</span><span>学習アドバイス</span></div><ul class="recommendations-list">${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul></div>
        </div>
    `;
    container.insertAdjacentHTML('beforebegin', analysisHTML);
}

// 選択肢をシャッフルする関数
function shuffleChoices(choices) {
    const shuffled = choices.map((text, index) => ({
        originalIndex: index + 1,
        text: text
    }));
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 問題表示
function displayQuestion() {
    const question = currentQuiz[currentIndex];
    const choiceCount = question.choices.length;

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.id;
    document.getElementById('question-text').textContent = question.question;
    document.getElementById('correct-count').textContent = correctCount;

    // プログレスバー更新
    const progress = ((currentIndex) / currentQuiz.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    // ブックマークボタン更新
    updateBookmarkButton(question.id);

    // 問題タイプバッジを更新（四肢択一 or 五肢択一）
    updateQuestionTypeBadge(choiceCount);

    // 復習モード時の間違い回数バッジ表示
    displayWrongReviewBadge(question);

    // 選択肢をシャッフル
    const shuffledChoices = shuffleChoices(question.choices);
    currentChoiceMapping = shuffledChoices.map(c => c.originalIndex);

    // 選択肢表示
    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = '';

    // 5択の場合はクラスを追加
    if (choiceCount === 5) {
        choicesContainer.classList.add('five-choices');
    } else {
        choicesContainer.classList.remove('five-choices');
    }

    shuffledChoices.forEach((choice, displayIndex) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.innerHTML = `
            <span class="choice-number">${displayIndex + 1}</span>
            <span class="choice-text">${choice.text}</span>
        `;
        btn.dataset.originalIndex = choice.originalIndex;
        btn.onclick = () => selectAnswer(choice.originalIndex);
        choicesContainer.appendChild(btn);
    });

    // フィードバックとボタン非表示
    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
}

// 問題タイプバッジを更新
function updateQuestionTypeBadge(choiceCount) {
    let badge = document.getElementById('question-type-badge');

    // バッジが存在しない場合は作成
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'question-type-badge';
        badge.className = 'question-type-badge';
        const questionNumber = document.querySelector('.question-number');
        if (questionNumber) {
            questionNumber.appendChild(badge);
        }
    }

    // バッジのテキストとクラスを更新
    if (choiceCount === 5) {
        badge.textContent = '五肢択一';
        badge.className = 'question-type-badge five-choice';
    } else {
        badge.textContent = '四肢択一';
        badge.className = 'question-type-badge four-choice';
    }
}

// 回答選択
function selectAnswer(selected) {
    const question = currentQuiz[currentIndex];
    const isCorrect = selected === question.correct;

    userAnswers.push({
        questionId: question.id,
        question: question.question,
        choices: question.choices,
        userAnswer: selected,
        correctAnswer: question.correct,
        isCorrect: isCorrect
    });

    if (isCorrect) {
        correctCount++;
        document.getElementById('correct-count').textContent = correctCount;
        recordCorrectAnswer(question.id);
    } else {
        saveWrongAnswer(question.id);
    }

    // 選択肢のスタイル更新（シャッフル対応）
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn) => {
        btn.classList.add('disabled');
        btn.onclick = null;

        const originalIndex = parseInt(btn.dataset.originalIndex);

        // 正解の選択肢をハイライト
        if (originalIndex === question.correct) {
            btn.classList.add('correct');
        }
        // 間違いで選択した選択肢をハイライト
        if (originalIndex === selected && !isCorrect) {
            btn.classList.add('wrong');
        }
        // 選択した選択肢をマーク
        if (originalIndex === selected) {
            btn.classList.add('selected');
        }
    });

    // フィードバック表示
    const feedback = document.getElementById('result-feedback');
    feedback.classList.remove('hidden', 'correct-feedback', 'wrong-feedback');

    if (isCorrect) {
        feedback.classList.add('correct-feedback');
        document.getElementById('feedback-icon').textContent = '⭕';
        document.getElementById('feedback-text').textContent = '正解！';
        document.getElementById('correct-answer').textContent = '';
    } else {
        feedback.classList.add('wrong-feedback');
        document.getElementById('feedback-icon').textContent = '❌';
        document.getElementById('feedback-text').textContent = '不正解';
        document.getElementById('correct-answer').textContent =
            `正解は ${question.correct !== null && question.correct !== undefined ? question.correct : '(データなし)'} です`;
    }

    // 解説表示
    const explanationEl = document.getElementById('explanation');
    if (question.explanation) {
        explanationEl.innerHTML = `
            <div class="explanation-title">【解説】</div>
            <div class="explanation-content">${question.explanation}</div>
        `;
        explanationEl.classList.remove('hidden');
    } else {
        explanationEl.classList.add('hidden');
    }

    // 次へボタン表示
    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.remove('hidden');

    if (currentIndex === currentQuiz.length - 1) {
        nextBtn.textContent = '結果を見る →';
        nextBtn.onclick = showResult;
    } else {
        nextBtn.textContent = '次の問題へ →';
        nextBtn.onclick = nextQuestion;
    }
}

// 次の問題
function nextQuestion() {
    currentIndex++;
    displayQuestion();
    window.scrollTo(0, 0);
}

// 合格ライン（1級建築施工管理技士: 60%）
const PASS_LINE = 60;

// 結果表示
function showResult() {
    // タイマー停止
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const total = currentQuiz.length;
    const rate = Math.round((correctCount / total) * 100);

    // 統計保存
    saveStats(correctCount, total, quizMode);
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
    } else if (rate >= 70) {
        messageEl.classList.add('good');
        messageEl.textContent = '良い成績です！合格ラインクリア！';
    } else if (rate >= PASS_LINE) {
        messageEl.classList.add('pass');
        messageEl.textContent = '合格ラインクリア！さらに上を目指しましょう！';
    } else {
        messageEl.classList.add('fail');
        messageEl.textContent = '復習が必要です。繰り返し学習しましょう！';
    }

    // 間違えた問題の数を表示
    const wrongCount = userAnswers.filter(a => !a.isCorrect).length;
    document.getElementById('wrong-in-session').textContent = wrongCount;

    // 苦手分野分析を表示（問題番号ベース）
    displayWeakAnalysis();

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

// 苦手分野分析を結果画面に表示（午前/午後で分析）
function displayWeakAnalysis() {
    const container = document.getElementById('result-weak-analysis');
    if (!container) return;

    // 午前（1-50）と午後（51-100）で分けて正答率を計算
    const amQuestions = userAnswers.filter(a => a.questionId <= 50);
    const pmQuestions = userAnswers.filter(a => a.questionId > 50);

    const categoryResults = [];

    if (amQuestions.length > 0) {
        const amCorrect = amQuestions.filter(a => a.isCorrect).length;
        const amAccuracy = Math.round((amCorrect / amQuestions.length) * 100);
        categoryResults.push({
            name: '午前問題',
            correct: amCorrect,
            total: amQuestions.length,
            accuracy: amAccuracy
        });
    }

    if (pmQuestions.length > 0) {
        const pmCorrect = pmQuestions.filter(a => a.isCorrect).length;
        const pmAccuracy = Math.round((pmCorrect / pmQuestions.length) * 100);
        categoryResults.push({
            name: '午後問題',
            correct: pmCorrect,
            total: pmQuestions.length,
            accuracy: pmAccuracy
        });
    }

    // 正答率が低い順にソート
    categoryResults.sort((a, b) => a.accuracy - b.accuracy);

    // 苦手分野（正答率50%未満）を抽出
    const weakCategories = categoryResults.filter(c => c.accuracy < 50);

    container.innerHTML = '';

    if (categoryResults.length === 0) {
        container.innerHTML = '<p class="no-data-message">分析データがありません</p>';
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
                <strong>${weakNames}</strong>を重点的に学習しましょう
            </div>
        `;
        container.appendChild(adviceDiv);
    }

    // 分野別の正答率を表示
    const statsDiv = document.createElement('div');
    statsDiv.className = 'session-category-stats';

    categoryResults.forEach(category => {
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
                        ${isBookmarked ? '★' : '☆'}
                    </button>
                    <span class="review-item-status ${answer.isCorrect ? 'correct' : 'wrong'}">
                        ${answer.isCorrect ? '正解' : '不正解'}
                    </span>
                </div>
            </div>
            <div class="review-item-question">${questionPreview}</div>
            <div class="review-item-answer">
                ${!answer.isCorrect ? `<span class="your-answer">あなたの回答: ${answer.userAnswer}</span> / ` : ''}
                <span class="correct-ans">正解: ${answer.correctAnswer}</span>
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
        btn.innerHTML = isDark ? '☀️' : '🌙';
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

    // 学習履歴グラフ（シンプルなテキスト表示）
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

    showScreen('stats-screen');
}

function getModeLabel(mode) {
    const labels = {
        'all': '全問題',
        'am': '午前',
        'pm': '午後',
        'random': 'ランダム',
        'smart': 'スマート学習',
        'wrong': '復習',
        'bookmark': 'ブックマーク'
    };
    return labels[mode] || mode;
}

// データリセット
function resetAllData() {
    const currentUser = UserManager.getCurrentUser();
    if (confirm(`${currentUser}さんの学習データをリセットしますか？\n（間違い記録、統計、ブックマーク、適応型学習データが削除されます）`)) {
        UserManager.removeUserData(STORAGE_BASE_KEYS.wrongAnswers);
        UserManager.removeUserData(STORAGE_BASE_KEYS.stats);
        UserManager.removeUserData(STORAGE_BASE_KEYS.bookmarks);
        UserManager.removeUserData(STORAGE_BASE_KEYS.history);
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
    startQuiz(quizMode, isTimerMode);
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
    isWrongReviewMode = true;
    wrongAnswersData = getWrongAnswers();
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
    const question = currentQuiz[currentIndex];
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
        '試験日を入力してください (例: 2025-06-08)\n\n' +
        '【1級建築施工管理技士 試験日目安】\n' +
        '・一次検定: 6月第2日曜日\n' +
        '・二次検定: 10月第3日曜日',
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

// デフォルトの試験日を取得（次の6月第2日曜日）
function getDefaultExamDate() {
    const today = new Date();
    let year = today.getFullYear();

    // 6月を基準に次の試験日を計算
    let examDate = getSecondSunday(year, 6);

    // 既に過ぎていたら来年
    if (examDate < today) {
        examDate = getSecondSunday(year + 1, 6);
    }

    return formatDate(examDate);
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

        // 日付を表示用にフォーマット
        const displayDate = new Date(dateStr);
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        dateEl.textContent = displayDate.toLocaleDateString('ja-JP', options);

        // 残り日数に応じてクラスを変更
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

    // 1-5キーで回答選択（回答前のみ）
    if (!isAnswered && ['1', '2', '3', '4', '5'].includes(e.key)) {
        const choiceIndex = parseInt(e.key);
        if (choiceIndex <= choiceButtons.length) {
            selectAnswer(choiceIndex);
        }
    }

    // Enterキーまたはスペースキーで次へ（回答後のみ）
    if (isAnswered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) {
            nextBtn.click();
        }
    }
});

// =====================
// 本番形式模擬試験
// =====================

// 模擬試験開始
function startMockExam(type) {
    const config = MOCK_EXAM_CONFIG[type];
    if (!config) {
        alert('無効な試験タイプです');
        return;
    }

    // 確認ダイアログ
    const confirmMsg = `【${config.name}】\n\n` +
        `問題数: ${config.questionCount}問\n` +
        `制限時間: ${Math.floor(config.timeLimit / 60)}分\n` +
        `合格ライン: ${PASS_RATE}%以上\n\n` +
        `本番形式で開始しますか？\n` +
        `※途中で中断すると記録されません`;

    if (!confirm(confirmMsg)) {
        return;
    }

    // 模擬試験モードを設定
    isMockExamMode = true;
    mockExamType = type;
    mockExamStartTime = new Date();
    quizMode = 'mock_' + type;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];
    isTimerMode = true;

    // 問題を選択（問題IDの範囲で選択）
    currentQuiz = quizData.filter(q =>
        q.id >= config.startQuestion && q.id <= config.endQuestion
    );

    // 問題数が足りない場合は警告
    if (currentQuiz.length < config.questionCount) {
        console.warn(`問題数が不足しています: ${currentQuiz.length}/${config.questionCount}`);
    }

    // 問題数を制限
    currentQuiz = currentQuiz.slice(0, config.questionCount);

    if (currentQuiz.length === 0) {
        alert('該当する問題がありません');
        isMockExamMode = false;
        return;
    }

    document.getElementById('total-num').textContent = currentQuiz.length;

    // タイマー設定
    timeRemaining = config.timeLimit;
    document.getElementById('timer-display').classList.remove('hidden');
    startTimer();

    showScreen('quiz-screen');
    displayQuestion();
}

// 結果表示（模擬試験用の拡張）
function showMockExamResult() {
    const total = currentQuiz.length;
    const rate = Math.round((correctCount / total) * 100);
    const isPassed = rate >= PASS_RATE;
    const config = MOCK_EXAM_CONFIG[mockExamType];

    // 模擬試験結果表示
    const mockExamResultEl = document.getElementById('mock-exam-result');
    const passFailBadge = document.getElementById('pass-fail-badge');
    const passFailText = document.getElementById('pass-fail-text');
    const timeInfoEl = document.getElementById('mock-exam-time-info');

    if (mockExamResultEl) {
        mockExamResultEl.classList.remove('hidden');

        // 合否判定
        if (isPassed) {
            passFailBadge.className = 'pass-fail-badge passed';
            passFailText.textContent = '合格';
        } else {
            passFailBadge.className = 'pass-fail-badge failed';
            passFailText.textContent = '不合格';
        }

        // 所要時間計算
        const endTime = new Date();
        const elapsedMs = endTime - mockExamStartTime;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

        // 残り時間または経過時間を表示
        if (timeRemaining > 0) {
            const remainMinutes = Math.floor(timeRemaining / 60);
            const remainSeconds = timeRemaining % 60;
            timeInfoEl.innerHTML = `
                <strong>${config.name}</strong><br>
                所要時間: ${elapsedMinutes}分${elapsedSeconds}秒<br>
                残り時間: ${remainMinutes}分${remainSeconds}秒<br>
                合格ライン: ${PASS_RATE}%
            `;
        } else {
            timeInfoEl.innerHTML = `
                <strong>${config.name}</strong><br>
                時間切れ<br>
                合格ライン: ${PASS_RATE}%
            `;
        }
    }
}

// 結果表示を拡張（既存のshowResultを上書き）
const originalShowResult = showResult;
showResult = function() {
    // タイマー停止
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const total = currentQuiz.length;
    const rate = Math.round((correctCount / total) * 100);

    // 統計保存
    saveStats(correctCount, total, quizMode);
    saveHistory(userAnswers);

    document.getElementById('final-score').textContent = correctCount;
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-total').textContent = total;
    document.getElementById('result-rate').textContent = rate;

    // 模擬試験モードの場合は合否判定を表示
    const mockExamResultEl = document.getElementById('mock-exam-result');
    if (isMockExamMode && mockExamResultEl) {
        showMockExamResult();
    } else if (mockExamResultEl) {
        mockExamResultEl.classList.add('hidden');
    }

    // メッセージ設定
    const messageEl = document.getElementById('result-message');
    messageEl.className = 'result-message';

    if (isMockExamMode) {
        const isPassed = rate >= PASS_RATE;
        if (isPassed) {
            if (rate >= 90) {
                messageEl.classList.add('excellent');
                messageEl.textContent = '素晴らしい！高得点で合格です！';
            } else if (rate >= 70) {
                messageEl.classList.add('good');
                messageEl.textContent = '合格です！良い成績です！';
            } else {
                messageEl.classList.add('pass');
                messageEl.textContent = '合格です！引き続き学習を続けましょう！';
            }
        } else {
            messageEl.classList.add('fail');
            messageEl.textContent = `不合格です。合格まであと${Math.ceil(total * PASS_RATE / 100) - correctCount}問必要です。`;
        }
    } else {
        if (rate >= 90) {
            messageEl.classList.add('excellent');
            messageEl.textContent = '素晴らしい！ほぼ完璧です！';
        } else if (rate >= 70) {
            messageEl.classList.add('good');
            messageEl.textContent = '良い成績です！合格ラインクリア！';
        } else if (rate >= 60) {
            messageEl.classList.add('pass');
            messageEl.textContent = 'もう少しで合格ライン！頑張りましょう！';
        } else {
            messageEl.classList.add('fail');
            messageEl.textContent = '復習が必要です。繰り返し学習しましょう！';
        }
    }

    // 間違えた問題の数を表示
    const wrongCount = userAnswers.filter(a => !a.isCorrect).length;
    document.getElementById('wrong-in-session').textContent = wrongCount;

    showScreen('result-screen');
    window.scrollTo(0, 0);

    // 模擬試験モードをリセット
    isMockExamMode = false;
    mockExamType = null;
    mockExamStartTime = null;
};

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

