// アプリケーション状態
let currentQuiz = [];
let currentIndex = 0;
let correctCount = 0;
let userAnswers = [];
let quizMode = 'all';
let timerInterval = null;
let timeRemaining = 0;
let isTimerMode = false;

// LocalStorage キー (建設業経理士用)
const STORAGE_KEYS = {
    wrongAnswers: 'quiz_wrong_answers_keirishi',
    stats: 'quiz_stats_keirishi',
    bookmarks: 'quiz_bookmarks_keirishi',
    darkMode: 'quiz_dark_mode',
    history: 'quiz_history_keirishi'
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    showScreen('start-screen');
});

// アプリ初期化
function initializeApp() {
    const darkMode = localStorage.getItem(STORAGE_KEYS.darkMode) === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        updateDarkModeButton();
    }
    updateStatsDisplay();
    updateWrongCountDisplay();
    updateBookmarkCountDisplay();
}

// データ管理関数
function getWrongAnswers() {
    const data = localStorage.getItem(STORAGE_KEYS.wrongAnswers);
    return data ? JSON.parse(data) : {};
}

function saveWrongAnswer(questionId) {
    const wrongAnswers = getWrongAnswers();
    if (!wrongAnswers[questionId]) {
        wrongAnswers[questionId] = { count: 0, lastWrong: null };
    }
    wrongAnswers[questionId].count++;
    wrongAnswers[questionId].lastWrong = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.wrongAnswers, JSON.stringify(wrongAnswers));
}

function recordCorrectAnswer(questionId) {
    const wrongAnswers = getWrongAnswers();
    if (wrongAnswers[questionId] && wrongAnswers[questionId].count > 0) {
        wrongAnswers[questionId].count--;
        wrongAnswers[questionId].lastCorrect = new Date().toISOString();
        if (wrongAnswers[questionId].count <= 0) {
            delete wrongAnswers[questionId];
        }
        localStorage.setItem(STORAGE_KEYS.wrongAnswers, JSON.stringify(wrongAnswers));
    }
}

function getBookmarks() {
    const data = localStorage.getItem(STORAGE_KEYS.bookmarks);
    return data ? JSON.parse(data) : [];
}

function toggleBookmark(questionId) {
    let bookmarks = getBookmarks();
    const index = bookmarks.indexOf(questionId);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.push(questionId);
    }
    localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
    updateBookmarkButton(questionId);
    updateBookmarkCountDisplay();
}

function getStats() {
    const data = localStorage.getItem(STORAGE_KEYS.stats);
    return data ? JSON.parse(data) : {
        totalAttempts: 0,
        totalQuestions: 0,
        totalCorrect: 0
    };
}

function saveStats(correct, total) {
    const stats = getStats();
    stats.totalAttempts++;
    stats.totalQuestions += total;
    stats.totalCorrect += correct;
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
    saveHistory(correct, total);
}

function getHistory() {
    const data = localStorage.getItem(STORAGE_KEYS.history);
    return data ? JSON.parse(data) : [];
}

function saveHistory(correct, total) {
    const history = getHistory();
    history.unshift({
        date: new Date().toISOString(),
        correct: correct,
        total: total,
        mode: quizMode
    });
    if (history.length > 20) {
        history.pop();
    }
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

// 表示更新関数
function updateStatsDisplay() {
    const stats = getStats();
    const rate = stats.totalQuestions > 0 ? Math.round(stats.totalCorrect / stats.totalQuestions * 100) : 0;

    const overallRateEl = document.getElementById('overall-rate');
    const totalAttemptsEl = document.getElementById('total-attempts');

    if (overallRateEl) overallRateEl.textContent = rate + '%';
    if (totalAttemptsEl) totalAttemptsEl.textContent = stats.totalAttempts + '回';
}

function updateWrongCountDisplay() {
    const wrongAnswers = getWrongAnswers();
    const count = Object.keys(wrongAnswers).length;
    const el = document.getElementById('wrong-count');
    if (el) el.textContent = count + '問';

    const btn = document.getElementById('review-wrong-btn');
    if (btn) btn.disabled = count === 0;
}

function updateBookmarkCountDisplay() {
    const bookmarks = getBookmarks();
    const el = document.getElementById('bookmark-count');
    if (el) el.textContent = bookmarks.length + '問';

    const btn = document.getElementById('study-bookmark-btn');
    if (btn) btn.disabled = bookmarks.length === 0;
}

function updateBookmarkButton(questionId) {
    const bookmarks = getBookmarks();
    const btn = document.getElementById('bookmark-btn');
    if (btn) {
        btn.innerHTML = bookmarks.includes(questionId) ? '★' : '☆';
        btn.classList.toggle('active', bookmarks.includes(questionId));
    }
}

// ダークモード
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem(STORAGE_KEYS.darkMode, isDark);
    updateDarkModeButton();
}

