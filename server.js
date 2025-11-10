require('dotenv').config({ debug: true });
console.log('DB_DATABASE:', process.env.DB_DATABASE);
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Çok fazla istek attınız! Lütfen 1 dakika bekleyin.'
});

app.options('/api/data', (req, res) => res.sendStatus(200));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/data', async (req, res) => {
  try {
    let search = req.query.search?.trim();

    if (!search) {
      return res.status(400).json({ error: 'Arama kelimesi gerekli' });
    }

    // Boşlukları temizle + küçük harfe çevir
    search = search.toLowerCase().trim();

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    // SADECE word alanında tam eşleşme + case-insensitive
   const query = `
      SELECT * FROM data_json_tbl
      WHERE LOWER(TRIM(word)) = ?
      LIMIT 1
    `;

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});