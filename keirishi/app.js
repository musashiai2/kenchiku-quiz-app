// アプリケーション状態
let currentQuestions = [];
let currentIndex = 0;
let easyCount = 0;
let difficultCount = 0;
let studyResults = [];
let selectedSession = null;

// LocalStorage キー (建設業経理士1級用)
const STORAGE_KEYS = {
    studied: 'keirishi1_studied',
    difficult: 'keirishi1_difficult',
    bookmarks: 'keirishi1_bookmarks',
    darkMode: 'quiz_dark_mode'
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
    generateSessionButtons();
}

// セッションボタン生成
function generateSessionButtons() {
    const container = document.getElementById('session-buttons');
    if (!container) return;

    const sessions = [...new Set(quizData.map(q => q.session))].sort();
    container.innerHTML = '';

    // 全回選択ボタン
    const allBtn = document.createElement('button');
    allBtn.className = 'session-btn active';
    allBtn.textContent = '全て';
    allBtn.onclick = () => selectSession(null);
    container.appendChild(allBtn);

    sessions.forEach(session => {
        const btn = document.createElement('button');
        btn.className = 'session-btn';
        btn.textContent = `第${session}回`;
        btn.onclick = () => selectSession(session);
        container.appendChild(btn);
    });
}

function selectSession(session) {
    selectedSession = session;
    document.querySelectorAll('.session-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((session === null && btn.textContent === '全て') ||
            (session !== null && btn.textContent === `第${session}回`)) {
            btn.classList.add('active');
        }
    });
}

// データ管理
function getStudied() {
    const data = localStorage.getItem(STORAGE_KEYS.studied);
    return data ? JSON.parse(data) : [];
}

function markStudied(questionId) {
    let studied = getStudied();
    if (!studied.includes(questionId)) {
        studied.push(questionId);
        localStorage.setItem(STORAGE_KEYS.studied, JSON.stringify(studied));
    }
}

function getDifficult() {
    const data = localStorage.getItem(STORAGE_KEYS.difficult);
    return data ? JSON.parse(data) : [];
}

function markAsDifficult(questionId) {
    let difficult = getDifficult();
    if (!difficult.includes(questionId)) {
        difficult.push(questionId);
        localStorage.setItem(STORAGE_KEYS.difficult, JSON.stringify(difficult));
    }
}

function removeFromDifficult(questionId) {
    let difficult = getDifficult();
    difficult = difficult.filter(id => id !== questionId);
    localStorage.setItem(STORAGE_KEYS.difficult, JSON.stringify(difficult));
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
    return bookmarks.includes(questionId);
}

