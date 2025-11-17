// Load environment variables from .env file
require('dotenv').config({ debug: false });
// Log database name for debugging
console.log('DB_DATABASE:', process.env.DB_DATABASE);

// === DEĞİŞİKLİK: Redis istemcisi eklendi ===
const redis = require('redis');
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL
  });

  redisClient.on('error', (err) => console.error('Redis Client Error:', err));
  redisClient.on('connect', () => console.log('Redis connected successfully'));
  redisClient.on('ready', () => console.log('Redis ready to use'));

  redisClient.connect().catch(err => {
    console.error('Redis connection failed:', err);
    redisClient = null;
  });
} else {
  console.warn('REDIS_URL not defined → Rate limiting will use in-memory store (only for local dev)');
}
// =============================================

// Import required modules
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const rateLimit = require('express-rate-limit');
// rate-limit-redis tamamen kaldırıldı, gerek yok!

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

const getCleanIp = (req) => {
  let ip = req.ip;
  if (!ip && req.connection?.remoteAddress) ip = req.connection.remoteAddress;
  if (!ip && req.socket?.remoteAddress) ip = req.socket.remoteAddress;
  if (!ip && req.headers['x-forwarded-for']) {
    ip = req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  if (!ip) return 'unknown';
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return ipv4;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
  return 'unknown';
};

function extractApiKey(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer ')) {
    return authHeader.split(' ')[1].trim();
  }
  if (req.query.key) {
    const keys = Array.isArray(req.query.key) ? req.query.key : [req.query.key];
    if (keys.length > 1) {
      throw new Error('MULTIPLE_QUERY_KEYS');
    }
    return keys[0].trim();
  }
  return null;
}

async function validateApiKey(req, res, next) {
  let key;
  let keySource = 'none';
  try {
    key = extractApiKey(req);
  } catch (err) {
    if (err.message === 'MULTIPLE_QUERY_KEYS') {
      return res.status(400).json({
        success: false,
        error: 'Multiple keys not allowed',
        message: 'Only one API key can be provided in the query parameters.'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'Invalid API key format'
    });
  }

  if (!key) {
    req.isKeyValid = false;
    req.usedKeySource = 'none';
    return next();
  }

  const hasHeader = !!(req.headers.authorization || req.headers.Authorization);
  const hasQuery = !!req.query.key;
  if (hasHeader && hasQuery) {
    return res.status(400).json({
      success: false,
      error: 'Conflicting API keys',
      message: 'Do not send API key in both Authorization header and query parameter.'
    });
  }

  keySource = hasHeader ? 'header' : 'query';

  try {
    const [rows] = await pool.query(
      'SELECT id, api_key, description FROM api_keys WHERE api_key = ? AND is_active = TRUE LIMIT 1',
      [key]
    );
    if (rows.length > 0) {
      req.isKeyValid = true;
      req.apiKeyInfo = rows[0];
      req.usedKeySource = keySource;
      if (hasQuery) delete req.query.key;
      return next();
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid or inactive API key',
        message: 'The provided API key is not valid or has been deactivated.',
        contact: 'antonwise1980@gmail.com'
      });
    }
  } catch (err) {
    console.error('API Key validation error:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'API key could not be validated due to a server error.'
    });
  }
}

// === DEĞİŞİKLİK: rate-limit-redis yerine temiz, güncel Redis store yazıldı ===
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 saat
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.isKeyValid === true,
  keyGenerator: (req) => {
    return req.isKeyValid 
      ? `unlimited:${req.apiKeyInfo?.id || 'anon'}`
      : `ratelimit:${getCleanIp(req)}`;
  },

  // KENDİ REDIS STORE'UMUZ (2025 uyumlu, sorunsuz çalışır)
  store: redisClient ? {
    async increment(key) {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 24 * 60 * 60); // 24 saat TTL
      }
      return { totalHits: count };
    },
    async decrement(key) {
      await redisClient.decr(key);
    },
    async resetKey(key) {
      await redisClient.del(key);
    }
  } : undefined,

  handler: (req, res) => {
    const resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const trTime = resetTime.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    res.status(429).json({
      success: false,
      error: 'Daily limit exceeded',
      message: 'Your daily limit of 500 requests for this IP has been reached.',
      limit: 500,
      resetTime: trTime,
      suggestion: 'You can get unlimited access by obtaining an API key.',
      getKey: 'Contact: antonwise1980@gmail.com',
      retryAfter: 86400
    });
  }
});
// =============================================

