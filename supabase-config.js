/**
 * Supabase Configuration
 *
 * IMPORTANT: Replace with your actual Supabase project credentials
 * Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
 */

const SUPABASE_CONFIG = {
    // Replace with your Supabase project URL
    url: 'YOUR_SUPABASE_URL',

    // Replace with your Supabase anon/public key
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

// Initialize Supabase client
let supabaseClient = null;

/**
 * Get or create Supabase client
 * @returns {Object} Supabase client instance
 */
function getSupabaseClient() {
    if (!supabaseClient && typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey
        );
    }
    return supabaseClient;
}

/**
 * Check if Supabase is configured
 * @returns {boolean}
 */
function isSupabaseConfigured() {
    return SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
           SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY';
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    window.getSupabaseClient = getSupabaseClient;
    window.isSupabaseConfigured = isSupabaseConfigured;
}