// 表示更新
function updateStatsDisplay() {
    const studied = getStudied();
    const total = quizData.length;

    const studiedEl = document.getElementById('studied-count');
    const totalEl = document.getElementById('total-questions');

    if (studiedEl) studiedEl.textContent = studied.length + '問';
    if (totalEl) totalEl.textContent = total + '問';
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
    localStorage.setItem(STORAGE_KEYS.darkMode, isDark);
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

// 学習開始
function startStudy(mode) {
    let questions = [...quizData];

    // セッションフィルタ
    if (selectedSession !== null) {
        questions = questions.filter(q => q.session === selectedSession);
    }

    if (mode === 'random') {
        questions = shuffleArray(questions).slice(0, 20);
    } else if (mode === 'bookmarked') {
        const bookmarks = getBookmarks();
        questions = questions.filter(q => bookmarks.includes(q.id));
        if (questions.length === 0) {
            alert('ブックマークされた問題はありません');
            return;
        }
    }

    if (questions.length === 0) {
        alert('該当する問題がありません');
        return;
    }

    currentQuestions = questions;
    currentIndex = 0;
    easyCount = 0;
    difficultCount = 0;
    studyResults = [];

    document.getElementById('total-num').textContent = currentQuestions.length;

    showQuestion();
    showScreen('study-screen');
}

function reviewDifficult() {
    const difficult = getDifficult();
    if (difficult.length === 0) {
        alert('難しいとマークした問題はありません');
        return;
    }

    currentQuestions = quizData.filter(q => difficult.includes(q.id));
    currentQuestions = shuffleArray(currentQuestions);
    currentIndex = 0;
    easyCount = 0;
    difficultCount = 0;
    studyResults = [];

    document.getElementById('total-num').textContent = currentQuestions.length;

    showQuestion();
    showScreen('study-screen');
}

// 問題表示
function showQuestion() {
    const question = currentQuestions[currentIndex];

    document.getElementById('current-num').textContent = currentIndex + 1;
    document.getElementById('question-no').textContent = question.questionNo || (currentIndex + 1);
    document.getElementById('session-badge').textContent = `第${question.session}回`;
    document.getElementById('question-type').textContent = question.type || '問題';

    // 問題文を表示（改行を保持）
    const questionText = document.getElementById('question-text');
    questionText.innerHTML = formatText(question.question);

    // 資料データがある場合は表示
    const questionData = document.getElementById('question-data');
    if (question.data) {
        questionData.innerHTML = '<div class="data-header">〈資料〉</div>' + formatText(question.data);
        questionData.style.display = 'block';
    } else {
        questionData.style.display = 'none';
    }

    // 進捗バー更新
    const progress = (currentIndex / currentQuestions.length) * 100;
    document.getElementById('progress').style.width = progress + '%';

    // 解答セクションを隠す
    document.getElementById('answer-section').classList.add('hidden');
    document.getElementById('show-answer-btn').classList.remove('hidden');
    document.getElementById('next-controls').classList.add('hidden');

    // ブックマークボタン更新
    updateBookmarkButton();
}

function formatText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

// 解答表示
function showAnswer() {
    const question = currentQuestions[currentIndex];

    const answerText = document.getElementById('answer-text');
    answerText.innerHTML = formatText(question.answer);

    document.getElementById('answer-section').classList.remove('hidden');
    document.getElementById('show-answer-btn').classList.add('hidden');
    document.getElementById('next-controls').classList.remove('hidden');
}

// 評価ボタン
function markEasy() {
    const question = currentQuestions[currentIndex];

    markStudied(question.id);
    removeFromDifficult(question.id);

    studyResults.push({ id: question.id, result: 'easy' });
    easyCount++;

    nextQuestion();
}

function markDifficult() {
    const question = currentQuestions[currentIndex];

    markStudied(question.id);
    markAsDifficult(question.id);

    studyResults.push({ id: question.id, result: 'difficult' });
    difficultCount++;

    nextQuestion();
}

function nextQuestion() {
    currentIndex++;
    if (currentIndex >= currentQuestions.length) {
        finishStudy();
    } else {
        showQuestion();
    }
}

// 学習完了
function finishStudy() {
    updateStatsDisplay();

    document.getElementById('complete-total').textContent = currentQuestions.length;
    document.getElementById('complete-easy').textContent = easyCount;
    document.getElementById('complete-difficult').textContent = difficultCount;

    showScreen('complete-screen');
}

// ブックマーク操作
function toggleBookmarkCurrent() {
    const question = currentQuestions[currentIndex];
    if (question) {
        toggleBookmark(question.id);
        updateBookmarkButton();
    }
}

// 統計画面
function showStatsScreen() {
    const studied = getStudied();
    const difficult = getDifficult();
    const bookmarks = getBookmarks();

    document.getElementById('stats-total').textContent = quizData.length;
    document.getElementById('stats-studied').textContent = studied.length;
    document.getElementById('stats-easy').textContent = studied.length - difficult.length;
    document.getElementById('stats-difficult').textContent = difficult.length;

    // ブックマークリスト
    const bookmarkList = document.getElementById('bookmark-list');
    bookmarkList.innerHTML = '';

    if (bookmarks.length === 0) {
        bookmarkList.innerHTML = '<p class="no-data">ブックマークはありません</p>';
    } else {
        bookmarks.forEach(id => {
            const question = quizData.find(q => q.id === id);
            if (question) {
                const div = document.createElement('div');
                div.className = 'bookmark-item';
                div.innerHTML = `
                    <span class="bookmark-session">第${question.session}回</span>
                    <span class="bookmark-text">${question.question.substring(0, 50)}...</span>
                `;
                bookmarkList.appendChild(div);
            }
        });
    }

    showScreen('stats-screen');
}

// データリセット
function resetAllData() {
    if (confirm('本当にすべての学習データをリセットしますか？\nこの操作は取り消せません。')) {
        localStorage.removeItem(STORAGE_KEYS.studied);
        localStorage.removeItem(STORAGE_KEYS.difficult);
        localStorage.removeItem(STORAGE_KEYS.bookmarks);

        updateStatsDisplay();
        alert('データをリセットしました');
        goHome();
    }
}

// ナビゲーション
function goHome() {
    updateStatsDisplay();
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
