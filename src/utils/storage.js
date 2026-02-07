/**
 * Supabase Storage Utilities
 * Handles all read/write operations for users, attempts, question, etc.
 * Replaces old fs-based storage.js
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role for admin access

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in .env! Storage will fail.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// ==================== USERS ====================

// Cache users in memory to reduce DB calls (optional, but mimics old behavior for synchronous reads)
// HOWEVER, since we are moving to async database, we should refactor callers.
// BUT to avoid massive refactor, we might need a sync interface? No, DB calls are async.
// We MUST check if callers can handle promises.
// Most callers in routes are async. `passport.deserializeUser` is async.
// `bot.js` handlers are async.
// `storage.getUsers()` was synchronous. Now it must be async or we fetch all on start?
// Fetching all users on start is bad for scaling but fine for small app.
// Let's implement ASYNC methods and update callers.

/**
 * Get a specific user by Discord ID
 * @returns {Promise<object|null>}
 */
const getUser = async (discordId) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', discordId)
        .single();

    if (error || !data) return null;
    return {
        ...data,
        ...data.data, // Merge JSONB data back into top level to match old structure
        discordId: data.discord_id, // Map snake_case to camelCase
        lastAttempt: data.last_attempt
    };
};

/**
 * Get all users (CAUTION: Expensive)
 * Returns object map { discordId: user } to match old API
 */
const getUsers = async () => {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
        console.error('Error fetching users:', error);
        return {};
    }
    return data.reduce((acc, user) => {
        acc[user.discord_id] = {
            ...user,
            ...user.data,
            discordId: user.discord_id,
            lastAttempt: user.last_attempt
        };
        return acc;
    }, {});
};

/**
 * Save/Update user
 * @param {object} user - User object with discordId
 */
const saveUser = async (user) => {
    const discordId = user.discordId || user.discord_id;
    if (!discordId) return false;

    // Prepare data for DB
    const dbUser = {
        discord_id: discordId,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        last_attempt: user.lastAttempt ? new Date(user.lastAttempt).toISOString() : null,
        data: user // Store full object in JSONB for custom fields
    };

    const { error } = await supabase.from('users').upsert(dbUser);
    if (error) {
        console.error('Error saving user:', error);
        return false;
    }
    return true;
};

// Wrapper to match old `saveUsers(users)` which saved ALL users.
// We should deprecate this and use `saveUser(user)`.
// But for compatibility, if `users` is an object, we can't easily save all efficiently.
// We will modify callers to check if they are saving one user or all.
// Old `saveUsers(users)` was called after `users[id] = ...`.
// So we can change `saveUsers` to actually just save the specific modified user if possible.
// Or we just implement `saveUsers` to do nothing and force callers to use `saveUser`.
// Let's keep `saveUsers` as a dummy or log warning, and implement `updateUser`.

const updateUser = async (discordId, updates) => {
    // Fetch current to merge?
    // Supabase upsert/update is partial.
    // We need to map camelCase fields to snake_case columns.
    const payload = {};
    if (updates.username) payload.username = updates.username;
    if (updates.avatar) payload.avatar = updates.avatar;
    if (updates.status) payload.status = updates.status;
    if (updates.lastAttempt) payload.last_attempt = new Date(updates.lastAttempt).toISOString();

    // Also update data jsonb
    // This is tricky. simpler to just get, merge, save.
    const current = await getUser(discordId);
    if (!current) return false;

    const newUser = { ...current, ...updates };
    return await saveUser(newUser);
};

const deleteUser = async (discordId) => {
    const { error } = await supabase.from('users').delete().eq('discord_id', discordId);
    return !error;
};


// ==================== ATTEMPTS ====================

const getAttempts = async () => {
    const { data, error } = await supabase.from('attempts').select('*');
    if (error) return [];
    return data.map(a => ({
        ...a,
        discordId: a.discord_id,
        timestamp: a.timestamp
    }));
};

const getUserAttempts = async (discordId) => {
    const { data, error } = await supabase.from('attempts').select('*').eq('discord_id', discordId);
    if (error) return [];
    return data.map(a => ({
        ...a,
        discordId: a.discord_id,
        timestamp: a.timestamp
    }));
};

const getLatestAttempt = async (discordId) => {
    const attempts = await getUserAttempts(discordId);
    if (attempts.length === 0) return null;
    return attempts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
};

