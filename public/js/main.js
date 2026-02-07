/**
 * Elite India Roleplay - Main JavaScript Utilities
 */

const API = {
    /**
     * Make authenticated API request
     */
    async fetch(endpoint, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const response = await fetch(endpoint, { ...defaultOptions, ...options });

        if (response.status === 401) {
            window.location.href = '/';
            return null;
        }

        return response;
    },

    /**
     * Get current user info
     */
    async getMe() {
        const response = await this.fetch('/api/me');
        if (!response || !response.ok) return null;
        return response.json();
    },

    /**
     * Get quiz questions
     */
    async getQuestions() {
        const response = await this.fetch('/api/questions');
        if (!response) return null;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get questions');
        }
        return response.json();
    },

    /**
     * Submit quiz answers
     */
    async submitQuiz(answers) {
        const response = await this.fetch('/api/submit-quiz', {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });

        if (!response) return null;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to submit quiz');
        }

        return response.json();
    },

    /**
     * Get quiz result
     */
    async getResult() {
        const response = await this.fetch('/api/result');
        if (!response || !response.ok) return null;
        return response.json();
    },

    /**
     * Get admin attempts
     */
    async getAttempts(filter = '') {
        const url = filter ? `/admin/attempts?filter=${filter}` : '/admin/attempts';
        const response = await this.fetch(url);
        if (!response || !response.ok) return null;
        return response.json();
    },

    /**
     * Generic GET request
     */
    async get(endpoint) {
        const response = await this.fetch(endpoint);
        if (!response) return null;
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    /**
     * Generic POST request
     */
    async post(endpoint, data = {}) {
        const response = await this.fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!response) return null;
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    /**
     * Generic PUT request
     */
    async put(endpoint, data = {}) {
        const response = await this.fetch(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        if (!response) return null;
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    /**
     * Generic DELETE request
     */
    async delete(endpoint) {
        const response = await this.fetch(endpoint, {
            method: 'DELETE',
        });
        if (!response) return null;
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },
};

/**
 * Utility functions
 */
const Utils = {
    /**
     * Format remaining time as HH:MM:SS
     */
    formatTime(ms) {
        if (ms <= 0) return '00:00:00';

        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));

        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    },

    /**
     * Format date for display
     */
    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    },

    /**
     * Show loading overlay
     */
    showLoading() {
        const existing = document.getElementById('loading-overlay');
        if (existing) return;

        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loader"></div>
            <p class="text-secondary">Loading...</p>
        `;
        document.body.appendChild(overlay);
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    },

    /**
     * Create status badge HTML
     */
    statusBadge(status) {
        const classes = {
            'new': 'badge badge-new',
            'passed': 'badge badge-success',
            'failed': 'badge badge-error',
        };

        const labels = {
            'new': 'Not Attempted',
            'passed': 'Passed',
            'failed': 'Failed',
        };

        return `<span class="${classes[status] || 'badge'}">${labels[status] || status}</span>`;
    },

    /**
     * Store data in sessionStorage
     */
    setSession(key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
    },

    /**
     * Get data from sessionStorage
     */
    getSession(key) {
        const data = sessionStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    /**
     * Clear session data
     */
    clearSession(key) {
        if (key) {
            sessionStorage.removeItem(key);
        } else {
            sessionStorage.clear();
        }
    },
};

/**
 * Check if user is authenticated and redirect if not
 */
async function checkAuth() {
    try {
        Utils.showLoading();
        const data = await API.getMe();
        Utils.hideLoading();

        if (!data || !data.user) {
            window.location.href = '/';
            return null;
        }

        return data;
    } catch (err) {
        Utils.hideLoading();
        window.location.href = '/';
        return null;
    }
}

// Export for use in other scripts
window.API = API;
window.Utils = Utils;
window.checkAuth = checkAuth;
