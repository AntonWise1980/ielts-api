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
// NEW: MySQL Connection Pool (for performance and security)
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
// NEW: API Key Validation Middleware
async function validateApiKey(req, res, next) {
const key = req.query.key?.trim();
if (!key) {
req.isKeyValid = false;
return next(); // Rate limit will be applied
  }
try {
const [rows] = await pool.query(
'SELECT id, api_key, description FROM api_keys WHERE api_key = ? AND is_active = TRUE LIMIT 1',
      [key]
    );
if (rows.length > 0) {
req.isKeyValid = true;
req.apiKeyInfo = rows[0];
return next(); // Key valid → skip rate limit
    } else {
return res.status(401).json({
success: false,
error: 'Invalid API key',
message: 'Please use a valid API key.',
contact: 'antonwise1980@gmail.com'
      });
    }
  } catch (err) {
console.error('API Key validation error:', err);
return res.status(500).json({
success: false,
error: 'Server error',
message: 'API key could not be validated.'
    });
  }
}
// NEW: Rate Limiter - Only for requests without key
const apiLimiter = rateLimit({
windowMs: 24 * 60 * 60 * 1000, // 24 hours
max: 500,
standardHeaders: 'draft-7',
legacyHeaders: false,
validate: { ip: false },
keyGenerator: (req) => {
if (req.isKeyValid) {
return `${getCleanIp(req)}:apikey:${req.query.key}`; // Track separately if key exists
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
error: 'Daily limit exceeded',
message: 'Your daily limit of 500 requests for this IP has been reached.',
limit: 500,
resetTime: trTime,
suggestion: 'You can get unlimited access by obtaining an API key.',
getKey: 'Contact: antonwise1980@gmail.com',
retryAfter: 86400
    });
  },
skip: (req) => req.isKeyValid === true // Skip limit if key exists
});
// Handle preflight CORS request for /api/data
app.options('/api/data', (req, res) => res.sendStatus(200));
// Parse incoming JSON requests
app.use(express.json());
// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));
// Middleware order is important!
app.use('/api/data', validateApiKey); // First check key
app.use('/api/data', apiLimiter); // Then rate limit (only for keyless)
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
    // Get connection from pool (more performant)
    connection = await pool.getConnection();
    let rows;

    if (!search) {
      // RANDOM WORD (BU KISIM DEĞİŞMEDİ – %100 ÇALIŞIYOR)
      const [countResult] = await connection.query('SELECT COUNT(*) as total FROM data_json_tbl');
      const total = countResult[0].total;
      if (total === 0) {
        // YENİ: 404 + meta eklendi ama mantık aynı
        return res.status(404).json({
          success: false,
          error: 'No data in database',
          message: 'Veritabanında hiç kelime yok.',
          meta: {
            timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            powered_by: 'IELTS Synonyms API'
          }
        });
      }
      const randomOffset = Math.floor(Math.random() * total);
      [rows] = await connection.query('SELECT * FROM data_json_tbl LIMIT 1 OFFSET ?', [randomOffset]);
    } else {
      // SEARCH
      const lowerSearch = search.toLowerCase();
      [rows] = await connection.query(
        'SELECT * FROM data_json_tbl WHERE LOWER(TRIM(word)) = ? LIMIT 1',
        [lowerSearch]
      );
    }

    // YENİ: Bulunamadı → 404 + zengin meta
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No result found',
        message: `Arama: "${search || 'random'}" → Sonuç yok.`,
        meta: {
          searched: search || 'random',
          timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          powered_by: 'IELTS Synonyms API',
          api_key_used: hasKey
        }
      });
    }

    const result = rows[0];
    // synonyms and antonyms should always be arrays
    result.synonyms = Array.isArray(result.synonyms) ? result.synonyms : [];
    result.antonyms = Array.isArray(result.antonyms) ? result.antonyms : [];

    // Logging (IP + key status)
    const clientIp = getCleanIp(req);
    const logTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    console.log(`[${logTime}] Search: "${search || 'random'}" | IP: ${clientIp} | Key: ${hasKey ? 'Yes' : 'No'}`);

    // YENİ: 200 OK + success:true + meta (res.json yerine status(200))
    res.status(200).json({
      success: true,
      data: result,
      meta: {
        searched: search || null,
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        powered_by: 'IELTS Synonyms API',
        api_key_used: hasKey,
        ...(hasKey && { note: 'Unlimited access provided with API key.' })
      }
    });
  } catch (error) {
    // YENİ: 500 + detaylı hata + meta
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Sunucu hatası oluştu.',
      details: error.message,
      meta: {
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        powered_by: 'IELTS Synonyms API'
      }
    });
  } finally {
    if (connection) connection.release(); //Release the connection
  }
});

// Start the server and log startup information
app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Turkey time: ${startTime}`);
  console.log(`Rate Limit: 500 requests / 24 hours (only for users without key)`);
  console.log(`Unlimited access with API Key is active.`);
});