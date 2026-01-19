// アプリケーション状態
let currentQuiz = [];
let currentIndex = 0;
let correctCount = 0;
let userAnswers = [];
let quizMode = 'all';
let timerInterval = null;
let timeRemaining = 0;
let isTimerMode = false;
let selectedAnswers = []; // 五肢二択用の選択状態
let isMockExamMode = false;
let mockExamStartTime = null;
let mockExamType = null; // 'am' or 'pm'

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

// LocalStorage キー基底 (令和3年度用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    wrongAnswers: 'wrong_r3',
    stats: 'stats_r3',
    bookmarks: 'bookmarks_r3',
    history: 'history_r3'
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
            currentQuiz = [...quizData];
            break;
        case 'am':
            currentQuiz = quizData.filter(q => q.id <= 44);
            break;
        case 'pm':
            currentQuiz = quizData.filter(q => q.id > 44);
            break;
        case 'random':
            currentQuiz = shuffleArray([...quizData]).slice(0, 20);
            break;
        case 'wrong':
            const wrongAnswers = getWrongAnswers();
            const wrongIds = Object.keys(wrongAnswers).map(id => parseInt(id));
            currentQuiz = quizData.filter(q => wrongIds.includes(q.id));
            // 間違い回数が多い順にソート
            currentQuiz.sort((a, b) => {
                return (wrongAnswers[b.id]?.count || 0) - (wrongAnswers[a.id]?.count || 0);
            });
            break;
        case 'bookmark':
            const bookmarks = getBookmarks();
            currentQuiz = quizData.filter(q => bookmarks.includes(q.id));
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
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 問題表示
function displayQuestion() {
    const question = currentQuiz[currentIndex];
    const choiceCount = question.choices.length;
    const isMultiSelect = Array.isArray(question.correct);

    // 五肢二択用の選択状態をリセット
    selectedAnswers = [];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.id;
    document.getElementById('question-text').textContent = question.question;
    document.getElementById('correct-count').textContent = correctCount;

    // プログレスバー更新
    const progress = ((currentIndex) / currentQuiz.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    // ブックマークボタン更新
    updateBookmarkButton(question.id);

    // 問題タイプバッジを更新（四肢択一 or 五肢択一 or 五肢二択）
    updateQuestionTypeBadge(choiceCount, isMultiSelect);

    // 選択肢表示
    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = '';

    // 5択の場合はクラスを追加
    if (choiceCount === 5) {
        choicesContainer.classList.add('five-choices');
    } else {
        choicesContainer.classList.remove('five-choices');
    }

    question.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        if (isMultiSelect) {
            btn.classList.add('multi-select');
            btn.innerHTML = `
                <span class="choice-checkbox"></span>
                <span class="choice-number">${index + 1}</span>
                <span class="choice-text">${choice}</span>
            `;
            btn.onclick = () => toggleMultiSelectAnswer(index + 1);
        } else {
            btn.innerHTML = `
                <span class="choice-number">${index + 1}</span>
                <span class="choice-text">${choice}</span>
            `;
            btn.onclick = () => selectAnswer(index + 1);
        }
        choicesContainer.appendChild(btn);
    });

    // フィードバックとボタン非表示
    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
}

// 問題タイプバッジを更新
function updateQuestionTypeBadge(choiceCount, isMultiSelect = false) {
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
    if (isMultiSelect) {
        badge.textContent = '五肢二択';
        badge.className = 'question-type-badge multi-choice';
    } else if (choiceCount === 5) {
        badge.textContent = '五肢択一';
        badge.className = 'question-type-badge five-choice';
    } else {
        badge.textContent = '四肢択一';
        badge.className = 'question-type-badge four-choice';
    }
}

