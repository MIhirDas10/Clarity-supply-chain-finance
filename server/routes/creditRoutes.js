const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

// Rating distribution + average score
router.get('/summary', creditController.getSummary);

// Tunable component weights (GET current, PATCH to retune)
router.get('/config', creditController.getConfig);
router.patch('/config', creditController.updateConfig);

// Recompute and save all buyer scores (appends history)
router.post('/recalculate', creditController.recalculate);

// All buyers with current scores
router.get('/buyers', creditController.getBuyers);

// One buyer's score-change history (more specific paths first)
router.get('/buyers/:name/history', creditController.getHistory);

// Analyst credit-review notes for one buyer (GET + POST + DELETE)
router.get('/buyers/:name/notes', creditController.getNotes);
router.post('/buyers/:name/notes', creditController.addNote);
router.delete('/buyers/:name/notes/:id', creditController.deleteNote);

// Manual score override with a reason (written to history)
router.patch('/buyers/:name/override', creditController.override);

// One buyer's full credit detail (read by discount calc / risk rating) - most
// generic path, so it is registered last.
router.get('/buyers/:name', creditController.getBuyer);

module.exports = router;
