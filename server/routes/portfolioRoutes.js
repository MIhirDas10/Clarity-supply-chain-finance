const express = require("express");
const router = express.Router();
const portfolioController = require("../controllers/portfolioController");
const stressController = require("../controllers/stressController");

// Platform-wide totals across all funders
router.get("/summary", portfolioController.getSummary);

// Portfolio Stress Testing (funder risk simulation)
router.get("/stress/scenarios", stressController.listScenarios);
router.post("/stress/scenarios", stressController.createScenario);
router.get("/stress/scenarios/:id", stressController.getScenario);
router.patch("/stress/scenarios/:id", stressController.updateScenario);
router.delete("/stress/scenarios/:id", stressController.deleteScenario);
router.post("/stress/run", stressController.runStress);
router.get("/stress/runs", stressController.listRuns);

// Return Calculator / Deployment Planner - projects returns from funder inputs
router.post("/return-calculator", portfolioController.returnCalculator);

// Investment notes
router.get("/notes", portfolioController.getNotes);
router.post("/notes", portfolioController.createNote);
router.patch("/notes/:id", portfolioController.updateNote);
router.delete("/notes/:id", portfolioController.deleteNote);

// List all funders with headline portfolio numbers
router.get("/funders", portfolioController.getFunders);

// Set a funder's target return % (shown vs actual on the dashboard)
router.put("/funders/:id/target", portfolioController.setTarget);

// One funder's full portfolio (summary + buckets + maturity schedule + target)
router.get("/funders/:id", portfolioController.getFunderPortfolio);

module.exports = router;
