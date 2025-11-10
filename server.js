
require('dotenv').config({ debug: false });

console.log('DB_DATABASE:', process.env.DB_DATABASE);

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ---------- GÜVENLİ IP ALIMI (IPv6 → IPv4) ----------
const getCleanIp = (req) => {
  let ip = req.ip;

  // Fallback: req.ip yoksa diğer yollarla al
  if (!ip && req.connection?.remoteAddress) ip = req.connection.remoteAddress;
  if (!ip && req.socket?.remoteAddress) ip = req.socket.remoteAddress;
  if (!ip && req.headers['x-forwarded-for']) {
    ip = req.headers['x-forwarded-for'].split(',')[0].trim();
  }

  if (!ip) return 'unknown';

  // ::1 → 127.0.0.1
  if (ip === '::1') return '127.0.0.1';

  // ::ffff:127.0.0.1 → 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return ipv4;
  }

  // Zaten IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;

  return 'unknown';
};

// ---------- RATE LIMITER (GÜNLÜK 500 İSTEK / IP) ----------
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 saat
  max: 500, // limit yerine max (v7+ için)
  standardHeaders: 'draft-7',
  legacyHeaders: false,

  // KRİTİK: IPv6 kontrolünü devre dışı bırak
  validate: { ip: false },

  keyGenerator: (req) => getCleanIp(req),

  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Günlük 500 istek limitiniz doldu. Lütfen yarın tekrar deneyin.',
      retryAfter: 86400 // 24 saat
    });
  },

  message: {
    error: 'Günlük limit aşıldı',
    message: 'Bu IP için günlük 500 istek hakkınız doldu.',
    resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
  }
});

// ---------- MIDDLEWARES ----------
app.options('/api/data', (req, res) => res.sendStatus(200));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- ROUTES ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/data', async (req, res) => {
  try {
    let search = req.query.search?.trim();
    if (!search) {
      return res.status(400).json({ error: 'Arama kelimesi gerekli' });
    }
    search = search.toLowerCase().trim();

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    const query = `SELECT * FROM data_json_tbl WHERE LOWER(TRIM(word)) = ? LIMIT 1`;
    const [rows] = await connection.query(query, [search]);
    await connection.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sonuç bulunamadı' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Hata:', error);
    res.status(500).json({ error: 'Bir hata oluştu', details: error.message });
  }
});

// ---------- SERVER ----------
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Türkiye saatiyle: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
});