const express = require("express");
const router = express.Router();
const healthController = require("../controllers/healthController");

// all suppliers with their health scores
router.get("/suppliers", healthController.getSupplierHealth);

// risk index summary
router.get("/summary", healthController.getSummary);

// recalculate and save every supplier's score, raising distress alerts
router.post("/recalculate", healthController.recalculate);

// distress alerts
router.get("/alerts", healthController.getAlerts);

// acknowledge (mark read) one distress alert
router.patch("/alerts/:id/acknowledge", healthController.acknowledgeAlert);

// scoring configuration (band thresholds)
router.get("/config", healthController.getConfig);
router.patch("/config", healthController.updateConfig);

// suppliers on the buyer's review watchlist
router.get("/watchlist", healthController.getWatchlist);

// add or remove one supplier from the watchlist
router.post("/suppliers/:id/watchlist", healthController.toggleWatchlist);

// single supplier's health detail
router.get("/suppliers/:id", healthController.getSupplierById);

module.exports = router;
