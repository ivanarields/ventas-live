const { execSync } = require('child_process');

const vars = {
  "VITE_STORE_SUPABASE_URL": "https://thgbfurscfjcmgokyyif.supabase.co",
  "STORE_SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ2JmdXJzY2ZqY21nb2t5eWlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg3MDEwMSwiZXhwIjoyMDkyNDQ2MTAxfQ.k9UDbB8w6qbuq-uo_1BxeKXseuMlEGcKzqtmdrdPubk",
  "VITE_STORE_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ2JmdXJzY2ZqY21nb2t5eWlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzAxMDEsImV4cCI6MjA5MjQ0NjEwMX0._d3W3zhoyQnVfJEchnnYAl9tdx0zDZXP9yHpse-E_GY"
};

for (const [key, val] of Object.entries(vars)) {
  console.log(`Adding ${key}...`);
  try {
    execSync(`npx vercel env add ${key} production`, { input: val, stdio: ['pipe', 'inherit', 'inherit'] });
  } catch (e) {
    console.error(`Error adding ${key}`);
  }
}