app.options('/api/synonyms', (req, res) => res.sendStatus(200));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/synonyms', validateApiKey);
app.use('/api/synonyms', apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/synonyms', async (req, res) => {
  const search = req.query.search?.trim();
  const hasKey = !!req.query.key;
  let connection;
  try {
    connection = await pool.getConnection();
    let rows = [];
    if (!search) {
      const [countResult] = await connection.query('SELECT COUNT(*) as total FROM data_json_tbl');
      const total = countResult[0].total;
      if (total === 0) {
        return res.status(404).json({
          success: false,
          error: 'No data in database',
          message: 'No words in the database.',
          meta: {
            timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            powered_by: 'IELTS Synonyms API'
          }
        });
      }
      const randomOffset = Math.floor(Math.random() * total);
      [rows] = await connection.query('SELECT * FROM data_json_tbl LIMIT 1 OFFSET ?', [randomOffset]);
    } else {
      const lowerSearch = search.toLowerCase();
      [rows] = await connection.query(
        'SELECT * FROM data_json_tbl WHERE LOWER(TRIM(word)) = ? LIMIT 1',
        [lowerSearch]
      );
      if (!rows || rows.length === 0) {
        [rows] = await connection.query(`
          SELECT * FROM data_json_tbl
          WHERE JSON_CONTAINS(LOWER(synonyms), ?)
          LIMIT 1
        `, [JSON.stringify(lowerSearch)]);
      }
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No result found',
        message: `Search: "${search || 'random'}" → No result in word or synonyms.`,
        meta: {
          searched: search || 'random',
          timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          powered_by: 'IELTS Synonyms API',
          api_key_used: hasKey
        }
      });
    }
    const result = rows[0];
    const lowerSearch = search?.toLowerCase();
    const originalWord = (result.word || '').toString().trim().toLowerCase();
    result.synonyms = Array.isArray(result.synonyms)
      ? result.synonyms.map(s => (s || '').toString().trim().toLowerCase())
      : [];
    result.antonyms = Array.isArray(result.antonyms)
      ? result.antonyms.map(a => (a || '').toString().trim().toLowerCase())
      : [];
    let source = 'word';
    if (lowerSearch && lowerSearch !== originalWord) {
      if (result.synonyms.includes(lowerSearch)) {
        result.word = lowerSearch;
        result.synonyms = result.synonyms.filter(s => s !== lowerSearch);
        if (!result.synonyms.includes(originalWord)) {
          result.synonyms.unshift(originalWord);
        }
        source = 'synonyms';
      } else {
        result.word = originalWord;
        source = 'word';
      }
    } else {
      result.word = originalWord;
      source = 'word';
    }
    const clientIp = getCleanIp(req);
    const logTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    console.log(`[${logTime}] Search: "${search || 'random'}" | Found in: ${source} | word: "${result.word}" | IP: ${clientIp} | Key: ${hasKey ? 'Yes' : 'No'}`);

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        searched: search || null,
        found_in: source,
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        powered_by: 'IELTS Synonyms API',
        api_key_used: hasKey,
        ...(hasKey && { note: 'Unlimited access provided with API key.' })
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'A server error occurred.',
      details: error.message,
      meta: {
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        powered_by: 'IELTS Synonyms API'
      }
    });
  } finally {
    if (connection) connection.release();
  }
});

app.get(['/api', '/api/'], (req, res) => {
  res.json({
    api: "IELTS Synonyms API",
    version: "1.0",
    endpoint: "/api/synonyms",
    examples: [
      "GET /api/synonyms",
      "GET /api/synonyms?search=fast",
      "GET /api/synonyms?search=quick&key=YOUR_KEY"
    ],
    rate_limit: "500/day (without key)",
    unlimited: "Use ?key=...",
    documentation: "http://localhost:3000",
    contact: "antonwise1980@gmail.com"
  });
});

app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Turkey time: ${startTime}`);
  console.log(`Rate Limit: 500 requests / 24 hours (only for users without key)`);
  console.log(`Unlimited access with API Key is active.`);
  console.log(`ACTIVE ENDPOINT: http://localhost:${PORT}/api/synonyms`);
  console.log(`FIXED: If search term is in synonyms → word = search, original word → synonyms[0]`);
  console.log(`Redis Status: ${redisClient ? 'Connected (persistent rate limiting)' : 'Not connected (in-memory fallback)'}`);
});