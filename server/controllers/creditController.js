const pool = require("../db");
const https = require("https");

// Default scoring weights used when credit_config is not available.
const DEFAULT_WEIGHTS = {
  paymentSpeed: 0.3,
  reliability: 0.25,
  disputeFree: 0.25,
  trackRecord: 0.2,
};

// Default pricing policy used when pricing_policy is not available.
const DEFAULT_PRICING = {
  baseRate: 8.0,
  platformMargin: 2.0,
  lgd: 0.4,
  pdFloor: 0.01,
  pdCeiling: 0.25,
};

// Statuses that count as buyer-confirmed track record.
const CONFIRMED_STAGES = new Set(["Buyer Confirmed", "Funded", "Payout Initiated", "Completed"]);
const MAX_CREDIT_LIMIT = 10000000;
const DAY_MS = 86400000;

// Maps API-friendly weight names to their database columns.
const WEIGHT_COLUMNS = {
  paymentSpeed: "payment_speed",
  reliability: "reliability",
  disputeFree: "dispute_free",
  trackRecord: "track_record",
};

// Maps API-friendly pricing names to their database columns.
const PRICING_COLUMNS = {
  baseRate: "base_rate",
  platformMargin: "platform_margin",
  lgd: "lgd",
  pdFloor: "pd_floor",
  pdCeiling: "pd_ceiling",
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function daysBetween(later, earlier) {
  return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / DAY_MS);
}

function ratingFor(score) {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

function ratingRank(rating) {
  return { Poor: 0, Fair: 1, Good: 2, Excellent: 3 }[rating] ?? 0;
}

function recommendedLimitFor(score) {
  return Math.round((score / 100) * MAX_CREDIT_LIMIT);
}

// Converts a DB row into camelCase config, falling back to defaults.
function fromDb(row, columns, defaults) {
  if (!row) return { ...defaults };
  return Object.fromEntries(
    Object.entries(columns).map(([key, column]) => [key, Number(row[column])]),
  );
}

// Merges partial numeric PATCH bodies with the current saved values.
function mergeNumberPatch(body, current, keys) {
  return Object.fromEntries(
    keys.map((key) => [key, body[key] !== undefined ? Number(body[key]) : current[key]]),
  );
}

// Shared config loader for both weight and pricing tables.
async function loadConfig(sql, columns, defaults, logLabel) {
  try {
    const { rows } = await pool.query(sql);
    return fromDb(rows[0], columns, defaults);
  } catch (error) {
    console.error(logLabel, error.message);
    return { ...defaults };
  }
}

// Keeps score weights valid and on the same 0-100 scale.
function normalizeWeights(weights) {
  const vals = Object.values(weights);
  if (vals.some((v) => !isFinite(v) || v < 0)) {
    return { error: "Weights must be non-negative numbers" };
  }
  const total = vals.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return { error: "Weights cannot all be zero" };
  return {
    value: Object.fromEntries(Object.entries(weights).map(([key, v]) => [key, v / total])),
  };
}

// Keeps route handlers small while preserving consistent error responses.
async function handle(res, label, message, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(label, error);
    res.status(500).json({ error: message });
  }
}

// Loads the active scoring model weights.
async function loadWeights() {
  return loadConfig(
    "SELECT payment_speed, reliability, dispute_free, track_record FROM credit_config WHERE id = 1",
    WEIGHT_COLUMNS,
    DEFAULT_WEIGHTS,
    "Could not read credit_config, using defaults:",
  );
}



// Loads the active score-to-price policy.
async function loadPricingPolicy() {
  const policy = await loadConfig(
    "SELECT base_rate, platform_margin, lgd, pd_floor, pd_ceiling FROM pricing_policy WHERE id = 1",
    PRICING_COLUMNS,
    DEFAULT_PRICING,
    "Could not read pricing_policy, using defaults:",
  );

  return policy;
}

// Higher scores map to lower annual probability of default.
function pdFromScore(score, policy) {
  const s = clamp(score, 0, 100);
  return policy.pdCeiling - (s / 100) * (policy.pdCeiling - policy.pdFloor);
}

