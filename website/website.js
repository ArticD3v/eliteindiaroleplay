/**
 * Elite India Roleplay - Express Website Module
 * 
 * Handles Discord OAuth and quiz functionality
 */

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import passport configuration
require('../src/config/passport');

// Import routes
const authRoutes = require('../src/routes/auth');
const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
const applyRoutes = require('../src/routes/apply');

/**
 * Create and configure Express app
 */
function createApp() {
    const app = express();

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "https://cdn.discordapp.com", "data:"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                scriptSrcAttr: ["'unsafe-inline'"],
            },
        },
    }));

    // Body parsing middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Session configuration
    app.use(session({
        secret: process.env.SESSION_SECRET || 'elite-india-roleplay-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));

    const { ensureAdminPage } = require('../src/middleware/auth');

    // Passport middleware
    app.use(passport.initialize());
    app.use(passport.session());

    // PROTECT ADMIN PANEL DIRECT ACCESS
    app.get('/admin.html', ensureAdminPage);

    // Static files
    app.use(express.static(path.join(__dirname, '../public')));

    // Routes
    app.use('/auth', authRoutes);
    app.use('/api', apiRoutes);
    app.use('/admin', adminRoutes);
    app.use('/', applyRoutes); // Handling /staff-apply and /gang-apply here

    // Root redirect
    app.get('/', (req, res) => {
        if (req.isAuthenticated()) {
            res.redirect('/dashboard.html');
        } else {
            res.sendFile(path.join(__dirname, '../public', 'index.html'));
        }
    });

    // Global error handler
    app.use((err, req, res, next) => {
        console.error('[Website Error]:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    return app;
}

/**
 * Start the Express server
 */
function startWebsite(port) {
    return new Promise((resolve, reject) => {
        try {
            const app = createApp();

            app.listen(port, () => {
                resolve(app);
            });
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { startWebsite, createApp };
