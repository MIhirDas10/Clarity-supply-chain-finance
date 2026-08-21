// ===========================================================================
// Feature 3 - Part B: Portfolio Stress Testing & Scenario Analysis
// (Mihir Das, SL 2)
//
// A funder-owned risk simulation. The funder saves adverse SCENARIOS (spike
// default rates, extend how long capital is tied up, haircut the recovery on a
// default) and RUNS them against the portfolio they already hold. The engine
// re-prices default risk under the shock and reports how much worse the
// expected loss and risk-adjusted return get, and whether the portfolio still
// clears zero ("survives").
//
// This does NOT select or fund invoices - it only reads the funder's existing
// holdings (via portfolioController.activeHoldingsWithRisk) and simulates. It
// therefore never overlaps Apurba's Auto-Invest (acquisition) engine.
// ===========================================================================
const pool = require('../db');
const portfolio = require('./portfolioController');
const notificationService = require('../services/notificationService');

function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

function validateScenario(body) {
    const problems = [];
    if (!body.name || !String(body.name).trim()) problems.push('name is required');
    const drs = Number(body.defaultRateShock);
    if (!isFinite(drs) || drs < 0 || drs > 100) problems.push('defaultRateShock must be 0-100 (percentage points)');
    const ext = Number(body.tenorExtensionDays);
    if (!isFinite(ext) || ext < 0 || ext > 365) problems.push('tenorExtensionDays must be 0-365');
    const hc = Number(body.recoveryHaircut);
    if (!isFinite(hc) || hc < 0 || hc > 1) problems.push('recoveryHaircut must be 0-1');
    return problems;
}

// ---- Scenario CRUD --------------------------------------------------------

// GET /api/portfolio/stress/scenarios (?funder=)
// Returns the funder's own scenarios plus shared templates (funder_id IS NULL).
exports.listScenarios = async (req, res) => {
    try {
        const funder = req.query.funder ? String(req.query.funder) : null;
        const result = funder
            ? await pool.query(
                'SELECT * FROM stress_scenarios WHERE funder_id = $1 OR funder_id IS NULL ORDER BY funder_id NULLS FIRST, created_at DESC',
                [funder])
            : await pool.query('SELECT * FROM stress_scenarios ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Stress List Scenarios Error:', error);
        res.status(500).json({ error: 'Failed to load scenarios' });
    }
};

// GET /api/portfolio/stress/scenarios/:id
exports.getScenario = async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM stress_scenarios WHERE id = $1', [Number(req.params.id)]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Scenario not found' });
        res.status(200).json(r.rows[0]);
    } catch (error) {
        console.error('Stress Get Scenario Error:', error);
        res.status(500).json({ error: 'Failed to load scenario' });
    }
};

