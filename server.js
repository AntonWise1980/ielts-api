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

// Extract clean IPv4 address from various possible sources, normalizing IPv6-mapped addresses
const getCleanIp = (req) => {
    let ip = req.ip;

    // Fallback to connection.remoteAddress if req.ip is not available
    if (!ip && req.connection?.remoteAddress) ip = req.connection.remoteAddress;

    // Fallback to socket.remoteAddress
    if (!ip && req.socket?.remoteAddress) ip = req.socket.remoteAddress;

    // Fallback to X-Forwarded-For header (take first IP)
    if (!ip && req.headers['x-forwarded-for']) {
        ip = req.headers['x-forwarded-for'].split(',')[0].trim();
    }

    // Return 'unknown' if no IP could be determined
    if (!ip) return 'unknown';

    // Normalize localhost IPv6 (::1) to 127.0.0.1
    if (ip === '::1') return '127.0.0.1';

    // Normalize IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) {
        const ipv4 = ip.slice(7);
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return ipv4;
    }

    // Return the IP if it's already in valid IPv4 format
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;

    // Default fallback
    return 'unknown';
};

// Rate limiter: 500 requests per IP per 24 hours
const apiLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    max: 500,                     // Maximum requests per window
    standardHeaders: 'draft-7',   // Use draft-7 standard headers
    legacyHeaders: false,        // Disable legacy headers
    validate: { ip: false },      // Disable default IP validation to use custom keyGenerator
    keyGenerator: (req) => getCleanIp(req), // Use custom IP extraction
    handler: (req, res) => {
        // Custom response when rate limit is exceeded
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Günlük 500 istek limitiniz doldu. Lütfen yarın tekrar deneyin.',
            retryAfter: 86400 // 24 hours in seconds
        });
    },
    message: {
        // Default message included in response when limit is hit
        error: 'Günlük limit aşıldı',
        message: 'Bu IP için günlük 500 istek hakkınız doldu.',
        resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
    }
});

// Handle preflight CORS request for /api/data
app.options('/api/data', (req, res) => res.sendStatus(200));

// Parse incoming JSON requests
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting middleware to all routes
app.use(apiLimiter);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML page at root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to search for a word or return random if no search
app.get('/api/data', async (req, res) => {
    let connection;
    try {
        const search = req.query.search?.trim();

        // Veritabanı bağlantısı
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
        });

        let rows;

        if (!search) {
            // RASTGELE KELİME
            const [countResult] = await connection.query('SELECT COUNT(*) as total FROM data_json_tbl');
            const total = countResult[0].total;

            if (total === 0) {
                await connection.end();
                return res.status(404).json({ error: 'Veritabanında veri yok' });
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

        await connection.end();

        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Sonuç bulunamadı' });
        }

        // Doğrudan veritabanından gelen satırı dön
        res.json(rows[0]);

    } catch (error) {
        console.error('API Hatası:', error);
        if (connection) {
            try { await connection.end(); } catch {}
        }
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});


// API endpoint to search for a word or return random if no search



// Start the server and log startup information
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Türkiye saatiyle: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
});