// Converts score, amount, and tenor into a risk-based invoice quote.
function priceInvoice(score, amount, tenorDays, policy) {
  const pdAnnualRaw = pdFromScore(score, policy);
  const riskPremium = pdAnnualRaw * policy.lgd * 100;
  const annualRate = policy.baseRate + policy.platformMargin + riskPremium;
  const discountRate = annualRate * (tenorDays / 365);
  const discountAmount = amount * (discountRate / 100);
  const pdTenor = pdAnnualRaw * (tenorDays / 365);

  return {
    pdAnnual: Number((pdAnnualRaw * 100).toFixed(2)),
    lgd: policy.lgd,
    baseRate: policy.baseRate,
    platformMargin: policy.platformMargin,
    riskPremium: Number(riskPremium.toFixed(2)),
    annualRate: Number(annualRate.toFixed(2)),
    tenorDays,
    discountRate: Number(discountRate.toFixed(2)),
    discountAmount: Math.round(discountAmount),
    supplierPayout: Math.round(amount - discountAmount),
    expectedLoss: Math.round(amount * pdTenor * policy.lgd),
  };
}

// Reads raw invoice facts used by the credit model.
async function loadInvoices(buyerName) {
  const params = [];
  let sql = `
    SELECT buyer_name, status, invoice_amount, funder_id, submitted_date, due_date, payment_date
    FROM invoices
    WHERE buyer_name IS NOT NULL AND buyer_name <> ''
  `;
  if (buyerName) {
    params.push(buyerName);
    sql += " AND buyer_name = $1";
  }
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Creates the accumulator used while grouping invoices by buyer.
function emptyBuyer(buyerName) {
  return {
    buyerName,
    total: 0,
    confirmed: 0,
    disputed: 0,
    repaid: 0,
    overdue: 0,
    daysToPaySum: 0,
    financedVolume: 0,
  };
}

// Aggregates invoice rows into per-buyer credit metrics.
function collectBuyerMetrics(invoices) {
  const today = new Date();
  const buyers = {};

  for (const inv of invoices) {
    const name = inv.buyer_name;
    const buyer = (buyers[name] ||= emptyBuyer(name));
    buyer.total += 1;
    if (CONFIRMED_STAGES.has(inv.status)) buyer.confirmed += 1;
    if (inv.status === "Disputed") buyer.disputed += 1;
    if (inv.funder_id) buyer.financedVolume += Number(inv.invoice_amount) || 0;

    if (inv.payment_date !== null) {
      buyer.repaid += 1;
      if (inv.submitted_date) {
        const days = daysBetween(inv.payment_date, inv.submitted_date);
        if (days > 0) buyer.daysToPaySum += days;
      }
      if (inv.due_date && new Date(inv.payment_date) > new Date(inv.due_date)) {
        buyer.overdue += 1;
      }
    } else if (inv.due_date && new Date(inv.due_date) < today) {
      buyer.overdue += 1;
    }
  }

  return Object.values(buyers);
}

// Turns one buyer's metrics into score, rating, reasons, and UI-ready details.
function scoreBuyer(buyer, weights) {
  const avgDaysToPay = buyer.repaid > 0 ? Math.round(buyer.daysToPaySum / buyer.repaid) : null;
  const paymentSpeed = buyer.repaid === 0
    ? 60
    : clamp(100 - Math.max(0, avgDaysToPay - 30) * (100 / 90), 0, 100);
  const reliability = (1 - (buyer.total > 0 ? buyer.overdue / buyer.total : 0)) * 100;
  const disputeFree = (1 - (buyer.total > 0 ? buyer.disputed / buyer.total : 0)) * 100;
  const confirmationScore = Math.min(100, buyer.confirmed * 20);
  const volumeScore = Math.min(100, (buyer.financedVolume / 5000000) * 100);
  const trackRecord = 0.6 * confirmationScore + 0.4 * volumeScore;

  const components = {
    paymentSpeed: Math.round(paymentSpeed),
    reliability: Math.round(reliability),
    disputeFree: Math.round(disputeFree),
    trackRecord: Math.round(trackRecord),
  };
  const score = Math.round(
    weights.paymentSpeed * paymentSpeed +
      weights.reliability * reliability +
      weights.disputeFree * disputeFree +
      weights.trackRecord * trackRecord,
  );

  return {
    buyerName: buyer.buyerName,
    score,
    rating: ratingFor(score),
    components,
    reasons: [
      `Payment speed ${components.paymentSpeed}/100` +
        (avgDaysToPay !== null ? ` (avg ${avgDaysToPay} days to pay)` : " (no repayments yet)"),
      `On-time reliability ${components.reliability}/100 (${buyer.overdue} overdue of ${buyer.total})`,
      `Dispute-free record ${components.disputeFree}/100 (${buyer.disputed} dispute(s) of ${buyer.total})`,
      `Track record ${components.trackRecord}/100 (${buyer.confirmed} confirmed, à§³${Math.round(buyer.financedVolume).toLocaleString()} financed)`,
    ],
    metrics: {
      totalInvoices: buyer.total,
      confirmationCount: buyer.confirmed,
      disputeCount: buyer.disputed,
      avgDaysToPay,
      overdueCount: buyer.overdue,
      financedVolume: Math.round(buyer.financedVolume),
    },
  };
}

// Computes live scores from invoice data without saving them.
async function computeScores(buyerName) {
  const [weights, invoices] = await Promise.all([loadWeights(), loadInvoices(buyerName)]);
  return collectBuyerMetrics(invoices).map((buyer) => scoreBuyer(buyer, weights));
}

// Builds the audit text stored whenever a score changes.
function buildHistoryReason(entry, oldScore) {
  const weakest = [
    ["payment speed", entry.components.paymentSpeed],
    ["on-time reliability", entry.components.reliability],
    ["dispute record", entry.components.disputeFree],
    ["track record", entry.components.trackRecord],
  ].sort((a, b) => a[1] - b[1])[0];

  let reason = oldScore === null || oldScore === undefined
    ? `Initial score ${entry.score} (${entry.rating}).`
    : `Score ${entry.score > oldScore ? "improved" : "declined"} from ${oldScore} to ${entry.score} (${entry.rating}).`;
  reason += ` Main factor: ${weakest[0]} at ${weakest[1]}/100`;
  if (entry.metrics.disputeCount > 0) reason += `; ${entry.metrics.disputeCount} dispute(s)`;
  if (entry.metrics.overdueCount > 0) reason += `; ${entry.metrics.overdueCount} overdue`;
  return reason + ".";
}

// Sends a risk notification only when a buyer falls into a worse rating band.
async function publishDowngrade(entry, oldScore, oldRating) {
  if (!oldRating || ratingRank(entry.rating) >= ratingRank(oldRating)) return;
  try {
    await pool.query(
      "INSERT INTO notifications (recipient, message, invoice_link, type) VALUES ($1, $2, $3, $4)",
      [
        process.env.RISK_EMAIL || "risk@clarityb2b.com",
        `Buyer ${entry.buyerName} credit downgraded from ${oldRating} to ${entry.rating} (score ${oldScore} â†’ ${entry.score}).`,
        "/credit",
        "credit-downgrade",
      ],
    );
  } catch (error) {
    console.error("Could not publish downgrade alert:", error.message);
  }
}

// Saves computed scores and appends history rows for new or changed scores.
async function runRecalculation() {
  const scores = await computeScores();

  for (const entry of scores) {
    const { rows } = await pool.query(
      "SELECT score, rating, manual_override FROM buyer_credit_score WHERE buyer_name = $1",
      [entry.buyerName],
    );
    const prev = rows[0] || {};
    const oldScore = rows.length > 0 ? prev.score : null;
    if (prev.manual_override === true) continue;

    await publishDowngrade(entry, oldScore, prev.rating || null);
    await pool.query(
      `
      INSERT INTO buyer_credit_score (buyer_name, score, rating, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (buyer_name)
      DO UPDATE SET score = $2, rating = $3, updated_at = NOW()
      WHERE buyer_credit_score.manual_override IS NOT TRUE
      `,
      [entry.buyerName, entry.score, entry.rating],
    );

    if (oldScore === null || oldScore !== entry.score) {
      await pool.query(
        "INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason) VALUES ($1, $2, $3, $4)",
        [entry.buyerName, entry.score, oldScore, buildHistoryReason(entry, oldScore)],
      );
    }
  }

  return scores;
}

// Loads analyst-pinned scores that should override computed scores.
async function loadOverrides(buyerName) {
  const overrides = {};
  try {
    const params = [];
    let sql =
      "SELECT buyer_name, score, rating, override_reason FROM buyer_credit_score WHERE manual_override = TRUE";
    if (buyerName) {
      params.push(buyerName);
      sql += " AND buyer_name = $1";
    }
    const { rows } = await pool.query(sql, params);
    for (const row of rows) {
      overrides[row.buyer_name] = {
        score: row.score,
        rating: row.rating,
        reason: row.override_reason,
      };
    }
  } catch (error) {
    console.error("Could not read overrides:", error.message);
  }
  return overrides;
}

// Applies a manual override while keeping the computed score visible.
function applyOverride(entry, overrides) {
  const override = overrides[entry.buyerName];
  return override
    ? {
        ...entry,
        score: override.score,
        rating: override.rating,
        computedScore: entry.score,
        overridden: true,
        overrideReason: override.reason,
      }
    : entry;
}

// Computes scores and overlays any manual analyst overrides.
async function scoresWithOverrides(buyerName) {
  const [scores, overrides] = await Promise.all([computeScores(buyerName), loadOverrides(buyerName)]);
  return scores.map((score) => applyOverride(score, overrides));
}

// Returns the buyer-name-to-score map consumed by portfolio analytics.
async function allBuyerScores() {
  const scores = await scoresWithOverrides();
  return Object.fromEntries(scores.map((score) => [score.buyerName, score.score]));
}

// Sums funded but unpaid invoices for the live exposure view.
async function computeExposure(buyerName) {
  const { rows } = await pool.query(
    `
    SELECT id, invoice_number, invoice_amount, due_date
    FROM invoices
    WHERE buyer_name = $1 AND funder_id IS NOT NULL AND payment_date IS NULL
    `,
    [buyerName],
  );
  let outstanding = 0;
  const invoices = rows.map((row) => {
    const amount = Number(row.invoice_amount) || 0;
    outstanding += amount;
    return {
      invoiceId: row.id,
      invoiceNumber: row.invoice_number,
      amount: Math.round(amount),
      dueDate: row.due_date,
    };
  });
  return { outstanding, invoices };
}

// Returns the enforced limit: custom limit first, otherwise score-derived.
async function creditLimitForBuyer(buyerName) {
  try {
    const { rows } = await pool.query("SELECT credit_limit FROM credit_limits WHERE buyer_name = $1", [buyerName]);
    if (rows.length > 0) return Math.round(Number(rows[0].credit_limit));
  } catch (error) {
    console.error("Could not read credit_limits:", error.message);
  }

  const scores = await scoresWithOverrides(buyerName);
  return recommendedLimitFor(scores.length === 0 ? 50 : scores[0].score);
}

// Checks a proposed funding amount inside the caller's transaction.
async function checkCreditLimit(db, buyerName, addAmount) {
  if (!buyerName) return { ok: true };
  const amount = Number(addAmount) || 0;
  const limit = await creditLimitForBuyer(buyerName);
  const { rows } = await db.query(
    `
    SELECT COALESCE(SUM(invoice_amount), 0) AS exposure
    FROM invoices
    WHERE buyer_name = $1 AND funder_id IS NOT NULL AND payment_date IS NULL
    `,
    [buyerName],
  );
  const exposure = Number(rows[0].exposure);
  const projected = exposure + amount;

  if (projected <= limit) return { ok: true, limit, exposure, projected };
  return {
    ok: false,
    limit,
    exposure,
    projected,
    reason: `Credit limit reached: funding à§³${Math.round(amount).toLocaleString()} would put ${buyerName} at à§³${Math.round(projected).toLocaleString()} exposure, over their à§³${Math.round(limit).toLocaleString()} credit limit (current exposure à§³${Math.round(exposure).toLocaleString()}). Raise the limit or clear the override on the Buyer Credit page to fund.`,
  };
}

// Clamps invoice tenor to the supported pricing range.
function tenorDaysUntil(dueDate) {
  if (!dueDate) return 60;
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / DAY_MS);
  return !isFinite(days) || days < 1 ? 1 : Math.min(days, 365);
}