// POST /api/portfolio/stress/scenarios
// body: { funderId?, name, description?, defaultRateShock, tenorExtensionDays, recoveryHaircut }
exports.createScenario = async (req, res) => {
    try {
        const problems = validateScenario(req.body);
        if (problems.length) return res.status(400).json({ error: problems.join(', ') });
        const { funderId, name, description, defaultRateShock, tenorExtensionDays, recoveryHaircut } = req.body;
        const r = await pool.query(`
            INSERT INTO stress_scenarios (funder_id, name, description, default_rate_shock, tenor_extension_days, recovery_haircut)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [funderId ? String(funderId) : null, String(name).trim(), description ? String(description).trim() : null,
            Number(defaultRateShock), Math.round(Number(tenorExtensionDays)), Number(recoveryHaircut)]);
        res.status(201).json(r.rows[0]);
    } catch (error) {
        console.error('Stress Create Scenario Error:', error);
        res.status(500).json({ error: 'Failed to create scenario' });
    }
};

// PATCH /api/portfolio/stress/scenarios/:id  (any subset of the fields)
exports.updateScenario = async (req, res) => {
    try {
        const map = {
            name: 'name', description: 'description',
            defaultRateShock: 'default_rate_shock',
            tenorExtensionDays: 'tenor_extension_days',
            recoveryHaircut: 'recovery_haircut'
        };
        const sets = [];
        const params = [];
        Object.keys(map).forEach(k => {
            if (req.body[k] !== undefined) {
                params.push(k === 'name' || k === 'description' ? req.body[k] : Number(req.body[k]));
                sets.push(map[k] + ' = $' + params.length);
            }
        });
        if (sets.length === 0) return res.status(400).json({ error: 'Provide at least one field to update' });
        params.push(Number(req.params.id));
        const r = await pool.query(
            'UPDATE stress_scenarios SET ' + sets.join(', ') + ', updated_at = NOW() WHERE id = $' + params.length + ' RETURNING *',
            params);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Scenario not found' });
        res.status(200).json(r.rows[0]);
    } catch (error) {
        console.error('Stress Update Scenario Error:', error);
        res.status(500).json({ error: 'Failed to update scenario' });
    }
};

// DELETE /api/portfolio/stress/scenarios/:id
exports.deleteScenario = async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM stress_scenarios WHERE id = $1 RETURNING id', [Number(req.params.id)]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Scenario not found' });
        res.status(200).json({ message: 'Scenario deleted', id: r.rows[0].id });
    } catch (error) {
        console.error('Stress Delete Scenario Error:', error);
        res.status(500).json({ error: 'Failed to delete scenario' });
    }
};

// ---- The stress engine ----------------------------------------------------

// Apply one scenario's shocks to a single holding and return its stressed loss.
function stressHolding(h, scenario) {
    const stressedPD = clamp(h.pdAnnual + Number(scenario.default_rate_shock) / 100, 0, 1);
    const stressedDays = h.holdingDays + Number(scenario.tenor_extension_days);
    const baseRecovery = 1 - h.lgd;
    const stressedLGD = clamp(1 - baseRecovery * (1 - Number(scenario.recovery_haircut)), 0, 1);
    const stressedLoss = h.principal * (stressedPD * (stressedDays / 365)) * stressedLGD;
    return { stressedPD, stressedLGD, stressedLoss };
}

// POST /api/portfolio/stress/run
// body: { funderId, scenarioId }
exports.runStress = async (req, res) => {
    try {
        const funderId = req.body.funderId ? String(req.body.funderId) : null;
        const scenarioId = Number(req.body.scenarioId);
        if (!funderId) return res.status(400).json({ error: 'funderId is required' });
        if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required' });

        const sr = await pool.query('SELECT * FROM stress_scenarios WHERE id = $1', [scenarioId]);
        if (sr.rows.length === 0) return res.status(404).json({ error: 'Scenario not found' });
        const scenario = sr.rows[0];

        const holdings = await portfolio.activeHoldingsWithRisk(funderId);
        if (holdings.length === 0) {
            return res.status(400).json({ error: 'No active holdings to stress for this funder' });
        }

        let deployed = 0, projected = 0, baseEL = 0, stressedEL = 0;
        const contributors = [];
        holdings.forEach(h => {
            const s = stressHolding(h, scenario);
            deployed += h.principal;
            projected += h.netReturn;
            baseEL += h.expectedLoss;
            stressedEL += s.stressedLoss;
            contributors.push({
                buyerName: h.buyerName,
                principal: Math.round(h.principal),
                basePd: Number((h.pdAnnual * 100).toFixed(1)),
                stressedPd: Number((s.stressedPD * 100).toFixed(1)),
                baseLoss: Math.round(h.expectedLoss),
                stressedLoss: Math.round(s.stressedLoss),
                lossIncrease: Math.round(s.stressedLoss - h.expectedLoss)
            });
        });
        contributors.sort((a, b) => b.lossIncrease - a.lossIncrease);

        const baselineRiskAdjusted = projected - baseEL;
        const stressedRiskAdjusted = projected - stressedEL;
        const survives = stressedRiskAdjusted >= 0;

        // Persist the run for the history/audit trail.
        const saved = await pool.query(`
            INSERT INTO stress_runs
              (funder_id, scenario_id, scenario_name, deployed_capital, projected_return,
               baseline_expected_loss, stressed_expected_loss, baseline_risk_adjusted,
               stressed_risk_adjusted, survives)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at
        `, [funderId, scenarioId, scenario.name, Math.round(deployed), Math.round(projected),
            Math.round(baseEL), Math.round(stressedEL), Math.round(baselineRiskAdjusted),
            Math.round(stressedRiskAdjusted), survives]);

        // Event-driven alert: a portfolio that goes underwater under stress is
        // published to the Notification Center (Module 1) - the external-API seam.
        if (!survives) {
            try {
                await notificationService.sendNotification({
                    recipient: process.env.RISK_EMAIL || 'risk@clarityb2b.com',
                    message: `Stress test "${scenario.name}" would push the portfolio to a net loss of ` +
                             `৳${Math.abs(Math.round(stressedRiskAdjusted)).toLocaleString()} ` +
                             `(expected loss rises from ৳${Math.round(baseEL).toLocaleString()} to ৳${Math.round(stressedEL).toLocaleString()}).`,
                    invoiceLink: '/portfolio',
                    type: 'stress_breach',
                    emailSubject: 'Clarity B2B: Portfolio Stress Test Breach'
                });
            } catch (e) {
                console.error('Could not publish stress alert:', e.message);
            }
        }

        res.status(200).json({
            runId: saved.rows[0].id,
            createdAt: saved.rows[0].created_at,
            scenario: {
                id: scenario.id, name: scenario.name, description: scenario.description,
                defaultRateShock: Number(scenario.default_rate_shock),
                tenorExtensionDays: Number(scenario.tenor_extension_days),
                recoveryHaircut: Number(scenario.recovery_haircut)
            },
            holdingsCount: holdings.length,
            deployedCapital: Math.round(deployed),
            projectedReturn: Math.round(projected),
            baseline: {
                expectedLoss: Math.round(baseEL),
                riskAdjustedReturn: Math.round(baselineRiskAdjusted)
            },
            stressed: {
                expectedLoss: Math.round(stressedEL),
                riskAdjustedReturn: Math.round(stressedRiskAdjusted)
            },
            lossIncrease: Math.round(stressedEL - baseEL),
            returnErosionPct: baselineRiskAdjusted !== 0
                ? Number((((baselineRiskAdjusted - stressedRiskAdjusted) / Math.abs(baselineRiskAdjusted)) * 100).toFixed(1)) : 0,
            survives,
            topContributors: contributors.slice(0, 6)
        });
    } catch (error) {
        console.error('Stress Run Error:', error);
        res.status(500).json({ error: 'Failed to run stress test' });
    }
};

// GET /api/portfolio/stress/runs (?funder=)
exports.listRuns = async (req, res) => {
    try {
        const funder = req.query.funder ? String(req.query.funder) : null;
        const result = funder
            ? await pool.query('SELECT * FROM stress_runs WHERE funder_id = $1 ORDER BY created_at DESC LIMIT 50', [funder])
            : await pool.query('SELECT * FROM stress_runs ORDER BY created_at DESC LIMIT 50');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Stress List Runs Error:', error);
        res.status(500).json({ error: 'Failed to load run history' });
    }
};
