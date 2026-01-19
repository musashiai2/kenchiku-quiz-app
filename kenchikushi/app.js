// アプリケーション状態
let currentQuestions = [];
let currentIndex = 0;
let easyCount = 0;
let difficultCount = 0;
let studyResults = [];
let selectedSession = null;

// LocalStorage キー基底 (2級建築士用) - ユーザープレフィックスは UserManager が付与
const STORAGE_BASE_KEYS = {
    studied: 'studied_kenchikushi',
    difficult: 'difficult_kenchikushi',
    bookmarks: 'bookmarks_kenchikushi',
    lastStudyDate: 'lastStudyDate_kenchikushi',
    streak: 'streak_kenchikushi'
};

// ダークモードは共通設定
const DARK_MODE_KEY = 'quiz_dark_mode';

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
function getStudied() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.studied, []);
}

function markStudied(questionId) {
    let studied = getStudied();
    if (!studied.includes(questionId)) {
        studied.push(questionId);
        UserManager.setUserData(STORAGE_BASE_KEYS.studied, studied);
        updateStreak();
    }
}

function getDifficult() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.difficult, []);
}

function markAsDifficult(questionId) {
    let difficult = getDifficult();
    if (!difficult.includes(questionId)) {
        difficult.push(questionId);
        UserManager.setUserData(STORAGE_BASE_KEYS.difficult, difficult);
    }
}

function removeFromDifficult(questionId) {
    let difficult = getDifficult();
    difficult = difficult.filter(id => id !== questionId);
    UserManager.setUserData(STORAGE_BASE_KEYS.difficult, difficult);
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

// 学習ストリーク管理
function getStreak() {
    return parseInt(UserManager.getUserData(STORAGE_BASE_KEYS.streak, '0'));
}

function getLastStudyDate() {
    return UserManager.getUserData(STORAGE_BASE_KEYS.lastStudyDate, '');
}

function updateStreak() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastDate = getLastStudyDate();
    let streak = getStreak();

    if (lastDate === today) {
        // Already studied today
        return streak;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
        // Studied yesterday, increment streak
        streak++;
    } else if (lastDate !== today) {
        // Streak broken, reset to 1
        streak = 1;
    }

    UserManager.setUserData(STORAGE_BASE_KEYS.streak, streak.toString());
    UserManager.setUserData(STORAGE_BASE_KEYS.lastStudyDate, today);
    return streak;
}

