// Load environment variables from .env file
require('dotenv').config({ debug: false });
// Log database name for debugging
console.log('DB_DATABASE:', process.env.DB_DATABASE);
// Import required modules
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const rateLimit = require('express-rate-limit');
// Initialize Express app
const app = express();
// Trust the first proxy (required for correct IP detection behind reverse proxies)
app.set('trust proxy', 1);
// Define server port from environment or default to 3000
const PORT = process.env.PORT || 3000;

// YENİ: MySQL Connection Pool (performans ve güvenlik için)
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

// Extract clean IPv4 address from various possible sources, normalizing IPv6-mapped addresses
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

// YENİ: API Key Doğrulama Middleware
async function validateApiKey(req, res, next) {
  const key = req.query.key?.trim();

  if (!key) {
    req.isKeyValid = false;
    return next(); // Rate limit uygulanacak
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, api_key, description FROM api_keys WHERE api_key = ? AND is_active = TRUE LIMIT 1',
      [key]
    );

    if (rows.length > 0) {
      req.isKeyValid = true;
      req.apiKeyInfo = rows[0];
      return next(); // Key geçerli → rate limit atlanır
    } else {
      return res.status(401).json({
        success: false,
        error: 'Geçersiz API anahtarı',
        message: 'Lütfen geçerli bir API anahtarı kullanın.',
        contact: 'antonwise1980@gmail.com'
      });
    }
  } catch (err) {
    console.error('API Key doğrulama hatası:', err);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası',
      message: 'API anahtarı doğrulanamadı.'
    });
  }
}

// YENİ: Rate Limiter - Sadece anahtarsız istekler için
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 saat
  max: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { ip: false },
  keyGenerator: (req) => {
    if (req.isKeyValid) {
      return `${getCleanIp(req)}:apikey:${req.query.key}`; // Key varsa ayrı takip
    }
    return getCleanIp(req);
  },
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
      error: 'Günlük limit aşıldı',
      message: 'Bu IP için günlük 500 istek hakkınız doldu.',
      limit: 500,
      resetTime: trTime,
      suggestion: 'API anahtarı alarak sınırsız erişim elde edebilirsiniz.',
      getKey: 'İletişim: antonwise1980@gmail.com',
      retryAfter: 86400
    });
  },
  skip: (req) => req.isKeyValid === true // YENİ: Key varsa limit uygulanmaz
});

// Handle preflight CORS request for /api/data
app.options('/api/data', (req, res) => res.sendStatus(200));

// Parse incoming JSON requests
app.use(express.json());
// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// YENİ: Middleware sırası önemli!
app.use('/api/data', validateApiKey);  // Önce key kontrol
app.use('/api/data', apiLimiter);      // Sonra rate limit (sadece key'siz)

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML page at root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to search for a word or return random if no search
app.get('/api/data', async (req, res) => {
  const search = req.query.search?.trim();
  const hasKey = !!req.query.key;
  let connection;

  try {
    // YENİ: Pool'dan bağlantı al (daha performanslı)
    connection = await pool.getConnection();

    let rows;

    if (!search) {
      // RASTGELE KELİME
      const [countResult] = await connection.query('SELECT COUNT(*) as total FROM data_json_tbl');
      const total = countResult[0].total;
      if (total === 0) {
        return res.status(404).json({ success: false, error: 'Veritabanında veri yok' });
      }
      const randomOffset = Math.floor(Math.random() * total);
      [rows] = await connection.query('SELECT * FROM data_json_tbl LIMIT 1 OFFSET ?', [randomOffset]);
    } else {
      // ARAMA
      const lowerSearch = search.toLowerCase();
      [rows] = await connection.query(
        'SELECT * FROM data_json_tbl WHERE LOWER(TRIM(word)) = ? LIMIT 1',
        [lowerSearch]
      );
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sonuç bulunamadı',
        searched: search || 'rastgele'
      });
    }

    const result = rows[0];
    // YENİ: synonyms ve antonyms her zaman array olsun
    result.synonyms = Array.isArray(result.synonyms) ? result.synonyms : [];
    result.antonyms = Array.isArray(result.antonyms) ? result.antonyms : [];

    // YENİ: Loglama (IP + key durumu)
    const clientIp = getCleanIp(req);
    const logTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    console.log(`[${logTime}] Arama: "${search || 'rastgele'}" | IP: ${clientIp} | Key: ${hasKey ? 'Var' : 'Yok'}`);

    // YENİ: Daha zengin yanıt
    res.json({
      success: true,
      data: result,
      meta: {
        searched: search || null,
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        powered_by: 'IELTS Synonyms API',
        api_key_used: hasKey,
        ...(hasKey && { note: 'API anahtarı ile sınırsız erişim sağlandı.' })
      }
    });

  } catch (error) {
    console.error('API Hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Sunucu hatası',
      details: error.message
    });
  } finally {
    if (connection) connection.release(); // YENİ: Bağlantıyı serbest bırak
  }
});

// Start the server and log startup information
app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Türkiye saatiyle: ${startTime}`);
  console.log(`Rate Limit: 500 istek / 24 saat (sadece anahtarsız kullanıcılar için)`);
  console.log(`API Key ile sınırsız erişim aktif.`);
});