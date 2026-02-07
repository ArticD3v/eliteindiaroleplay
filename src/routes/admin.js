/**
 * Admin Routes
 * Handles admin panel functionality including user and question management
 */

const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const storage = require('../utils/storage');

// Import bot functions for role management and notifications
let assignRoleToUser = null;
let removeRoleFromUser = null;
let notifyStaffAppResult = null;
let notifyGangAppResult = null;
try {
    const bot = require('../../bot/bot');
    assignRoleToUser = bot.assignRoleToUser;
    removeRoleFromUser = bot.removeRoleFromUser;
    notifyStaffAppResult = bot.notifyStaffAppResult;
    notifyGangAppResult = bot.notifyGangAppResult;
} catch (err) {
    console.log('[Admin] Bot module not available for role management/notifications');
}

const router = express.Router();

// ==================== USER MANAGEMENT ====================

/**
 * GET /admin/users
 * Get all users with optional filtering
 */
router.get('/users', ensureAdmin, (req, res) => {
    const { status, search } = req.query;
    let users = Object.values(storage.getUsers());

    // Filter by status
    if (status && status !== 'all') {
        users = users.filter(u => u.status === status);
    }

    // Search by username or ID
    if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(u =>
            u.username.toLowerCase().includes(searchLower) ||
            u.discordId.includes(search)
        );
    }

    // Sort by last attempt (most recent first)
    users.sort((a, b) => {
        if (!a.lastAttempt) return 1;
        if (!b.lastAttempt) return -1;
        return new Date(b.lastAttempt) - new Date(a.lastAttempt);
    });

    // Get latest attempt for each user
    const usersWithAttempts = users.map(user => {
        const latestAttempt = storage.getLatestAttempt(user.discordId);
        return {
            ...user,
            latestScore: latestAttempt?.score || null,
            attemptCount: storage.getAttempts()
                .filter(a => a.discordId === user.discordId).length
        };
    });

    // Stats
    const stats = {
        total: Object.keys(storage.getUsers()).length,
        passed: Object.values(storage.getUsers()).filter(u => u.status === 'passed').length,
        failed: Object.values(storage.getUsers()).filter(u => u.status === 'failed').length,
        new: Object.values(storage.getUsers()).filter(u => u.status === 'new').length
    };

    res.json({ users: usersWithAttempts, stats });
});

/**
 * POST /admin/users/:discordId/pass
 * Manually pass a user (grants full marks and assigns role)
 */