function updateDarkModeButton() {
    const btn = document.getElementById('dark-mode-btn');
    const isDark = document.body.classList.contains('dark-mode');
    if (btn) {
        btn.innerHTML = isDark ? '☀️' : '🌙';
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
    quizMode = mode;
    isTimerMode = false;

    currentQuiz = [...quizData];

    if (mode === 'random') {
        currentQuiz = shuffleArray(currentQuiz).slice(0, 20);
    }

    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuiz.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

function startTimerMode(mode) {
    quizMode = mode;
    isTimerMode = true;

    currentQuiz = [...quizData];

    const timeMinutes = currentQuiz.length * 2; // 1問2分
    timeRemaining = timeMinutes * 60;

    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuiz.length;
    document.getElementById('timer-display').classList.remove('hidden');

    startTimer();
    showQuestion();
    showScreen('quiz-screen');
}

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            finishQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('timer-text').textContent = display;

    if (timeRemaining <= 60) {
        document.getElementById('timer-display').classList.add('warning');
    }
}

function startWrongReview() {
    const wrongAnswers = getWrongAnswers();
    const wrongIds = Object.keys(wrongAnswers).map(Number);

    if (wrongIds.length === 0) {
        alert('間違えた問題はありません');
        return;
    }

    currentQuiz = quizData.filter(q => wrongIds.includes(q.id));
    currentQuiz = shuffleArray(currentQuiz);
    quizMode = 'wrong';
    isTimerMode = false;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuiz.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

function startBookmarkStudy() {
    const bookmarks = getBookmarks();

    if (bookmarks.length === 0) {
        alert('ブックマークされた問題はありません');
        return;
    }

    currentQuiz = quizData.filter(q => bookmarks.includes(q.id));
    currentQuiz = shuffleArray(currentQuiz);
    quizMode = 'bookmark';
    isTimerMode = false;
    currentIndex = 0;
    correctCount = 0;
    userAnswers = [];

    document.getElementById('total-num').textContent = currentQuiz.length;
    document.getElementById('timer-display').classList.add('hidden');

    showQuestion();
    showScreen('quiz-screen');
}

// 問題表示
function showQuestion() {
    const question = currentQuiz[currentIndex];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.id;
    document.getElementById('question-text').textContent = question.question;
    document.getElementById('correct-count').textContent = correctCount;

    const progress = ((currentIndex) / currentQuiz.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    updateBookmarkButton(question.id);

    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = '';

    question.choices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.className = 'choice-btn';
        button.innerHTML = `<span class="choice-number">${index + 1}</span><span class="choice-text">${choice}</span>`;
        button.onclick = () => selectAnswer(index);
        choicesContainer.appendChild(button);
    });

    document.getElementById('result-feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
}

// 解答選択
function selectAnswer(selectedIndex) {
    const question = currentQuiz[currentIndex];
    const isCorrect = selectedIndex === question.correct;

    userAnswers.push({
        questionId: question.id,
        selected: selectedIndex,
        correct: question.correct,
        isCorrect: isCorrect
    });

    if (isCorrect) {
        correctCount++;
        recordCorrectAnswer(question.id);
    } else {
        saveWrongAnswer(question.id);
    }

    document.getElementById('correct-count').textContent = correctCount;

    // 選択肢のスタイル更新
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, index) => {
        btn.disabled = true;
        if (index === question.correct) {
            btn.classList.add('correct');
        } else if (index === selectedIndex && !isCorrect) {
            btn.classList.add('wrong');
        }
    });

    // フィードバック表示
    const feedback = document.getElementById('result-feedback');
    const feedbackIcon = document.getElementById('feedback-icon');
    const feedbackText = document.getElementById('feedback-text');
    const correctAnswer = document.getElementById('correct-answer');

    feedbackIcon.textContent = isCorrect ? '○' : '×';
    feedbackIcon.className = 'feedback-icon ' + (isCorrect ? 'correct' : 'wrong');
    feedbackText.textContent = isCorrect ? '正解！' : '不正解';

    // 解説表示
    if (question.explanation) {
        correctAnswer.innerHTML = `<strong>解説:</strong> ${question.explanation}`;
    } else {
        correctAnswer.innerHTML = `<strong>正解:</strong> ${question.correct + 1}. ${question.choices[question.correct]}`;
    }

    feedback.classList.remove('hidden');
    document.getElementById('next-btn').classList.remove('hidden');

    if (currentIndex === currentQuiz.length - 1) {
        document.getElementById('next-btn').textContent = '結果を見る';
    } else {
        document.getElementById('next-btn').textContent = '次の問題へ →';
    }
}

// 次の問題へ
function nextQuestion() {
    currentIndex++;
    if (currentIndex >= currentQuiz.length) {
        finishQuiz();
    } else {
        showQuestion();
    }
}

