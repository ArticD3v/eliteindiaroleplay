const express = require('express');
const passport = require('passport');
const router = express.Router();

// Initiate Discord OAuth
router.get('/discord', passport.authenticate('discord'));

// OAuth callback
router.get('/discord/callback',
    passport.authenticate('discord', {
        failureRedirect: '/?error=auth_failed'
    }),
    (req, res) => {
        res.redirect('/dashboard.html');
    }
);

// Logout
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        req.session.destroy();
        res.redirect('/');
    });
});

// Check Auth Status
router.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: req.user });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;