router.post('/users/:discordId/pass', ensureAdmin, async (req, res) => {
    const { discordId } = req.params;
    const user = storage.getUser(discordId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Update user status
    storage.updateUser(discordId, {
        status: 'passed',
        lastAttempt: new Date().toISOString()
    });

    // Add a manual pass attempt
    const totalQuestions = storage.getQuestions().length;
    storage.addAttempt({
        discordId,
        score: totalQuestions, // Full marks
        passed: true,
        answers: [],
        ip: 'admin-manual',
        manualPass: true,
        passedBy: req.user.discordId
    });

    // Assign Discord role
    let roleAssigned = false;
    if (assignRoleToUser) {
        try {
            const roleResult = await assignRoleToUser(discordId);
            roleAssigned = roleResult.success;
            console.log(`[Admin] Manual pass for ${discordId}: Role ${roleResult.reason}`);
        } catch (err) {
            console.error('[Admin] Failed to assign role:', err.message);
        }
    }

    res.json({
        success: true,
        message: 'User manually passed',
        roleAssigned
    });
});

/**
 * POST /admin/users/:discordId/fail
 * Manually fail a user (revokes pass and removes role)
 */
router.post('/users/:discordId/fail', ensureAdmin, async (req, res) => {
    const { discordId } = req.params;
    const user = storage.getUser(discordId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Update user status to new (can retake quiz)
    storage.updateUser(discordId, {
        status: 'new',
        lastAttempt: new Date().toISOString()
    });

    // Add a manual fail record
    storage.addAttempt({
        discordId,
        score: 0,
        passed: false,
        answers: [],
        ip: 'admin-manual',
        manualFail: true,
        failedBy: req.user.discordId
    });

    // Remove Discord role
    let roleRemoved = false;
    if (removeRoleFromUser) {
        try {
            const roleResult = await removeRoleFromUser(discordId);
            roleRemoved = roleResult.success;
            console.log(`[Admin] Manual fail for ${discordId}: Role ${roleResult.reason}`);
        } catch (err) {
            console.error('[Admin] Failed to remove role:', err.message);
        }
    }

    res.json({
        success: true,
        message: 'User status revoked',
        roleRemoved
    });
});

/**
 * DELETE /admin/users/:discordId
 * Delete a user completely
 */
router.delete('/users/:discordId', ensureAdmin, async (req, res) => {
    const { discordId } = req.params;
    const user = storage.getUser(discordId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Remove role first if passed
    if (user.status === 'passed' && removeRoleFromUser) {
        try {
            await removeRoleFromUser(discordId);
        } catch (err) {
            console.error('[Admin] Failed to remove role on delete:', err.message);
        }
    }

    // Delete user
    storage.deleteUser(discordId);

    res.json({ success: true, message: 'User deleted' });
});

// ==================== ATTEMPTS ====================

/**
 * GET /admin/attempts
 * Get all quiz attempts with filtering
 */
router.get('/attempts', ensureAdmin, (req, res) => {
    const { status, discordId } = req.query;
    let attempts = storage.getAttempts();

    // Filter by status
    if (status === 'passed') {
        attempts = attempts.filter(a => a.passed);
    } else if (status === 'failed') {
        attempts = attempts.filter(a => !a.passed);
    }

    // Filter by user
    if (discordId) {
        attempts = attempts.filter(a => a.discordId === discordId);
    }

    // Sort by timestamp (most recent first)
    attempts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Get user info for each attempt
    const users = storage.getUsers();
    const attemptsWithUsers = attempts.map(attempt => ({
        ...attempt,
        username: users[attempt.discordId]?.username || 'Unknown'
    }));

    // Stats
    const allAttempts = storage.getAttempts();
    const stats = {
        total: allAttempts.length,
        passed: allAttempts.filter(a => a.passed).length,
        failed: allAttempts.filter(a => !a.passed).length
    };

    res.json({ attempts: attemptsWithUsers, stats });
});

// ==================== QUESTION MANAGEMENT ====================

/**
 * GET /admin/questions
 * Get all questions (with correct answers for admin)
 */
router.get('/questions', ensureAdmin, (req, res) => {
    const questions = storage.getQuestions();
    // Normalize field name (some may have correctOption, new ones have correctAnswer)
    const normalizedQuestions = questions.map(q => ({
        ...q,
        correctOption: q.correctOption !== undefined ? q.correctOption : q.correctAnswer
    }));
    res.json({ questions: normalizedQuestions });
});

/**
 * POST /admin/questions
 * Add a new question
 */
router.post('/questions', ensureAdmin, (req, res) => {
    const { question, options } = req.body;
    // Accept both correctOption and correctAnswer for compatibility
    const correctOption = req.body.correctOption !== undefined ? req.body.correctOption : req.body.correctAnswer;

    // Validate input
    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Question text is required' });
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'At least 2 options are required' });
    }

    if (correctOption === undefined || correctOption < 0 || correctOption >= options.length) {
        return res.status(400).json({ error: 'Valid correct answer index is required' });
    }

    const questions = storage.getQuestions();
    const newId = Math.max(...questions.map(q => q.id), 0) + 1;

    const newQuestion = {
        id: newId,
        question: question.trim(),
        options: options.map(o => o.trim()),
        correctOption: parseInt(correctOption)
    };

    questions.push(newQuestion);
    storage.saveQuestions(questions);

    res.json({ success: true, question: newQuestion });
});

/**
 * PUT /admin/questions/:id
 * Update a question
 */
