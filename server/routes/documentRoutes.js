const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET /api/documents - Fetch all documents for a supplier
router.get('/', async (req, res) => {
  const supplierId = req.query.supplierId || 'SUP-001'; // Mock default supplier
  try {
    const result = await pool.query(
      'SELECT * FROM supplier_documents WHERE supplier_id = $1 ORDER BY uploaded_at DESC',
      [supplierId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Failed to fetch documents.' });
  }
});

// POST /api/documents - Upload a new document
router.post('/', async (req, res) => {
  const { file, file_name, doc_type, notes, supplier_id } = req.body;
  const supplierId = supplier_id || 'SUP-001';

  if (!file) {
    return res.status(400).json({ message: 'File is required' });
  }
  if (!doc_type) {
    return res.status(400).json({ message: 'Document type is required' });
  }

  try {
    let fileUrl = '';
    
    // Upload to Cloudinary if it's a new file data URI
    if (file.startsWith('data:')) {
      const uploaded = await cloudinary.uploader.upload(file, {
        folder: 'clarity/documents',
        resource_type: 'auto',
      });
      fileUrl = uploaded.secure_url;
    } else {
      fileUrl = file; 
    }

    const result = await pool.query(
      `INSERT INTO supplier_documents (supplier_id, doc_type, file_url, file_name, notes) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [supplierId, doc_type, fileUrl, file_name, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(502).json({ message: 'Failed to store the document: ' + error.message });
  }
});

// PUT /api/documents/:id - Update document type or notes
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { doc_type, notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE supplier_documents 
       SET doc_type = COALESCE($1, doc_type), notes = COALESCE($2, notes) 
       WHERE id = $3 RETURNING *`,
      [doc_type, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ message: 'Failed to update document.' });
  }
});

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM supplier_documents WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ message: 'Document deleted successfully', document: result.rows[0] });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Failed to delete document.' });
  }
});

module.exports = router;