// 五肢二択用の選択トグル
function toggleMultiSelectAnswer(selected) {
    const question = currentQuiz[currentIndex];
    const requiredCount = question.correct.length; // 選択すべき数

    const index = selectedAnswers.indexOf(selected);
    if (index > -1) {
        // 既に選択されている場合は解除
        selectedAnswers.splice(index, 1);
    } else {
        // 未選択の場合は追加
        if (selectedAnswers.length < requiredCount) {
            selectedAnswers.push(selected);
        }
    }

    // ボタンの選択状態を更新
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, idx) => {
        if (selectedAnswers.includes(idx + 1)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 必要な数が選択されたら自動で回答判定
    if (selectedAnswers.length === requiredCount) {
        checkMultiSelectAnswer();
    }
}

// 五肢二択の回答判定
function checkMultiSelectAnswer() {
    const question = currentQuiz[currentIndex];
    const correctAnswers = question.correct.sort((a, b) => a - b);
    const userSelected = [...selectedAnswers].sort((a, b) => a - b);

    const isCorrect = correctAnswers.length === userSelected.length &&
        correctAnswers.every((val, idx) => val === userSelected[idx]);

    userAnswers.push({
        questionId: question.id,
        question: question.question,
        choices: question.choices,
        userAnswer: [...selectedAnswers],
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

    // 選択肢のスタイル更新
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        btn.classList.add('disabled');
        btn.onclick = null;

        const choiceNum = index + 1;
        if (correctAnswers.includes(choiceNum)) {
            btn.classList.add('correct');
        }
        if (userSelected.includes(choiceNum) && !correctAnswers.includes(choiceNum)) {
            btn.classList.add('wrong');
        }
    });

    // フィードバック表示
    const feedback = document.getElementById('result-feedback');
    feedback.classList.remove('hidden', 'correct-feedback', 'wrong-feedback');

    if (isCorrect) {
        feedback.classList.add('correct-feedback');
        document.getElementById('feedback-icon').textContent = '\u2B55';
        document.getElementById('feedback-text').textContent = '\u6B63\u89E3\uFF01';
        document.getElementById('correct-answer').textContent = '';
    } else {
        feedback.classList.add('wrong-feedback');
        document.getElementById('feedback-icon').textContent = '\u274C';
        document.getElementById('feedback-text').textContent = '\u4E0D\u6B63\u89E3';
        document.getElementById('correct-answer').textContent =
            `\u6B63\u89E3\u306F ${correctAnswers.join(' \u3068 ')} \u3067\u3059`;
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
        nextBtn.textContent = '\u7D50\u679C\u3092\u898B\u308B \u2192';
        nextBtn.onclick = showResult;
    } else {
        nextBtn.textContent = '\u6B21\u306E\u554F\u984C\u3078 \u2192';
        nextBtn.onclick = nextQuestion;
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

    // 選択肢のスタイル更新
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        btn.classList.add('disabled');
        btn.onclick = null;

        if (index + 1 === question.correct) {
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

    showScreen('result-screen');
    window.scrollTo(0, 0);
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

        // 回答の表示形式を調整（配列の場合は結合）
        const userAnswerDisplay = Array.isArray(answer.userAnswer)
            ? answer.userAnswer.join(', ')
            : answer.userAnswer;
        const correctAnswerDisplay = Array.isArray(answer.correctAnswer)
            ? answer.correctAnswer.join(', ')
            : answer.correctAnswer;

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
                ${!answer.isCorrect ? `<span class="your-answer">あなたの回答: ${userAnswerDisplay}</span> / ` : ''}
                <span class="correct-ans">正解: ${correctAnswerDisplay}</span>
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
        'wrong': '復習',
        'bookmark': 'ブックマーク'
    };
    return labels[mode] || mode;
}

// データリセット
function resetAllData() {
    const currentUser = UserManager.getCurrentUser();
    if (confirm(`${currentUser}さんの学習データをリセットしますか？\n（間違い記録、統計、ブックマークが削除されます）`)) {
        UserManager.removeUserData(STORAGE_BASE_KEYS.wrongAnswers);
        UserManager.removeUserData(STORAGE_BASE_KEYS.stats);
        UserManager.removeUserData(STORAGE_BASE_KEYS.bookmarks);
        UserManager.removeUserData(STORAGE_BASE_KEYS.history);
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
    let examDate = getSecondSunday(year, 6);
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

    // 1-5キーで回答選択（回答前のみ）
    if (!isAnswered && ['1', '2', '3', '4', '5'].includes(e.key)) {
        const choiceIndex = parseInt(e.key);
        if (choiceIndex <= choiceButtons.length) {
            // 現在の問題が五肢二択かどうかチェック
            const question = currentQuiz[currentIndex];
            const isMultiSelect = Array.isArray(question.correct);
            if (isMultiSelect) {
                toggleMultiSelectAnswer(choiceIndex);
            } else {
                selectAnswer(choiceIndex);
            }
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