// Produces the funding-time quote used by marketplace and wallet flows.
async function quoteForBuyer(buyerName, amount, tenorDays) {
  const scores = buyerName ? await scoresWithOverrides(buyerName) : [];
  const score = scores.length > 0 ? scores[0].score : 50;
  const policy = await loadPricingPolicy();
  return { score, ...priceInvoice(score, Number(amount) || 0, tenorDays, policy) };
}

// Fetches one scored buyer after applying manual overrides.
async function currentScore(name) {
  const scores = await scoresWithOverrides(name);
  return scores[0] || null;
}

// Route handler: list buyers worst-first.
exports.getBuyers = (req, res) =>
  handle(res, "Credit Buyers Error:", "Failed to compute buyer credit scores", async () => {
    const scores = await scoresWithOverrides();
    scores.sort((a, b) => a.score - b.score);
    res.status(200).json(scores);
  });

// Route handler: return one buyer's score detail.
exports.getBuyer = (req, res) =>
  handle(res, "Credit Buyer Error:", "Failed to compute buyer credit score", async () => {
    const buyer = await currentScore(req.params.name);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    res.status(200).json(buyer);
  });

// Route handler: return score-change history for one buyer.
exports.getHistory = (req, res) =>
  handle(res, "Credit History Error:", "Failed to load score history", async () => {
    const { rows } = await pool.query(
      "SELECT * FROM buyer_credit_history WHERE buyer_name = $1 ORDER BY created_at DESC",
      [req.params.name],
    );
    res.status(200).json(rows);
  });

