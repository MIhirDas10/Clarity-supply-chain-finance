const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Fall back to a syntactically valid placeholder URL so the whole server can
// still boot when Supabase isn't configured yet (the pg-based routes keep
// working). The pipeline routes only need real credentials when actually used.
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
