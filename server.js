// ============================
// InventoryApp Backend (Express + PostgreSQL)
// ============================

const express = require('express');
require('dotenv').config();
const pgp = require('pg-promise')();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const port = 5000;

// ============================
// Middleware
// ============================

// Enable CORS
app.use(cors());

// Parse JSON requests
app.use(express.json());

// Serve frontend static files
app.use(express.static('public'));

// Disable caching (development)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

// ============================
// Database
// ============================

const db = pgp(process.env.DATABASE_URL);

// ============================
// Products API
// ============================

// GET all products with search and sort
app.get('/api/products', async (req, res) => {
  try {
    const { search, sortBy, order = 'ASC' } = req.query;
    let query = 'SELECT * FROM products';
    const params = [];

    // Search by product name
    if (search) {
      query += ' WHERE name ILIKE $1';
      params.push(`%${search}%`);
    }

    // Sort by allowed fields
    const validSortFields = ['name', 'price', 'stock', 'created_at'];
    if (sortBy && validSortFields.includes(sortBy)) {
      query += ` ORDER BY ${sortBy} ${order === 'DESC' ? 'DESC' : 'ASC'}`;
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const products = await db.any(query, params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET product statistics
app.get('/api/products/stats', async (req, res) => {
  try {
    const stats = await db.one(
      'SELECT SUM(price * stock) AS total_inventory_value, SUM(stock) AS total_stock FROM products'
    );
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(product);
  } catch (err) {
    res.status(404).json({ error: 'Product not found' });
  }
});

// POST create a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    const newProduct = await db.one(
      'INSERT INTO products(name, description, price, stock, category) VALUES($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price, stock, category]
    );
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update a product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    const updatedProduct = await db.one(
      'UPDATE products SET name=$1, description=$2, price=$3, stock=$4, category=$5 WHERE id=$6 RETURNING *',
      [name, description, price, stock, category, req.params.id]
    );
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await db.none('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Contact Form API
// ============================

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message, token } = req.body;

    // Validate required fields
    if (!name || !email || !message || !token) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Verify Google reCAPTCHA
    const verify = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: token,
        },
      }
    );

    if (!verify.data.success) {
      return res.status(400).json({ error: 'Captcha failed' });
    }

    // Sanitize input to prevent dangerous characters
    const clean = (str) => String(str).replace(/[<>`"'\\]/g, '').trim();

    const safeEntry =
      `Name: ${clean(name)}\n` +
      `Email: ${clean(email)}\n` +
      `Message: ${clean(message)}\n` +
      `Date: ${new Date().toISOString()}\n` +
      `-----------------------------\n`;

    fs.appendFileSync(path.join(__dirname, 'messages.txt'), safeEntry);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// Server
// ============================

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
