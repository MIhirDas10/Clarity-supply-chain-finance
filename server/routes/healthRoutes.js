const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// List all suppliers with their health scores (optional ?buyer=Name)
router.get('/suppliers', healthController.getSupplierHealth);

// Risk index summary: how many suppliers are in each band (optional ?buyer=Name)
router.get('/summary', healthController.getSummary);

// Recalculate and save every supplier's score, raising distress alerts
router.post('/recalculate', healthController.recalculate);

// Distress alerts
router.get('/alerts', healthController.getAlerts);
router.patch('/alerts/:id/acknowledge', healthController.acknowledgeAlert);

// Scoring configuration (band thresholds)
router.get('/config', healthController.getConfig);
router.patch('/config', healthController.updateConfig);

// Suppliers on the buyer's review watchlist
router.get('/watchlist', healthController.getWatchlist);

// Add or remove one supplier from the watchlist
router.post('/suppliers/:id/watchlist', healthController.toggleWatchlist);

// A single supplier's health detail. Kept last so it does not accidentally
// match the fixed paths above (like /summary or /alerts).
router.get('/suppliers/:id', healthController.getSupplierById);

module.exports = router;
