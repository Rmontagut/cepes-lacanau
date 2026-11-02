import { Redis } from '@upstash/redis';

// Trouve une variable d'environnement, avec ou sans préfixe ajouté par Vercel
// (ex. STORAGE_KV_REST_API_URL quand un préfixe a été choisi à la connexion).
function envEndingWith(...suffixes) {
  for (const suf of suffixes) {
    if (process.env[suf]) return process.env[suf];
    const k = Object.keys(process.env).find((n) => n.endsWith(`_${suf}`) && process.env[n]);
    if (k) return process.env[k];
  }
  return null;
}

let client;
export function getStore() {
  if (client !== undefined) return client;
  const url = envEndingWith('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL');
  const token = envEndingWith('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN');
  if (url && token) {
    client = new Redis({ url, token });
    return client;
  }
  const redisUrl = envEndingWith('REDIS_URL', 'KV_URL');
  if (redisUrl) {
    client = tcpStore(redisUrl);
    return client;
  }
  client = null;
  return client;
}

// Base Redis classique (redis://), avec la même interface get/set JSON que Upstash
function tcpStore(url) {
  let conn;
  const connect = async () => {
    if (!conn) {
      const { createClient } = await import('redis');
      conn = createClient({ url });
      conn.on('error', () => {});
      await conn.connect();
    }
    return conn;
  };
  return {
    async get(key) { const c = await connect(); const v = await c.get(key); return v == null ? null : JSON.parse(v); },
    async set(key, value) { const c = await connect(); await c.set(key, JSON.stringify(value)); return 'OK'; },
  };
}

export function storeEnvNames() {
  return Object.keys(process.env).filter((n) => /KV_|REDIS|UPSTASH/.test(n));
}
