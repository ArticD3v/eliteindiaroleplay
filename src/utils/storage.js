/**
 * JSON File Storage Utilities
 * Handles all read/write operations for users, attempts, and questions
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'attempts.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const STAFF_APPS_FILE = path.join(DATA_DIR, 'staff_applications.json');
const GANG_APPS_FILE = path.join(DATA_DIR, 'gang_applications.json');

/**
 * Initialize a JSON file with default content if it doesn't exist
 */
const initFile = (filePath, defaultContent) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf8');
    }
};

/**
 * Read JSON file safely
 */
const readJSON = (filePath, defaultContent = {}) => {
    try {
        if (!fs.existsSync(filePath)) return defaultContent;
        const data = fs.readFileSync(filePath, 'utf8');
        if (!data || data.trim() === '') return defaultContent;
        return JSON.parse(data);
    } catch (err) {
        console.error(`[Storage] Error reading ${filePath}:`, err.message);
        return defaultContent;
    }
};

/**
 * Write JSON file safely
 */
const writeJSON = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err.message);
        return false;
    }
};

// Initialize files with default content
initFile(USERS_FILE, { users: {} });
initFile(ATTEMPTS_FILE, { attempts: [] });
initFile(STAFF_APPS_FILE, { applications: [] });
initFile(GANG_APPS_FILE, { applications: [] });

// ==================== USERS ====================

/**
 * Get all users
 */
const getUsers = () => {
    const data = readJSON(USERS_FILE, { users: {} });
    return data?.users || {};
};

/**
 * Get a specific user by Discord ID
 */
const getUser = (discordId) => {
    const users = getUsers();
    return users[discordId] || null;
};

/**
 * Save all users
 */
const saveUsers = (users) => {
    return writeJSON(USERS_FILE, { users });
};

/**
 * Update a specific user
 */
const updateUser = (discordId, updates) => {
    const users = getUsers();
    if (users[discordId]) {
        users[discordId] = { ...users[discordId], ...updates };
        return saveUsers(users);
    }
    return false;
};

/**
 * Delete a user
 */
const deleteUser = (discordId) => {
    const users = getUsers();
    if (users[discordId]) {
        delete users[discordId];
        return saveUsers(users);
    }
    return false;
};

// ==================== ATTEMPTS ====================

/**
 * Get all quiz attempts
 */
const getAttempts = () => {
    const data = readJSON(ATTEMPTS_FILE, { attempts: [] });
    return data?.attempts || [];
};

/**
 * Get attempts for a specific user
 */
const getUserAttempts = (discordId) => {
    const attempts = getAttempts();
    return attempts.filter(a => a.discordId === discordId);
};

/**
 * Get the latest attempt for a user
 */
const getLatestAttempt = (discordId) => {
    const userAttempts = getUserAttempts(discordId);
    if (userAttempts.length === 0) return null;
    return userAttempts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
};

/**
 * Add a new quiz attempt
 */
const addAttempt = (attempt) => {
    const attempts = getAttempts();
    attempts.push({
        ...attempt,
        timestamp: new Date().toISOString()
    });
    return writeJSON(ATTEMPTS_FILE, { attempts });
};

// ==================== QUESTIONS ====================

/**
 * Get all questions
 */
const getQuestions = () => {
    const data = readJSON(QUESTIONS_FILE, { questions: [] });
    return data?.questions || [];
};

/**
 * Get questions without correct answers (for client)
 */
const getQuestionsForClient = () => {
    const questions = getQuestions();
    return questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options
    }));
};

/**
 * Save all questions
 */
const saveQuestions = (questions) => {
    return writeJSON(QUESTIONS_FILE, { questions });
};

/**
 * Validate quiz answers and return score
 */
const validateQuiz = (answers) => {
    const questions = getQuestions();

    if (!Array.isArray(answers) || answers.length !== questions.length) {
        return { valid: false, score: 0 };
    }

    let score = 0;
    answers.forEach((answer, index) => {
        if (questions[index] && questions[index].correctOption === answer) {
            score++;
        }
    });

    return { valid: true, score };
};