// 表示更新
function updateStatsDisplay() {
    const studied = getStudied();
    const total = quizData.length;
    const percentage = total > 0 ? Math.round((studied.length / total) * 100) : 0;

    const studiedEl = document.getElementById('studied-count');
    const totalEl = document.getElementById('total-questions');
    const progressEl = document.getElementById('progress-percentage');

    if (studiedEl) studiedEl.textContent = studied.length + '問';
    if (totalEl) totalEl.textContent = total + '問';
    if (progressEl) progressEl.textContent = percentage + '%';

    // ストリーク表示を更新
    const streakEl = document.getElementById('streak-count');
    if (streakEl) {
        const streak = getStreak();
        streakEl.textContent = streak + '日';
    }
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

// 学習開始
function startStudy(mode) {
    let questions = [...quizData];

    // 分野フィルタ（typeフィールドで絞り込み）
    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
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

    let questions = quizData.filter(q => difficult.includes(q.id));

    // 分野フィルタ（typeフィールドで絞り込み）
    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (questions.length === 0) {
        alert('該当する分野に難しいとマークした問題はありません');
        return;
    }

    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    easyCount = 0;
    difficultCount = 0;
    studyResults = [];

    document.getElementById('total-num').textContent = currentQuestions.length;

    showQuestion();
    showScreen('study-screen');
}

// 4択問題かどうかを判定
function isMultipleChoiceQuestion(questionText) {
    // 改行+番号+ピリオド+スペースのパターンを検出
    const pattern = /\n[1-4]\.\s/;
    return pattern.test(questionText);
}

// 4択問題のテキストと選択肢を分離
function parseMultipleChoiceQuestion(questionText) {
    // 選択肢パターン: 改行+番号+ピリオド+スペース
    const choicePattern = /\n([1-4])\.\s+/g;

    // 最初の選択肢の位置を見つける
    const firstChoiceMatch = questionText.match(/\n1\.\s/);
    if (!firstChoiceMatch) {
        return { questionBody: questionText, choices: [] };
    }

    const firstChoiceIndex = questionText.indexOf(firstChoiceMatch[0]);
    const questionBody = questionText.substring(0, firstChoiceIndex).trim();
    const choicesText = questionText.substring(firstChoiceIndex);

    // 選択肢を抽出
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
    // 「正解: 1」「正解：2」「答え: 3」などのパターン
    const patterns = [
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
    document.getElementById('question-type').textContent = question.type || '問題';

    const questionText = document.getElementById('question-text');
    const choicesContainer = document.getElementById('choices-container');

    // 4択問題かどうか判定
    if (isMultipleChoiceQuestion(question.question)) {
        // 4択クイズモード
        const parsed = parseMultipleChoiceQuestion(question.question);
        questionText.innerHTML = formatText(parsed.questionBody);

        // 選択肢ボタンを生成
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

        // 解答表示ボタンを隠す（選択肢クリックで解答表示）
        document.getElementById('show-answer-btn').classList.add('hidden');
    } else {
        // フラッシュカードモード
        questionText.innerHTML = formatText(question.question);
        choicesContainer.innerHTML = '';
        choicesContainer.classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');
    }

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
    document.getElementById('quiz-feedback').classList.add('hidden');
    document.getElementById('next-controls').classList.add('hidden');

    // ブックマークボタン更新
    updateBookmarkButton();
}

// 選択肢を選んだ時の処理
function selectChoice(selectedNumber) {
    const question = currentQuestions[currentIndex];
    const correctAnswer = extractCorrectAnswer(question.answer);
    const isCorrect = selectedNumber === correctAnswer;

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
    const feedback = document.getElementById('quiz-feedback');
    feedback.classList.remove('hidden', 'correct-feedback', 'wrong-feedback');

    if (isCorrect) {
        feedback.classList.add('correct-feedback');
        feedback.innerHTML = `
            <div class="feedback-icon">&#9711;</div>
            <div class="feedback-text">正解!</div>
        `;
    } else {
        feedback.classList.add('wrong-feedback');
        feedback.innerHTML = `
            <div class="feedback-icon">&#10005;</div>
            <div class="feedback-text">不正解</div>
            <div class="correct-answer">正解は ${correctAnswer} です</div>
        `;
    }

    // 解説を表示
    const answerText = document.getElementById('answer-text');
    answerText.innerHTML = formatText(question.answer);
    document.getElementById('answer-section').classList.remove('hidden');

    // 次へボタンを表示（クイズモード用のボタンのみ表示）
    document.getElementById('next-controls').classList.remove('hidden');
    document.getElementById('flashcard-controls-difficult').classList.add('hidden');
    document.getElementById('flashcard-controls-easy').classList.add('hidden');
    document.getElementById('quiz-next-btn').classList.remove('hidden');

    // 正解/不正解に応じてマーク
    if (isCorrect) {
        markStudied(question.id);
        removeFromDifficult(question.id);
        studyResults.push({ id: question.id, result: 'easy' });
        easyCount++;
    } else {
        markStudied(question.id);
        markAsDifficult(question.id);
        studyResults.push({ id: question.id, result: 'difficult' });
        difficultCount++;
    }
}

function formatText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

// 解答表示（フラッシュカードモード用）
function showAnswer() {
    const question = currentQuestions[currentIndex];

    const answerText = document.getElementById('answer-text');
    answerText.innerHTML = formatText(question.answer);

    document.getElementById('answer-section').classList.remove('hidden');
    document.getElementById('show-answer-btn').classList.add('hidden');
    document.getElementById('next-controls').classList.remove('hidden');

    // フラッシュカードモードのコントロールを表示
    document.getElementById('flashcard-controls-difficult').classList.remove('hidden');
    document.getElementById('flashcard-controls-easy').classList.remove('hidden');
    document.getElementById('quiz-next-btn').classList.add('hidden');
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

    // 分野別進捗を計算
    const categoryProgress = document.getElementById('category-progress');
    if (categoryProgress) {
        const categories = [...new Set(quizData.map(q => q.type))];
        categoryProgress.innerHTML = '';

        categories.forEach(category => {
            const categoryQuestions = quizData.filter(q => q.type === category);
            const studiedInCategory = categoryQuestions.filter(q => studied.includes(q.id)).length;
            const difficultInCategory = categoryQuestions.filter(q => difficult.includes(q.id)).length;
            const progressPercent = categoryQuestions.length > 0
                ? Math.round((studiedInCategory / categoryQuestions.length) * 100)
                : 0;
            const accuracyPercent = studiedInCategory > 0
                ? Math.round(((studiedInCategory - difficultInCategory) / studiedInCategory) * 100)
                : 0;

            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `
                <div class="category-header">
                    <span class="category-name">${category}</span>
                    <span class="category-count">${studiedInCategory}/${categoryQuestions.length}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="category-stats">
                    <span class="progress-text">進捗: ${progressPercent}%</span>
                    <span class="accuracy-text ${accuracyPercent < 50 ? 'low-accuracy' : ''}">正答率: ${accuracyPercent}%</span>
                </div>
            `;
            categoryProgress.appendChild(div);
        });
    }

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
                    <span class="bookmark-session">${question.type || '問題'}</span>
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
    const currentUser = UserManager.getCurrentUser();
    if (confirm(`${currentUser}さんの学習データをリセットしますか？\nこの操作は取り消せません。`)) {
        UserManager.removeUserData(STORAGE_BASE_KEYS.studied);
        UserManager.removeUserData(STORAGE_BASE_KEYS.difficult);
        UserManager.removeUserData(STORAGE_BASE_KEYS.bookmarks);
        UserManager.removeUserData(STORAGE_BASE_KEYS.lastStudyDate);
        UserManager.removeUserData(STORAGE_BASE_KEYS.streak);

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

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    const studyScreen = document.getElementById('study-screen');
    if (!studyScreen || !studyScreen.classList.contains('active')) return;

    const answerSection = document.getElementById('answer-section');
    const isAnswerVisible = answerSection && !answerSection.classList.contains('hidden');
    const choicesContainer = document.getElementById('choices-container');
    const isQuizMode = choicesContainer && !choicesContainer.classList.contains('hidden');

    switch (e.key) {
        case ' ':
        case 'Enter':
            e.preventDefault();
            if (!isAnswerVisible && !isQuizMode) {
                showAnswer();
            } else if (isAnswerVisible) {
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
            if (isAnswerVisible && !isQuizMode) {
                markEasy();
            } else if (isAnswerVisible && isQuizMode) {
                nextQuestion();
            }
            break;
        case 'ArrowLeft':
        case 'x':
        case 'X':
            e.preventDefault();
            if (isAnswerVisible && !isQuizMode) {
                markDifficult();
            }
            break;
        case 'b':
        case 'B':
            e.preventDefault();
            toggleBookmarkCurrent();
            break;
        case 'Escape':
            e.preventDefault();
            goHome();
            break;
    }
});

// 未学習問題のみで学習
function startUnstudied() {
    const studied = getStudied();
    let questions = quizData.filter(q => !studied.includes(q.id));

    if (selectedSession !== null) {
        questions = questions.filter(q => q.type === selectedSession);
    }

    if (questions.length === 0) {
        alert('未学習の問題はありません');
        return;
    }

    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    easyCount = 0;
    difficultCount = 0;
    studyResults = [];

    document.getElementById('total-num').textContent = currentQuestions.length;

    showQuestion();
    showScreen('study-screen');
}

