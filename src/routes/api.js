const express = require('express');
const rateLimit = require('express-rate-limit');
const { ensureAuth, checkIsAdmin } = require('../middleware/auth');
const storage = require('../utils/storage');

// Import bot function for automatic role assignment
let assignRoleToUser = null;
try {
    const bot = require('../../bot/bot');
    assignRoleToUser = bot.assignRoleToUser;
} catch (err) {
    console.log('[API] Bot module not available for auto role assignment');
}

const router = express.Router();

// Rate limiter for quiz submission
const quizSubmitLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 attempts per minute
    message: { error: 'Too many submissions. Please wait before trying again.' }
});

/**
 * GET /api/me
 * Get current user information
 */
router.get('/me', ensureAuth, async (req, res) => {
    const user = storage.getUser(req.user.discordId);
    const { inCooldown, remainingTime } = storage.isInCooldown(req.user.discordId);
    const latestAttempt = storage.getLatestAttempt(req.user.discordId);

    // Check if user is admin (by Discord ID or role)
    const isAdmin = await checkIsAdmin(req.user.discordId);

    res.json({
        user: {
            discordId: user.discordId,
            username: user.username,
            avatar: user.avatar,
            status: user.status,
            lastAttempt: user.lastAttempt
        },
        isAdmin,
        cooldown: {
            inCooldown,
            remainingTime
        },
        latestAttempt: latestAttempt ? {
            score: latestAttempt.score,
            passed: latestAttempt.passed,
            timestamp: latestAttempt.timestamp
        } : null
    });
});

/**
 * GET /api/questions
 * Get quiz questions (without correct answers)
 */
router.get('/questions', ensureAuth, (req, res) => {
    // Check if user can take quiz
    const canAttempt = storage.canAttemptQuiz(req.user.discordId);

    if (!canAttempt.allowed) {
        return res.status(403).json({
            error: canAttempt.reason,
            remainingTime: canAttempt.remainingTime || 0
        });
    }

    const questions = storage.getQuestionsForClient();

    if (questions.length === 0) {
        return res.status(500).json({ error: 'No questions available' });
    }

    res.json({ questions });
});

/**
 * POST /api/submit-quiz
 * Submit quiz answers for evaluation
 */
router.post('/submit-quiz', ensureAuth, quizSubmitLimiter, async (req, res) => {
    const { answers } = req.body;
    const discordId = req.user.discordId;

    // Validate input
    if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Invalid answers format' });
    }

    // Check if user can take quiz
    const canAttempt = storage.canAttemptQuiz(discordId);

    if (!canAttempt.allowed) {
        return res.status(403).json({
            error: canAttempt.reason,
            remainingTime: canAttempt.remainingTime || 0
        });
    }

    // Sanitize answers (ensure they are numbers)
    const sanitizedAnswers = answers.map(a => {
        const num = parseInt(a, 10);
        return isNaN(num) ? -1 : num;
    });

    // Validate quiz
    const { valid, score } = storage.validateQuiz(sanitizedAnswers);

    if (!valid) {
        return res.status(400).json({ error: 'Invalid number of answers' });
    }

    // Determine pass/fail
    const passed = score >= 7;
    const totalQuestions = storage.getQuestions().length;

    // Record attempt
    storage.addAttempt({
        discordId,
        score,
        passed,
        answers: sanitizedAnswers,
        ip: req.ip || req.connection.remoteAddress
    });

    // Update user status
    storage.updateUser(discordId, {
        status: passed ? 'passed' : 'failed',
        lastAttempt: new Date().toISOString()
    });

    // Automatically assign Discord role if passed
    let roleAssigned = false;
    if (passed && assignRoleToUser) {
        try {
            const roleResult = await assignRoleToUser(discordId);
            roleAssigned = roleResult.success;
            console.log(`[API] Auto role assignment for ${discordId}: ${roleResult.reason}`);
        } catch (err) {
            console.error(`[API] Failed to auto-assign role:`, err.message);
        }
    }

    res.json({
        score,
        total: totalQuestions,
        passed,
        roleAssigned,
        message: passed
            ? 'Congratulations! You have passed the allowlist quiz.'
            : 'You did not pass. You can retry after 24 hours.'
    });
});

/**
 * GET /api/result
 * Get user's quiz result and status
 */
router.get('/result', ensureAuth, (req, res) => {
    const discordId = req.user.discordId;
    const user = storage.getUser(discordId);
    const latestAttempt = storage.getLatestAttempt(discordId);
    const { inCooldown, remainingTime } = storage.isInCooldown(discordId);

    if (!latestAttempt) {
        return res.json({
            hasAttempted: false,
            status: 'new'
        });
    }

    res.json({
        hasAttempted: true,
        status: user.status,
        score: latestAttempt.score,
        total: storage.getQuestions().length,
        passed: latestAttempt.passed,
        timestamp: latestAttempt.timestamp,
        cooldown: {
            inCooldown,
            remainingTime
        }
    });
});

module.exports = router;
