const express = require("express");
const router = express.Router();
const creditController = require("../controllers/creditController");

// Rating distribution + average score
router.get("/summary", creditController.getSummary);

// Tunable component weights (GET current, PATCH to retune)
router.get("/config", creditController.getConfig);
router.patch("/config", creditController.updateConfig);

// Risk-based pricing model parameters (GET current, PATCH to tune)
router.get("/pricing-policy", creditController.getPricingPolicy);
router.patch("/pricing-policy", creditController.updatePricingPolicy);

// Recompute and save all buyer scores (appends history)
router.post("/recalculate", creditController.recalculate);

// All buyers with current scores
router.get("/buyers", creditController.getBuyers);

// One buyer's score-change history (more specific paths first)
router.get("/buyers/:name/history", creditController.getHistory);

// Analyst credit-review notes for one buyer (GET + POST + DELETE)
router.get("/buyers/:name/notes", creditController.getNotes);
router.post("/buyers/:name/notes", creditController.addNote);
router.delete("/buyers/:name/notes/:id", creditController.deleteNote);

// Manual score override with a reason (written to history)
router.patch("/buyers/:name/override", creditController.override);

// Credit Limit & Exposure Engine
router.get("/buyers/:name/exposure", creditController.getExposure);
router.patch("/buyers/:name/limit", creditController.setLimit);

// Risk-based pricing for one buyer's invoice (?amount=&tenor=)
// consumed by the discount calculator and risk rating engine.
router.get("/buyers/:name/pricing", creditController.getPricing);

// One buyer's full credit detail (read by discount calc / risk rating)
router.get("/buyers/:name", creditController.getBuyer);

module.exports = router;