// ==================== STAFF APPLICATIONS ====================

/**
 * Get all staff applications
 */
const getStaffApps = () => {
    const data = readJSON(STAFF_APPS_FILE, { applications: [] });
    return data?.applications || [];
};

/**
 * Save all staff applications
 */
const saveStaffApps = (applications) => {
    return writeJSON(STAFF_APPS_FILE, { applications });
};

/**
 * Add a new staff application
 */
const addStaffApp = (app) => {
    const apps = getStaffApps();
    apps.push({
        ...app,
        submittedAt: new Date().toISOString()
    });
    return saveStaffApps(apps);
};

// ==================== GANG APPLICATIONS ====================

/**
 * Get all gang applications
 */
const getGangApps = () => {
    const data = readJSON(GANG_APPS_FILE, { applications: [] });
    return data?.applications || [];
};

/**
 * Save all gang applications
 */
const saveGangApps = (applications) => {
    return writeJSON(GANG_APPS_FILE, { applications });
};

/**
 * Add a new gang application
 */
const addGangApp = (app) => {
    const apps = getGangApps();
    apps.push({
        ...app,
        submittedAt: new Date().toISOString()
    });
    return saveGangApps(apps);
};

const updateStaffAppStatus = (appId, status) => {
    const apps = getStaffApps();
    const index = apps.findIndex(a => a.applicationId === appId);
    if (index === -1) return false;

    apps[index].status = status;
    apps[index].reviewedAt = new Date().toISOString();
    saveStaffApps(apps);
    return true;
};

const updateGangAppStatus = (appId, status) => {
    const apps = getGangApps();
    const index = apps.findIndex(a => a.applicationId === appId);
    if (index === -1) return false;

    apps[index].status = status;
    apps[index].reviewedAt = new Date().toISOString();
    saveGangApps(apps);
    return true;
};

// ==================== COOLDOWN ====================

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if user is in cooldown period
 */
const isInCooldown = (discordId) => {
    const user = getUser(discordId);
    if (!user || user.status === 'passed' || user.status === 'new') {
        return { inCooldown: false, remainingTime: 0 };
    }

    if (!user.lastAttempt) {
        return { inCooldown: false, remainingTime: 0 };
    }

    const lastAttempt = new Date(user.lastAttempt).getTime();
    const now = Date.now();
    const elapsed = now - lastAttempt;

    if (elapsed >= COOLDOWN_MS) {
        return { inCooldown: false, remainingTime: 0 };
    }

    return {
        inCooldown: true,
        remainingTime: COOLDOWN_MS - elapsed
    };
};

/**
 * Check if user can attempt quiz
 */
const canAttemptQuiz = (discordId) => {
    const user = getUser(discordId);

    // User doesn't exist yet
    if (!user) {
        return { allowed: false, reason: 'User not found' };
    }

    // User already passed
    if (user.status === 'passed') {
        return { allowed: false, reason: 'Already passed' };
    }

    // Check cooldown
    const { inCooldown, remainingTime } = isInCooldown(discordId);
    if (inCooldown) {
        return {
            allowed: false,
            reason: 'In cooldown',
            remainingTime
        };
    }

    return { allowed: true };
};

module.exports = {
    getUsers,
    getUser,
    saveUsers,
    updateUser,
    deleteUser,
    getAttempts,
    getUserAttempts,
    getLatestAttempt,
    addAttempt,
    getQuestions,
    getQuestionsForClient,
    saveQuestions,
    validateQuiz,
    isInCooldown,
    canAttemptQuiz,
    getStaffApps,
    saveStaffApps,
    addStaffApp,
    updateStaffAppStatus,
    getGangApps,
    saveGangApps,
    addGangApp,
    updateGangAppStatus,
    COOLDOWN_MS
};