// Route handler: recompute and save all buyer scores.
exports.recalculate = (req, res) =>
  handle(res, "Credit Recalculate Error:", "Failed to recalculate credit scores", async () => {
    const scores = await runRecalculation();
    res.status(200).json({
      message: "Buyer credit scores recalculated and saved",
      buyersProcessed: scores.length,
    });
  });

// Route handler: summarize rating distribution and average score.
exports.getSummary = (req, res) =>
  handle(res, "Credit Summary Error:", "Failed to compute credit summary", async () => {
    const scores = await computeScores();
    const counts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
    scores.forEach((score) => { counts[score.rating] += 1; });
    const averageScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length)
      : 0;
    res.status(200).json({
      totalBuyers: scores.length,
      averageScore,
      excellent: counts.Excellent,
      good: counts.Good,
      fair: counts.Fair,
      poor: counts.Poor,
    });
  });

// Route handler: read scoring weight config.
exports.getConfig = (req, res) =>
  handle(res, "Credit Config Read Error:", "Failed to load config", async () => {
    res.status(200).json({ weights: await loadWeights(), defaults: DEFAULT_WEIGHTS });
  });

// Route handler: update scoring weights after normalization.
exports.updateConfig = (req, res) =>
  handle(res, "Credit Config Update Error:", "Failed to update config", async () => {
    const merged = mergeNumberPatch(req.body, await loadWeights(), Object.keys(DEFAULT_WEIGHTS));
    const normalized = normalizeWeights(merged);
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    const w = normalized.value;
    await pool.query(
      `
      INSERT INTO credit_config (id, payment_speed, reliability, dispute_free, track_record, updated_at)
      VALUES (1, $1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET payment_speed = $1, reliability = $2, dispute_free = $3, track_record = $4, updated_at = NOW()
      `,
      [w.paymentSpeed, w.reliability, w.disputeFree, w.trackRecord],
    );
    res.status(200).json({ message: "Weights updated", weights: w });
  });

