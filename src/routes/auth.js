const express = require('express');
const router = express.Router();
const storage = require('../utils/storage'); // Need storage to save user
const { createClient } = require('@supabase/supabase-js');

// Initialize a separate client for Auth to avoid conflicts or use the one from storage if exported?
// Storage exports 'supabase' client implicitly? No, it's internal.
// We should create a new one or export it.
// Let's create a new lightweight client here just for Auth flow or import from storage if we modify storage to export it.
// Modifying storage.js to export supabase client is cleaner.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get the base URL for redirects
const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://eliteindiaroleplay.onrender.com' // Hardcoded for now based on context, or use env
    : 'http://localhost:3000';

// Initiate Discord OAuth via Supabase
router.get('/discord', async (req, res) => {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo: `${BASE_URL}/auth/callback`,
                scopes: 'identify' // Discord scope
            }
        });

        if (error) throw error;
        if (data.url) {
            res.redirect(data.url);
        } else {
            res.status(500).json({ error: 'No redirect URL returned from Supabase' });
        }
    } catch (err) {
        console.error('Supabase Auth Start Error:', err);
        res.redirect('/?error=auth_failed_start');
    }
});

// OAuth callback
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        console.error('Auth Callback Error:', error, req.query.error_description);
        return res.redirect('/?error=auth_denied');
    }

    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Exchange code for session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
            console.error('Code Exchange Error:', exchangeError);
            return res.redirect('/?error=exchange_failed');
        }

        const { user: sbUser, session } = data;
        const discordProfile = sbUser.user_metadata; // Supabase stores Discord info here

        // Map to our user structure
        const discordId = discordProfile.provider_id || sbUser.identities[0].id_in_provider;
        const username = discordProfile.custom_claims?.global_name || discordProfile.full_name || discordProfile.name;
        const avatarUrl = discordProfile.avatar_url;

        // Save/Update in our public.users table
        let user = await storage.getUser(discordId);

        if (!user) {
            console.log(`[Auth] Creating new user for ${discordId}`);
            user = {
                discordId: discordId,
                username: username,
                avatar: avatarUrl,
                status: 'new',
                lastAttempt: null
            };
            await storage.saveUser(user);
        } else {
            console.log(`[Auth] Updating existing user ${discordId}`);
            // Update metadata
            await storage.updateUser(discordId, {
                username: username,
                avatar: avatarUrl
            });
            user.username = username;
            user.avatar = avatarUrl;
        }

        // Establish Express Session manually (mimics Passport)
        req.session.user = user;
        req.session.save((err) => {
            if (err) console.error('Session Save Error:', err);
            res.redirect('/dashboard.html');
        });

    } catch (err) {
        console.error('Auth Processing Error:', err);
        res.redirect('/?error=server_error');
    }
});

// Logout
router.get('/logout', async (req, res) => {
    // Optional: Sign out from Supabase (invalidates token)
    // await supabase.auth.signOut(); 
    // Mainly just destroy local session
    req.session.destroy();
    res.redirect('/');
});

// Check Auth Status
router.get('/status', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;