router.put('/questions/:id', ensureAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { question, options } = req.body;
    // Accept both correctOption and correctAnswer
    const correctOption = req.body.correctOption !== undefined ? req.body.correctOption : req.body.correctAnswer;

    const questions = storage.getQuestions();
    const index = questions.findIndex(q => q.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Question not found' });
    }

    // Update fields if provided
    if (question) {
        questions[index].question = question.trim();
    }

    if (options && Array.isArray(options) && options.length >= 2) {
        questions[index].options = options.map(o => o.trim());
    }

    if (correctOption !== undefined && correctOption >= 0) {
        questions[index].correctOption = parseInt(correctOption);
    }

    storage.saveQuestions(questions);

    res.json({ success: true, question: questions[index] });
});

/**
 * GET /admin/staff-applications
 * View all staff applications
 */
router.get('/staff-applications', ensureAdmin, (req, res) => {
    const apps = storage.getStaffApps();
    const stats = {
        total: apps.length,
        pending: apps.filter(a => a.status === 'pending').length
    };
    res.json({ applications: apps, stats });
});

/**
 * GET /admin/gang-applications
 * View all gang applications
 */
router.get('/gang-applications', ensureAdmin, (req, res) => {
    const apps = storage.getGangApps();
    const stats = {
        total: apps.length,
        pending: apps.filter(a => a.status === 'pending').length
    };
    res.json({ applications: apps, stats });
});

/**
 * DELETE /admin/questions/:id
 * Delete a question
 */
router.delete('/questions/:id', ensureAdmin, (req, res) => {
    const id = parseInt(req.params.id);

    let questions = storage.getQuestions();
    const index = questions.findIndex(q => q.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Question not found' });
    }

    questions.splice(index, 1);
    storage.saveQuestions(questions);

    res.json({ success: true, message: 'Question deleted' });
});

/**
 * POST /admin/staff-applications/:id/status
 * Accept or Reject a staff application
 */
router.post('/staff-applications/:id/status', ensureAdmin, async (req, res) => {
    try {
        const appId = req.params.id;
        const { status, reason } = req.body;

        console.log(`[Admin] Update Staff App: ${appId} -> ${status}`);

        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const apps = storage.getStaffApps();
        const app = apps.find(a => a.applicationId === appId);

        if (!app) {
            console.log(`[Admin] Staff App ${appId} not found`);
            return res.status(404).json({ error: 'Application not found' });
        }

        const success = storage.updateStaffAppStatus(appId, status);
        if (!success) {
            return res.status(500).json({ error: 'Failed to update status in storage' });
        }

        // Notify user via bot
        if (notifyStaffAppResult) {
            try {
                await notifyStaffAppResult(app.discordId, status, reason);
            } catch (botErr) {
                console.error(`[Admin] Failed to send bot notification: ${botErr.message}`);
            }
        }

        res.json({ success: true, message: `Application ${status}` });
    } catch (err) {
        console.error(`[Admin] Error updating staff app: ${err.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /admin/gang-applications/:id/status
 * Accept or Reject a gang application
 */
router.post('/gang-applications/:id/status', ensureAdmin, async (req, res) => {
    try {
        const appId = req.params.id;
        const { status, reason } = req.body;

        console.log(`[Admin] Update Gang App: ${appId} -> ${status}`);

        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const apps = storage.getGangApps();
        const app = apps.find(a => a.applicationId === appId);

        if (!app) {
            console.log(`[Admin] Gang App ${appId} not found`);
            return res.status(404).json({ error: 'Application not found' });
        }

        const success = storage.updateGangAppStatus(appId, status);
        if (!success) {
            return res.status(500).json({ error: 'Failed to update status in storage' });
        }

        // Notify user via bot
        if (notifyGangAppResult) {
            try {
                await notifyGangAppResult(app.leaderDiscordId, status, app.gangName, reason);
            } catch (botErr) {
                console.error(`[Admin] Failed to send bot notification: ${botErr.message}`);
            }
        }

        res.json({ success: true, message: `Application ${status}` });
    } catch (err) {
        console.error(`[Admin] Error updating gang app: ${err.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
