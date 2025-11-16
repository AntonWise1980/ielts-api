
# Ielts Api App - English Synonyms API

This is a lightweight **Node.js** web application that provides a **RESTful API** to search. I needed an API for the applications I developed in JavaScript for learning purposes. At that time, I thought this wouldn't work without creating an API service. My application, which I developed only for educational purposes, focuses on IELTS synonyms. I learned a lot while developing this API application. It was very useful. However, I am still looking for clean data. I will try to add it to the database as I find it. 

Anton Wise,
2025



## Demo

https://synon-6f0dbe944806.herokuapp.com/


## Features

- **Exact word search** (case-insensitive, trimmed) via `/api/data?search=word`
- **Rate limiting**: 500 requests per IP every 24 hours
- **CORS preflight support** for `/api/data`
- **Static file serving** (`public/index.html` as homepage)
- **Environment-based configuration** via `.env`
- **Robust IP detection** (supports proxies, IPv6-mapped IPv4, localhost normalization)
- **Turkish localized error messages and timestamps**
- **Secure database connection handling** (per-request connection)

## Technologies & Libraries

| Category             | Technology / Library                     |
|----------------------|------------------------------------------|
| **Runtime**          | Node.js                                  |
| **Framework**        | Express.js                               |
| **Database**         | MySQL (via `mysql2/promise`)             |
| **Rate Limiting**    | `express-rate-limit`                     |
| **Environment**      | `dotenv`                                 |
| **Static Files**     | Built-in Express static middleware       |
| **Path Handling**    | Node.js `path` module                    |


## Feedback

If you have any feedback, please reach out to us at antonwise1980@gmaildotcom

## How It Works

1. **Index Startup**
   - Loads environment variables from `.env`
   - Starts Express server on `PORT` (default: 3000)
   - Logs startup time in **Turkey time (Europe/Istanbul)**

2. **IP Detection (`getCleanIp`)**
   - Extracts real client IP from:
     - `req.ip`
     - `req.connection.remoteAddress`
     - `req.socket.remoteAddress`
     - `X-Forwarded-For` header
   - Normalizes:
     - `::1` → `127.0.0.1`
     - `::ffff:127.0.0.1` → `127.0.0.1`

3. **Rate Limiting**
   - **500 requests / 24 hours per IP**
   - Custom Turkish error messages
   - Uses `Retry-After: 86400` header
   - Reset time shown in **Turkish format**

4. **API Endpoint: `GET /api/data`**
   - Requires `search` query parameter
   - Trims and lowercases input
   - Queries MySQL table `data_json_tbl` for exact match:
     ```sql
     SELECT * FROM data_json_tbl WHERE LOWER(TRIM(word)) = ? LIMIT 1


## Environment Variables

PORT=3000
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database_name


## Deployment Notes

Designed to work behind reverse proxies (trust proxy = 1)
Rate limiter works correctly with Cloudflare, Nginx, etc.
Use PM2 or Docker for production
Consider connection pooling in high-traffic scenarios
## Roadmap

- Additional browser support
- Additional data for my database
- Add more integrations
- Add log info to frontend


## 🚀 About Me
I'm a full stack learner... js


## Authors

- [@AntonWise1980](https://github.com/AntonWise1980)

