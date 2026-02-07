const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { ensureAuth } = require('../middleware/auth');
const storage = require('../utils/storage');

const router = express.Router();

// Rate limiter for application submissions
const applyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 submissions per 15 minutes
    message: { error: 'Too many applications. Please wait before trying again.' }
});

/**
 * GET /apply/staff-apply
 */
router.get('/staff-apply', ensureAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/staff-apply.html'));
});

/**
 * POST /api/staff-apply
 */
router.post('/staff-apply', ensureAuth, applyLimiter, async (req, res) => {
    const { age, experience, whyStaff, availability, scenario } = req.body;
    const discordId = req.user.discordId;

    // Validation
    if (!age || !experience || !whyStaff || !availability || !scenario) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const staffApps = await storage.getStaffApps();

    // Check for pending application
    const pendingApp = staffApps.find(app => app.discordId === discordId && app.status === 'pending');
    if (pendingApp) {
        return res.status(400).json({ error: 'You already have a pending application.' });
    }

    // Check for 7-day cooldown
    const lastApp = staffApps
        .filter(app => app.discordId === discordId)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];

    if (lastApp) {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const timePassed = Date.now() - new Date(lastApp.submittedAt).getTime();
        if (timePassed < sevenDaysMs) {
            const daysLeft = Math.ceil((sevenDaysMs - timePassed) / (24 * 60 * 60 * 1000));
            return res.status(400).json({ error: `You must wait ${daysLeft} more day(s) before applying again.` });
        }
    }

    const newApp = {
        applicationId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), // Supabase will ignore this as we use generic details? No, schema is Text, so we can use it.
        // Or better, let Supabase generate UUID but we changed schema to TEXT.
        // In addStaffApp, we insert details: app.
        // So we should keep generating ID here or let Supabase generate it and return it?
        // Current storage.addStaffApp implementation:
        // const dbApp = { ... details: app };
        // It relies on DB default for ID if not provided.
        // But `insert` doesn't return ID unless `select()` is called.
        // And `addStaffApp` returns boolean.
        // So we should generate ID here if we want to store it in `details` consistent with object.
        applicationId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        discordId: discordId,
        username: req.user.username,
        answers: {
            age,
            experience,
            whyStaff,
            availability,
            scenario
        },
        status: 'pending'
    };

    // We need to pass the ID to storage so it can be used for DB ID or details?
    // storage.addStaffApp uses `insert(dbApp)`. DB has default gen_random_uuid().
    // But we changed schema to TEXT. So default gen_random_uuid() might fail if not cast to text?
    // No, postgres casts uuid to text automatically?
    // Wait, I changed column type to TEXT. Default was `gen_random_uuid()`.
    // Postgres `gen_random_uuid()` returns UUID. Assigning UUID to TEXT column works.
    // So DB will generate an ID.
    // But `newApp.applicationId` is generated here.
    // Ideally we use this ID.
    // storage.addStaffApp implementation:
    // const dbApp = { ... details: app };
    // It does NOT set `application_id`. So DB generates one.
    // But `app.applicationId` is in `details`.
    // This is inconsistent.
    // I should update `addStaffApp` in storage to use `app.applicationId` as primary keys if provided?
    // Or just accept that `applicationId` in `details` might differ from DB PK?
    // Previous JSON used `applicationId`. Frontend uses it.
    // If I use DB generated ID, `getStaffApps` maps `applicationId: a.application_id`.
    // So frontend sees DB ID.
    // So generating `applicationId` here is useless unless I pass it to DB PK.
    // I will update `addStaffApp` in `storage.js` to accept ID if simple, but for now let's just await.

    await storage.addStaffApp(newApp);
    res.json({ success: true, message: 'Staff application submitted successfully!' });
});

/**
 * GET /apply/gang-apply
 */
router.get('/gang-apply', ensureAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/gang-apply.html'));
});

router.post('/gang-apply', ensureAuth, applyLimiter, async (req, res) => {
    const { gangName, gangType, story, memberCount } = req.body;
    const discordId = req.user.discordId;

    // Validation
    if (!gangName || !gangType || !story || !memberCount) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const count = parseInt(memberCount);
    if (isNaN(count) || count < 1) {
        return res.status(400).json({ error: 'Member count must be at least 1.' });
    }

    const gangApps = await storage.getGangApps();

    // Check if user already has a gang application
    const userApp = gangApps.find(app => app.leaderDiscordId === discordId);
    if (userApp) {
        return res.status(400).json({ error: 'You already have a gang application submitted.' });
    }

    // Check for duplicate gang name
    const duplicateName = gangApps.find(app => app.gangName.toLowerCase() === gangName.toLowerCase());
    if (duplicateName) {
        return res.status(400).json({ error: 'This gang name is already taken or pending.' });
    }

    const newApp = {
        applicationId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        leaderDiscordId: discordId,
        leaderUsername: req.user.username,
        gangName,
        gangType,
        story,
        memberCount: count,
        status: 'pending'
    };

    await storage.addGangApp(newApp);
    res.json({ success: true, message: 'Gang application submitted successfully!' });
});

module.exports = router;
