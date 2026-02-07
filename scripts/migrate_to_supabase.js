require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for migration to bypass RLS

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = path.join(__dirname, '../data');

// Helper to read JSON
const readJSON = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

async function migrateUsers() {
    console.log('🔄 Migrating Users...');
    const data = readJSON('users.json');
    if (!data || !data.users) return;

    const users = Object.values(data.users).map(u => ({
        discord_id: u.discordId,
        username: u.username,
        avatar: u.avatar,
        status: u.status,
        last_attempt: u.lastAttempt ? new Date(u.lastAttempt).toISOString() : null,
        data: u
    }));

    if (users.length === 0) return;

    const { error } = await supabase.from('users').upsert(users);
    if (error) console.error('❌ Error migrating users:', error);
    else console.log(`✅ Migrated ${users.length} users.`);
}

async function migrateQuestions() {
    console.log('🔄 Migrating Questions...');
    const data = readJSON('questions.json');
    if (!data || !data.questions) return;

    const questions = data.questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options, // stored as jsonb
        correct_option: q.correctOption,
    }));

    if (questions.length === 0) return;

    // Use upsert to avoid duplicates if run multiple times
    const { error } = await supabase.from('questions').upsert(questions);
    if (error) console.error('❌ Error migrating questions:', error);
    else console.log(`✅ Migrated ${questions.length} questions.`);
}

async function migrateAttempts() {
    console.log('🔄 Migrating Attempts...');
    const data = readJSON('attempts.json');
    if (!data || !data.attempts) return;

    const attempts = data.attempts.map(a => ({
        id: crypto.randomUUID(), // JSON didn't have IDs, generate new or use existing if any
        discord_id: a.discordId,
        score: a.score,
        passed: a.passed,
        timestamp: new Date(a.timestamp).toISOString()
    }));

    if (attempts.length === 0) return;

    const { error } = await supabase.from('attempts').insert(attempts);
    if (error) console.error('❌ Error migrating attempts:', error);
    else console.log(`✅ Migrated ${attempts.length} attempts.`);
}

async function migrateStaffApps() {
    console.log('🔄 Migrating Staff Applications...');
    const data = readJSON('staff_applications.json');
    if (!data || !data.applications || data.applications.length === 0) return;

    const apps = data.applications.map(a => ({
        application_id: a.applicationId,
        discord_id: a.discordId,
        username: a.username,
        status: a.status,
        submitted_at: new Date(a.submittedAt).toISOString(),
        reviewed_at: a.reviewedAt ? new Date(a.reviewedAt).toISOString() : null,
        details: a // Store full object in details for flexibility
    }));

    const { error } = await supabase.from('staff_applications').upsert(apps);
    if (error) console.error('❌ Error migrating staff apps:', error);
    else console.log(`✅ Migrated ${apps.length} staff applications.`);
}

async function migrateGangApps() {
    console.log('🔄 Migrating Gang Applications...');
    const data = readJSON('gang_applications.json');
    if (!data || !data.applications || data.applications.length === 0) return;

    const apps = data.applications.map(a => ({
        application_id: a.applicationId,
        leader_discord_id: a.leaderDiscordId || a.discordId, // Handle both existing fields
        leader_username: a.leaderUsername || a.username,
        gang_name: a.gangName,
        gang_type: a.gangType,
        member_count: parseInt(a.memberCount) || 0,
        story: a.story,
        status: a.status || 'pending',
        submitted_at: a.submittedAt ? new Date(a.submittedAt).toISOString() : new Date().toISOString(),
        reviewed_at: a.reviewedAt ? new Date(a.reviewedAt).toISOString() : null,
        details: a
    }));

    const { error } = await supabase.from('gang_applications').upsert(apps);
    if (error) console.error('❌ Error migrating gang apps:', error);
    else console.log(`✅ Migrated ${apps.length} gang applications.`);
}

async function main() {
    await migrateUsers();
    await migrateQuestions();
    await migrateAttempts();
    await migrateStaffApps();
    await migrateGangApps();
    console.log('✨ Migration Complete.');
}

main();
