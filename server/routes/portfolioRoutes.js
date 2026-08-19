const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');

// Platform-wide totals across all funders
router.get('/summary', portfolioController.getSummary);

// List all funders with headline portfolio numbers
router.get('/funders', portfolioController.getFunders);

// One funder's full portfolio (summary + buckets + maturity schedule)
router.get('/funders/:id', portfolioController.getFunderPortfolio);

module.exports = router;