const addAttempt = async (attempt) => {
    const dbAttempt = {
        discord_id: attempt.discordId,
        score: attempt.score,
        passed: attempt.passed,
        timestamp: new Date().toISOString()
    };
    const { error } = await supabase.from('attempts').insert(dbAttempt);
    if (error) {
        console.error('Error adding attempt:', error);
        return false;
    }
    return true;
};

// ==================== QUESTIONS ====================

const getQuestions = async () => {
    const { data, error } = await supabase.from('questions').select('*').order('id', { ascending: true });
    if (error) return [];
    return data.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctOption: q.correct_option
    }));
};

const getQuestionsForClient = async () => {
    const questions = await getQuestions();
    return questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options
    }));
};

const validateQuiz = async (answers) => {
    const questions = await getQuestions();

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

// ==================== APPLICATIONS ====================

const getStaffApps = async () => {
    const { data, error } = await supabase.from('staff_applications').select('*');
    if (error) return [];
    return data.map(a => ({
        ...a,
        ...a.details, // Spread generic details
        applicationId: a.application_id,
        discordId: a.discord_id,
        submittedAt: a.submitted_at,
        reviewedAt: a.reviewed_at
    }));
};

const addStaffApp = async (app) => {
    const dbApp = {
        discord_id: app.discordId,
        username: app.username,
        status: app.status || 'pending',
        submitted_at: new Date().toISOString(),
        details: app // Store full object
    };
    // If explicit columns exist, map them
    if (app.experience) dbApp.experience = app.experience;
    // ...
    const { error } = await supabase.from('staff_applications').insert(dbApp);
    return !error;
};

const updateStaffAppStatus = async (appId, status) => {
    const { error } = await supabase
        .from('staff_applications')
        .update({ status: status, reviewed_at: new Date().toISOString() })
        .eq('application_id', appId);
    return !error;
};

const getGangApps = async () => {
    const { data, error } = await supabase.from('gang_applications').select('*');
    if (error) return [];
    return data.map(a => ({
        ...a,
        ...a.details,
        applicationId: a.application_id,
        leaderDiscordId: a.leader_discord_id,
        gangName: a.gang_name,
        submittedAt: a.submitted_at,
        reviewedAt: a.reviewed_at
    }));
};

const addGangApp = async (app) => {
    const dbApp = {
        leader_discord_id: app.leaderDiscordId || app.discordId,
        leader_username: app.leaderUsername || app.username,
        gang_name: app.gangName,
        gang_type: app.gangType,
        member_count: app.memberCount,
        story: app.story,
        status: 'pending',
        submitted_at: new Date().toISOString(),
        details: app
    };
    const { error } = await supabase.from('gang_applications').insert(dbApp);
    return !error;
};

const updateGangAppStatus = async (appId, status) => {
    const { error } = await supabase
        .from('gang_applications')
        .update({ status: status, reviewed_at: new Date().toISOString() })
        .eq('application_id', appId);
    return !error;
};

// ==================== COOLDOWN ====================

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const isInCooldown = async (discordId) => {
    const user = await getUser(discordId);
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

const canAttemptQuiz = async (discordId) => {
    const user = await getUser(discordId);
    if (!user) return { allowed: false, reason: 'User not found' };
    if (user.status === 'passed') return { allowed: false, reason: 'Already passed' };

    const { inCooldown, remainingTime } = await isInCooldown(discordId);
    if (inCooldown) {
        return { allowed: false, reason: 'In cooldown', remainingTime };
    }
    return { allowed: true };
};

// Export ALL functions
// NOTE: These are now ASYNC. Callers must await them.
module.exports = {
    getUsers, // Warning: Returns Promise
    getUser,
    saveUsers: async () => true, // Deprecated, no-op
    saveUser, // NEW
    updateUser,
    deleteUser,
    getAttempts,
    getUserAttempts,
    getLatestAttempt,
    addAttempt,
    getQuestions,
    getQuestionsForClient,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    validateQuiz,
    addStaffApp,
    getStaffApps,
    updateStaffAppStatus,
    addGangApp,
    getGangApps,
    updateGangAppStatus,
    isInCooldown,
    canAttemptQuiz,
    COOLDOWN_MS
};
