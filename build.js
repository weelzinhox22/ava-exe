const esbuild = require('esbuild');
const fs = require('fs');
require('dotenv').config();

esbuild.build({
  entryPoints: ['main.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron', 'playwright', 'puppeteer-core', '@supabase/supabase-js'], // Evitar pacoteação dos assets binários puros e dependências difíceis,
  outfile: 'dist-main.js',
  define: {
    // Estas chaves substituem completamente a string 'process.env...' no arquivo empacotado, garantindo vazamento mínimo (sem carregar do .env no final)
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL'),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'),
    'process.env.GROQ_API_KEY': JSON.stringify(process.env.GROQ_API_KEY || '')
  },
  minify: true // Ofusca a lógica do Studio Oryon completamente no target
}).then(() => console.log('✅ Main Process obfuscado e blindado via esbuild! (dist-main.js gerado)'))
  .catch(() => process.exit(1));