// Route handler: list analyst notes for one buyer.
exports.getNotes = (req, res) =>
  handle(res, "Credit Notes Read Error:", "Failed to load notes", async () => {
    const { rows } = await pool.query(
      "SELECT * FROM credit_notes WHERE buyer_name = $1 ORDER BY created_at DESC",
      [req.params.name],
    );
    res.status(200).json(rows);
  });

// Route handler: add an analyst note.
exports.addNote = (req, res) =>
  handle(res, "Credit Add Note Error:", "Failed to add note", async () => {
    const { note, author } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ error: "A non-empty note is required" });
    }
    const { rows } = await pool.query(
      "INSERT INTO credit_notes (buyer_name, note, author) VALUES ($1, $2, $3) RETURNING *",
      [req.params.name, String(note).trim(), author ? String(author).trim() : "Analyst"],
    );
    res.status(201).json(rows[0]);
  });

// Route handler: delete an analyst note.
exports.deleteNote = (req, res) =>
  handle(res, "Credit Delete Note Error:", "Failed to delete note", async () => {
    const { rows } = await pool.query(
      "DELETE FROM credit_notes WHERE id = $1 AND buyer_name = $2 RETURNING id",
      [Number(req.params.id), req.params.name],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Note not found" });
    res.status(200).json({ message: "Note deleted", id: rows[0].id });
  });

// Route handler: set or clear a manual score override.
exports.override = (req, res) =>
  handle(res, "Credit Override Error:", "Failed to override score", async () => {
    const name = req.params.name;
    const { score, reason } = req.body;
    const { rows } = await pool.query("SELECT score FROM buyer_credit_score WHERE buyer_name = $1", [name]);
    const oldScore = rows.length > 0 ? rows[0].score : null;

    if (score === null || score === undefined || score === "") {
      await pool.query(
        "UPDATE buyer_credit_score SET manual_override = FALSE, override_reason = NULL, updated_at = NOW() WHERE buyer_name = $1",
        [name],
      );
      await pool.query(
        "INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason) VALUES ($1, $2, $3, $4)",
        [name, oldScore, oldScore, `Manual override cleared${reason ? ": " + String(reason).trim() : ""}.`],
      );
      return res.status(200).json({ message: "Override cleared", buyerName: name });
    }

    const newScore = Math.round(Number(score));
    if (!isFinite(newScore) || newScore < 0 || newScore > 100) {
      return res.status(400).json({
        error: "score must be a number between 0 and 100 (or null to clear)",
      });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: "A reason is required for a manual override" });
    }

    const rating = ratingFor(newScore);
    const cleanReason = String(reason).trim();
    await pool.query(
      `
      INSERT INTO buyer_credit_score (buyer_name, score, rating, manual_override, override_reason, updated_at)
      VALUES ($1, $2, $3, TRUE, $4, NOW())
      ON CONFLICT (buyer_name)
      DO UPDATE SET score = $2, rating = $3, manual_override = TRUE, override_reason = $4, updated_at = NOW()
      `,
      [name, newScore, rating, cleanReason],
    );
    await pool.query(
      "INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason) VALUES ($1, $2, $3, $4)",
      [name, newScore, oldScore, `Manual override to ${newScore} (${rating}): ${cleanReason}`],
    );
    res.status(200).json({
      message: "Score overridden",
      buyerName: name,
      score: newScore,
      rating,
      overridden: true,
      overrideReason: cleanReason,
    });
  });

