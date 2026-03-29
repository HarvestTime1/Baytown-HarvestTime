module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: process.env.SB_URL || process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SB_PUBLISHABLE_KEY || process.env.SB_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  });
};
