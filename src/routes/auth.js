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

// OAuth callback - Serve Client-Side Handler
router.get('/callback', (req, res) => {
    // Serve a simple HTML page to parse the hash and POST to server
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authenticating...</title>
        <style>
            body { background: #000; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .loader { border: 4px solid #333; border-top: 4px solid #a855f7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .content { text-align: center; }
        </style>
    </head>
    <body>
        <div class="content">
            <div class="loader" style="margin: 0 auto 20px;"></div>
            <h2>Finishing Login...</h2>
            <p id="status">Please wait a moment.</p>
        </div>
        <script>
            async function handleAuth() {
                const hash = window.location.hash;
                const status = document.getElementById('status');
                
                if (!hash) {
                    // Check if we have error params in search
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('error')) {
                        status.textContent = 'Error: ' + urlParams.get('error_description') || 'Login failed.';
                        setTimeout(() => window.location.href = '/', 2000);
                        return;
                    }
                    status.textContent = 'No authentication data found.';
                    setTimeout(() => window.location.href = '/', 2000);
                    return;
                }

                // Parse hash params
                const params = new URLSearchParams(hash.substring(1)); // remove #
                const accessToken = params.get('access_token');
                
                if (!accessToken) {
                     status.textContent = 'Invalid authentication data.';
                     setTimeout(() => window.location.href = '/', 2000);
                     return;
                }

                try {
                    const response = await fetch('/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: accessToken })
                    });

                    const data = await response.json();
                    
                    if (response.ok) {
                        status.textContent = 'Success! Redirecting...';
                        window.location.href = '/dashboard.html';
                    } else {
                        status.textContent = 'Verification failed: ' + (data.error || 'Unknown error');
                        setTimeout(() => window.location.href = '/', 3000);
                    }
                } catch (err) {
                    console.error(err);
                    status.textContent = 'Connection error. Please try again.';
                    setTimeout(() => window.location.href = '/', 3000);
                }
            }
            handleAuth();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Verify Session and Set Cookie
router.post('/session', async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
        return res.status(400).json({ error: 'Missing access token' });
    }

    try {
        // Verify token with Supabase
        const { data: { user: sbUser }, error } = await supabase.auth.getUser(access_token);

        if (error || !sbUser) {
            console.error('Token Verification Error:', error);
            return res.status(401).json({ error: 'Invalid token' });
        }

        const discordProfile = sbUser.user_metadata;

        // Map to our user structure
        const discordId = discordProfile.provider_id || (sbUser.identities && sbUser.identities[0]?.id_in_provider) || sbUser.id;
        const username = discordProfile.custom_claims?.global_name || discordProfile.full_name || discordProfile.name;
        // Handle avatar: Supabase metadata avatar_url or construct manually if missing
        let avatarUrl = discordProfile.avatar_url;
        if (!avatarUrl && discordId && discordProfile.avatar_url === undefined) {
            // Fallback if needed, but user_metadata usually has it
        }

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
            await storage.updateUser(discordId, {
                username: username,
                avatar: avatarUrl
            });
            user.username = username;
            user.avatar = avatarUrl;
        }

        // Establish Express Session
        req.session.user = user;
        req.session.save((err) => {
            if (err) {
                console.error('Session Save Error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            res.json({ success: true, user });
        });

    } catch (err) {
        console.error('Session Creation Error:', err);
        res.status(500).json({ error: 'Internal server error' });
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