// Route handler: show live exposure against the buyer's credit limit.
exports.getExposure = (req, res) =>
  handle(res, "Credit Exposure Error:", "Failed to compute exposure", async () => {
    const name = req.params.name;
    const scored = await currentScore(name);
    if (!scored) return res.status(404).json({ error: "Buyer not found" });

    const recommendedLimit = recommendedLimitFor(scored.score);
    let creditLimit = recommendedLimit;
    let isCustomLimit = false;
    let setBy = null;

    try {
      const { rows } = await pool.query(
        "SELECT credit_limit, set_by FROM credit_limits WHERE buyer_name = $1",
        [name],
      );
      if (rows.length > 0) {
        creditLimit = Number(rows[0].credit_limit);
        isCustomLimit = true;
        setBy = rows[0].set_by;
      }
    } catch (error) {
      console.error("Could not read credit_limits:", error.message);
    }

    const { outstanding, invoices } = await computeExposure(name);
    const utilization = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0;
    const status = outstanding > creditLimit ? "Over Limit" : utilization >= 80 ? "Near Limit" : "OK";
    res.status(200).json({
      buyerName: name,
      score: scored.score,
      creditLimit: Math.round(creditLimit),
      recommendedLimit,
      isCustomLimit,
      setBy,
      exposure: Math.round(outstanding),
      utilization,
      headroom: Math.round(creditLimit - outstanding),
      status,
      outstandingCount: invoices.length,
      outstandingInvoices: invoices,
    });
  });