// クイズ終了
function finishQuiz() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const total = currentQuiz.length;
    const rate = Math.round((correctCount / total) * 100);
    const wrongCount = total - correctCount;

    saveStats(correctCount, total);
    updateStatsDisplay();
    updateWrongCountDisplay();

    document.getElementById('final-score').textContent = rate;
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-total').textContent = total;
    document.getElementById('result-rate').textContent = rate;
    document.getElementById('wrong-in-session').textContent = wrongCount;

    let message = '';
    if (rate >= 80) {
        message = '素晴らしい！合格ラインです！';
    } else if (rate >= 60) {
        message = 'もう少しで合格ラインです。頑張りましょう！';
    } else {
        message = '復習が必要です。間違えた問題を見直しましょう。';
    }
    document.getElementById('result-message').textContent = message;

    showScreen('result-screen');
}

// 解答確認
function reviewAnswers() {
    const list = document.getElementById('review-list');
    list.innerHTML = '';

    userAnswers.forEach((answer, index) => {
        const question = currentQuiz[index];
        const div = document.createElement('div');
        div.className = 'review-item ' + (answer.isCorrect ? 'correct' : 'wrong');
        div.setAttribute('data-correct', answer.isCorrect);

        div.innerHTML = `
            <div class="review-question">
                <span class="review-status">${answer.isCorrect ? '○' : '×'}</span>
                <span class="review-no">No.${question.id}</span>
                ${question.question}
            </div>
            <div class="review-answer">
                <div>あなたの解答: ${answer.selected + 1}. ${question.choices[answer.selected]}</div>
                ${!answer.isCorrect ? `<div class="correct-answer-text">正解: ${answer.correct + 1}. ${question.choices[answer.correct]}</div>` : ''}
                ${question.explanation ? `<div class="explanation-text">解説: ${question.explanation}</div>` : ''}
            </div>
        `;
        list.appendChild(div);
    });

    showScreen('review-screen');
}

function filterReview(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    document.querySelectorAll('.review-item').forEach(item => {
        const isCorrect = item.getAttribute('data-correct') === 'true';
        if (filter === 'all') {
            item.style.display = 'block';
        } else if (filter === 'wrong') {
            item.style.display = isCorrect ? 'none' : 'block';
        } else if (filter === 'correct') {
            item.style.display = isCorrect ? 'block' : 'none';
        }
    });
}

// 統計画面
function showStatsScreen() {
    const stats = getStats();
    const wrongAnswers = getWrongAnswers();
    const history = getHistory();

    document.getElementById('stats-total-attempts').textContent = stats.totalAttempts;
    document.getElementById('stats-total-questions').textContent = stats.totalQuestions;
    document.getElementById('stats-total-correct').textContent = stats.totalCorrect;

    const rate = stats.totalQuestions > 0 ? Math.round(stats.totalCorrect / stats.totalQuestions * 100) : 0;
    document.getElementById('stats-overall-rate').textContent = rate + '%';

    // 苦手問題リスト
    const weakList = document.getElementById('weak-questions-list');
    weakList.innerHTML = '';

    const sortedWrong = Object.entries(wrongAnswers)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    if (sortedWrong.length === 0) {
        weakList.innerHTML = '<p class="no-data">まだデータがありません</p>';
    } else {
        sortedWrong.forEach(([id, data]) => {
            const question = quizData.find(q => q.id === parseInt(id));
            if (question) {
                const div = document.createElement('div');
                div.className = 'weak-item';
                div.innerHTML = `
                    <span class="weak-no">No.${id}</span>
                    <span class="weak-count">${data.count}回間違い</span>
                    <span class="weak-text">${question.question.substring(0, 30)}...</span>
                `;
                weakList.appendChild(div);
            }
        });
    }

    // 学習履歴
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<p class="no-data">まだ履歴がありません</p>';
    } else {
        history.slice(0, 10).forEach(h => {
            const date = new Date(h.date);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
            const rate = Math.round(h.correct / h.total * 100);

            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <span class="history-date">${dateStr}</span>
                <span class="history-result">${h.correct}/${h.total} (${rate}%)</span>
            `;
            historyList.appendChild(div);
        });
    }

    showScreen('stats-screen');
}

// データリセット
function resetAllData() {
    if (confirm('本当にすべての学習データをリセットしますか？\nこの操作は取り消せません。')) {
        localStorage.removeItem(STORAGE_KEYS.wrongAnswers);
        localStorage.removeItem(STORAGE_KEYS.stats);
        localStorage.removeItem(STORAGE_KEYS.bookmarks);
        localStorage.removeItem(STORAGE_KEYS.history);

        updateStatsDisplay();
        updateWrongCountDisplay();
        updateBookmarkCountDisplay();

        alert('データをリセットしました');
        goHome();
    }
}

// ナビゲーション
function goHome() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateStatsDisplay();
    updateWrongCountDisplay();
    showScreen('start-screen');
}

function goToResult() {
    showScreen('result-screen');
}

function restartQuiz() {
    startQuiz(quizMode);
}

function bookmarkCurrentQuestion() {
    const question = currentQuiz[currentIndex];
    toggleBookmark(question.id);
}

// ユーティリティ関数
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}
