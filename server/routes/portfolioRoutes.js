const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');

// Platform-wide totals across all funders
router.get('/summary', portfolioController.getSummary);

// Investment notes - a funder annotates/flags investments (GET + POST + PATCH + DELETE)
router.get('/notes', portfolioController.getNotes);
router.post('/notes', portfolioController.createNote);
router.patch('/notes/:id', portfolioController.updateNote);
router.delete('/notes/:id', portfolioController.deleteNote);

// List all funders with headline portfolio numbers
router.get('/funders', portfolioController.getFunders);

// Set a funder's target return % (shown vs actual on the dashboard)
router.put('/funders/:id/target', portfolioController.setTarget);

// One funder's full portfolio (summary + buckets + maturity schedule + target)
router.get('/funders/:id', portfolioController.getFunderPortfolio);

module.exports = router;