// Route handler: set or clear a custom credit limit.
exports.setLimit = (req, res) =>
  handle(res, "Credit Set Limit Error:", "Failed to set credit limit", async () => {
    const name = req.params.name;
    const { creditLimit } = req.body;

    if (creditLimit === null || creditLimit === undefined || creditLimit === "") {
      await pool.query("DELETE FROM credit_limits WHERE buyer_name = $1", [name]);
      return res.status(200).json({ message: "Reverted to recommended limit", buyerName: name });
    }

    const limit = Number(creditLimit);
    if (!isFinite(limit) || limit < 0) {
      return res.status(400).json({
        error: "creditLimit must be a non-negative number (or null to reset)",
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO credit_limits (buyer_name, credit_limit, set_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (buyer_name)
      DO UPDATE SET credit_limit = $2, set_by = $3, updated_at = NOW()
      RETURNING *
      `,
      [name, Math.round(limit), "Analyst"],
    );
    res.status(200).json({ message: "Credit limit updated", limit: rows[0] });
  });

// Route handler: read pricing policy config.
exports.getPricingPolicy = (req, res) =>
  handle(res, "Pricing Policy Read Error:", "Failed to load pricing policy", async () => {
    res.status(200).json({ policy: await loadPricingPolicy(), defaults: DEFAULT_PRICING });
  });

// Route handler: update pricing policy config.
exports.updatePricingPolicy = (req, res) =>
  handle(res, "Pricing Policy Update Error:", "Failed to update pricing policy", async () => {
    const p = mergeNumberPatch(req.body, await loadPricingPolicy(), Object.keys(DEFAULT_PRICING));
    if ([p.baseRate, p.platformMargin].some((v) => !isFinite(v) || v < 0)) {
      return res.status(400).json({ error: "Rates must be non-negative numbers" });
    }
    if (!isFinite(p.lgd) || p.lgd < 0 || p.lgd > 1) {
      return res.status(400).json({ error: "lgd must be between 0 and 1" });
    }
    if (
      ![p.pdFloor, p.pdCeiling].every((v) => isFinite(v) && v >= 0 && v <= 1) ||
      p.pdFloor > p.pdCeiling
    ) {
      return res.status(400).json({ error: "pdFloor/pdCeiling must be 0-1 with floor <= ceiling" });
    }

    await pool.query(
      `
      INSERT INTO pricing_policy (id, base_rate, platform_margin, lgd, pd_floor, pd_ceiling, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id)
      DO UPDATE SET base_rate = $1, platform_margin = $2, lgd = $3, pd_floor = $4, pd_ceiling = $5, updated_at = NOW()
      `,
      [p.baseRate, p.platformMargin, p.lgd, p.pdFloor, p.pdCeiling],
    );
    res.status(200).json({ message: "Pricing policy updated", policy: p });
  });

// Route handler: price one invoice for a buyer.
exports.getPricing = (req, res) =>
  handle(res, "Credit Pricing Error:", "Failed to price invoice", async () => {
    const name = req.params.name;
    // Fall back to the defaults only when the caller left the value out.
    // `Number(x) || default` treated an explicit 0 as missing, so amount=0
    // was silently priced as 100000 instead of being rejected below.
    const missing = (v) => v === undefined || v === null || String(v).trim() === "";
    const amount = missing(req.query.amount) ? 100000 : Number(req.query.amount);
    const tenor = missing(req.query.tenor) ? 60 : Number(req.query.tenor);
    if (!isFinite(amount) || amount <= 0 || !isFinite(tenor) || tenor <= 0 || tenor > 365) {
      return res.status(400).json({
        error: "amount must be > 0 and tenor between 1 and 365 days",
      });
    }

    const scored = await currentScore(name);
    if (!scored) return res.status(404).json({ error: "Buyer not found" });
    const policy = await loadPricingPolicy();
    res.status(200).json({
      buyerName: name,
      score: scored.score,
      rating: scored.rating,
      overridden: scored.overridden === true,
      invoiceAmount: Math.round(amount),
      ...priceInvoice(scored.score, amount, tenor, policy),
    });
  });

// Shared exports consumed outside creditRoutes.
exports.loadPricingPolicy = loadPricingPolicy;
exports.pdFromScore = pdFromScore;
exports.allBuyerScores = allBuyerScores;
exports.runRecalculation = runRecalculation;
exports.creditLimitForBuyer = creditLimitForBuyer;
exports.checkCreditLimit = checkCreditLimit;
exports.tenorDaysUntil = tenorDaysUntil;
exports.quoteForBuyer = quoteForBuyer;
