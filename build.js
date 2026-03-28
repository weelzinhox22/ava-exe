const esbuild = require('esbuild');
const fs = require('fs');
require('dotenv').config();

esbuild.build({
  entryPoints: ['main.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron', 'playwright-core', 'electron-updater'],  // Electron (runtime) + Playwright (bindings nativas) + updater
  outfile: 'dist-main.js',
  define: {
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL'),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'),
    'process.env.GROQ_API_KEY': JSON.stringify(process.env.GROQ_API_KEY || '')
  },
  minify: true,
  treeShaking: true,
}).then(() => console.log('✅ Main Process obfuscado e blindado via esbuild! (dist-main.js gerado)'))
  .catch((e) => { console.error(e); process.exit(1); });
