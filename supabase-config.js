/**
 * Supabase Configuration
 *
 * IMPORTANT: Replace with your actual Supabase project credentials
 * Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
 */

const SUPABASE_CONFIG = {
    // Supabase project URL
    url: 'https://ueswjzptfhnvzcqkmgbs.supabase.co',

    // Supabase anon/public key
    anonKey: 'sb_publishable_Lx9KSyvFoHxIyKYQUAUVgQ_kVeP61XM'
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
