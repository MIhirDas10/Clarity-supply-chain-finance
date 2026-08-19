const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

// Rating distribution + average score
router.get('/summary', creditController.getSummary);

// Recompute and save all buyer scores (appends history)
router.post('/recalculate', creditController.recalculate);

// All buyers with current scores
router.get('/buyers', creditController.getBuyers);

// One buyer's score-change history (more specific path first)
router.get('/buyers/:name/history', creditController.getHistory);

// One buyer's full credit detail (read by discount calc / risk rating)
router.get('/buyers/:name', creditController.getBuyer);

module.exports = router;
