// Load environment variables from .env file
require('dotenv').config({ debug: false });
console.log('DB_DATABASE:', process.env.DB_DATABASE);

// === DEĞİŞİKLİK: Redis bağlantısı daha güvenli hale getirildi ===
const redis = require('redis');
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error (çalışmaya devam edilecek):', err);
    redisClient = null; // hata olursa Redis’i devre dışı bırak
  });

  redisClient.connect().catch(err => {
    console.error('Redis bağlanamadı, memory store kullanılacak:', err.message);
    redisClient = null;
  });
} else {
  console.warn('REDIS_URL tanımlı değil → memory store kullanılıyor (Heroku ücretsiz için normal)');
}
// =============================================

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

if (process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && req.headers['x-forwarded-proto'] !== undefined) {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  typeCast: function (field, next) {
    if (field.type === 'JSON') {
      const val = field.string('utf8');
      return val ? JSON.parse(val) : null;
    }
    return next();
  }
});

// ... (getCleanIp, extractApiKey, validateApiKey fonksiyonları tamamen aynı kalıyor, atlıyorum) ...

// === DEĞİŞİKLİK: Rate limiter artık Redis olmasa bile CRASH ETMİYOR ===
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.isKeyValid === true,
  keyGenerator: (req) => req.isKeyValid ? `unlimited:${req.apiKeyInfo?.id || 'anon'}` : `ratelimit:${getCleanIp(req)}`,

  // Redis varsa kullan, yoksa otomatik memory store devreye girsin
  store: redisClient ? {
    async increment(key) {
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.expire(key, 24 * 60 * 60);
      return { totalHits: count };
    },
    async decrement(key) { await redisClient.decr(key); },
    async resetKey(key) { await redisClient.del(key); }
  } : undefined, // undefined bırakırsak express-rate-limit otomatik memory store kullanır ← BU ÇOK ÖNEMLİ!

  handler: (req, res) => {
    const resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const trTime = resetTime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    res.status(429).json({
      success: false,
      error: 'Daily limit exceeded',
      message: 'Günlük 500 istek limitini aştınız.',
      limit: 500,
      resetTime: trTime,
      suggestion: 'API key alarak sınırsız erişim elde edebilirsiniz.',
      getKey: 'Contact: antonwise1980@gmail.com'
    });
  }
});
// =============================================

// ... (geri kalan tüm route’lar, /api/synonyms endpoint’i vs. tamamen aynı) ...

app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`Server started → https://synon-6f0dbe944806.herokuapp.com`);
  console.log(`Turkey time: ${startTime}`);
  console.log(`Redis: ${redisClient ? 'BAĞLI (kalıcı limit)' : 'BAĞLI DEĞİL (memory store aktif, Heroku ücretsiz için normal)'}`);
});