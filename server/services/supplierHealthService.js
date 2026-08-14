const pool = require("../db");
const notificationService = require("./notificationService");

const BUYER_RECIPIENT = process.env.BUYER_EMAIL || "buyer@clarityb2b.com";
const DEFAULT_CONFIG = { watchBelow: 80, distressBelow: 60 };
const BAND_COLOR = { Healthy: "green", Watch: "yellow", Distress: "red" };
const BAND_RANK = { Healthy: 0, Watch: 1, Distress: 2 };

function rankBand(band) {
  return BAND_RANK[band] || 0;
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

async function readConfig() {
  try {
    const { rows } = await pool.query(
      "SELECT watch_below, distress_below FROM supplier_health_config WHERE id = 1",
    );

    if (rows[0]) {
      return {
        watchBelow: rows[0].watch_below,
        distressBelow: rows[0].distress_below,
      };
    }
  } catch (error) {
    console.error(
      "Could not read health config, using defaults:",
      error.message,
    );
  }

  return DEFAULT_CONFIG;
}

async function updateConfig({ watchBelow, distressBelow }) {
  await pool.query(
    `
      INSERT INTO supplier_health_config (id, watch_below, distress_below)
      VALUES (1, $1, $2)
      ON CONFLICT (id)
      DO UPDATE SET watch_below = $1, distress_below = $2
    `,
    [watchBelow, distressBelow],
  );

  return {
    message: "Thresholds updated",
    watchBelow,
    distressBelow,
  };
}

async function optionalRows(query, params, fallbackMessage) {
  try {
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error(`${fallbackMessage}:`, error.message);
    return [];
  }
}

async function getInvoices(buyerName) {
  const params = buyerName ? [buyerName] : [];
  const buyerFilter = buyerName ? " AND buyer_name = $1" : "";

  const { rows } = await pool.query(
    `
      SELECT supplier_id, status, invoice_amount, payout_amount
      FROM invoices
      WHERE supplier_id IS NOT NULL${buyerFilter}
    `,
    params,
  );

  return rows;
}

async function getCorrectionCounts(buyerName) {
  const params = buyerName ? [buyerName] : [];
  const buyerFilter = buyerName ? " AND i.buyer_name = $1" : "";
  const rows = await optionalRows(
    `
      SELECT i.supplier_id, COUNT(*)::int AS count
      FROM invoice_history h
      JOIN invoices i ON h.invoice_id = i.id
      WHERE h.old_status = 'Disputed'
        AND h.stage IN ('Submitted', 'Buyer Confirmed')${buyerFilter}
      GROUP BY i.supplier_id
    `,
    params,
    "Could not read correction history",
  );

  return Object.fromEntries(rows.map((row) => [row.supplier_id, row.count]));
}

async function getWatchlistMap() {
  const rows = await optionalRows(
    "SELECT supplier_id, watchlisted FROM supplier_watchlist",
    [],
    "Could not read watchlist, treating all as not flagged",
  );

  return Object.fromEntries(
    rows.map((row) => [row.supplier_id, row.watchlisted === true]),
  );
}

async function getNameMap() {
  const [supplierRows, customRows] = await Promise.all([
    optionalRows(
      "SELECT id, name FROM suppliers",
      [],
      "Could not read suppliers table, using fallback labels",
    ),
    optionalRows(
      "SELECT supplier_id, name FROM supplier_names",
      [],
      "Could not read supplier_names table",
    ),
  ]);

  const names = {};
  supplierRows.forEach((row) => {
    names[String(row.id)] = row.name;
  });
  customRows.forEach((row) => {
    names[row.supplier_id] = row.name;
  });

  return names;
}

function emptyStats(id, names, correctionCounts) {
  return {
    id,
    name: names[id] || `Supplier ${id}`,
    totalInvoices: 0,
    earlyFunded: 0,
    disputed: 0,
    lateCorrections: correctionCounts[id] || 0,
    totalDiscount: 0,
    totalInvoiceAmount: 0,
  };
}

function buildSupplierStats(invoices, names, correctionCounts) {
  const suppliers = {};

  invoices.forEach((invoice) => {
    const id = invoice.supplier_id;
    suppliers[id] ||= emptyStats(id, names, correctionCounts);

    const supplier = suppliers[id];
    const amount = Number(invoice.invoice_amount) || 0;
    const payout = Number(invoice.payout_amount) || 0;

    supplier.totalInvoices += 1;
    supplier.totalInvoiceAmount += amount;

    if (payout > 0 && payout < amount) {
      supplier.earlyFunded += 1;
      supplier.totalDiscount += amount - payout;
    }

    if (invoice.status === "Disputed") {
      supplier.disputed += 1;
    }
  });

  return Object.values(suppliers);
}

function getBand(score, config) {
  if (score < config.distressBelow) {
    return "Distress";
  }
  if (score < config.watchBelow) {
    return "Watch";
  }
  return "Healthy";
}

function scoreSupplier(supplier, config, watchlist) {
  let score = 100;
  const reasons = [];

  function addPenalty(points, reason) {
    score -= points;
    reasons.push(`-${points} pts: ${reason}`);
  }

  const earlyFundingRate = supplier.earlyFunded / supplier.totalInvoices;
  const avgDiscountRate =
    supplier.totalInvoiceAmount > 0
      ? supplier.totalDiscount / supplier.totalInvoiceAmount
      : 0;

  if (earlyFundingRate > 0.8) {
    addPenalty(
      20,
      "Extremely high reliance on early funding (>80% of invoices)",
    );
  } else if (earlyFundingRate > 0.5) {
    addPenalty(10, "High reliance on early funding (>50% of invoices)");
  }

  if (avgDiscountRate > 0.05) {
    addPenalty(15, "Accepting aggressively high discount rates (>5% avg)");
  }

  if (supplier.disputed > 0) {
    addPenalty(
      supplier.disputed * 10,
      `${supplier.disputed} disputed invoice(s) causing buyer friction`,
    );
  }

  if (supplier.lateCorrections > 0) {
    addPenalty(
      supplier.lateCorrections * 5,
      `${supplier.lateCorrections} late correction(s) after a dispute`,
    );
  }

  const scoreFloor = Math.max(0, score);
  const band = getBand(scoreFloor, config);

  return {
    ...supplier,
    score: scoreFloor,
    band,
    color: BAND_COLOR[band],
    reasons:
      reasons.length > 0
        ? reasons
        : ["Excellent operational and financial track record"],
    earlyFundingRate: Math.round(earlyFundingRate * 100),
    avgDiscountRate: (avgDiscountRate * 100).toFixed(1),
    watchlisted: watchlist[supplier.id] || false,
  };
}

async function computeHealth(buyerName) {
  const [config, invoices, correctionCounts, watchlist, names] =
    await Promise.all([
      readConfig(),
      getInvoices(buyerName),
      getCorrectionCounts(buyerName),
      getWatchlistMap(),
      getNameMap(),
    ]);

  return buildSupplierStats(invoices, names, correctionCounts).map((supplier) =>
    scoreSupplier(supplier, config, watchlist),
  );
}

function summarize(analytics) {
  const counts = { Healthy: 0, Watch: 0, Distress: 0 };

  analytics.forEach((supplier) => {
    counts[supplier.band] += 1;
  });

  return {
    totalSuppliers: analytics.length,
    healthy: counts.Healthy,
    watch: counts.Watch,
    distress: counts.Distress,
    healthyPercent: percent(counts.Healthy, analytics.length),
    watchPercent: percent(counts.Watch, analytics.length),
    distressPercent: percent(counts.Distress, analytics.length),
  };
}

async function getPreviousBand(supplierId) {
  const { rows } = await pool.query(
    "SELECT band FROM supplier_health WHERE supplier_id = $1",
    [supplierId],
  );
  return rows[0]?.band || null;
}

async function saveHealth(supplier) {
  await pool.query(
    `
      INSERT INTO supplier_health (supplier_id, score, band, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (supplier_id)
      DO UPDATE SET score = $2, band = $3, updated_at = NOW()
    `,
    [supplier.id, supplier.score, supplier.band],
  );
}

function getAlertMessage(supplier, previousBand) {
  const gotWorse = rankBand(supplier.band) > rankBand(previousBand);

  if (supplier.watchlisted && previousBand && gotWorse) {
    return `[Watchlist] ${supplier.name} slipped into the ${supplier.band} band (score ${supplier.score}). Early warning on a supplier you are monitoring.`;
  }

  if (
    !supplier.watchlisted &&
    supplier.band === "Distress" &&
    previousBand !== "Distress"
  ) {
    return `Supplier ${supplier.name} has crossed into the Distress band (score ${supplier.score}).`;
  }

  return null;
}

async function createAlert(supplier, message) {
  await pool.query(
    `
      INSERT INTO supplier_health_alerts (supplier_id, score, message)
      VALUES ($1, $2, $3)
    `,
    [supplier.id, supplier.score, message],
  );

  await notificationService.sendNotification({
    recipient: BUYER_RECIPIENT,
    message,
    invoiceLink: "/health",
    type: "distress_alert",
    emailSubject: "Clarity B2B: Supplier Health Alert",
  });
}

async function runRecalculation() {
  const analytics = await computeHealth();

  for (const supplier of analytics) {
    const previousBand = await getPreviousBand(supplier.id);
    await saveHealth(supplier);

    const message = getAlertMessage(supplier, previousBand);
    if (message) {
      await createAlert(supplier, message);
    }
  }

  return analytics;
}

async function getAlerts() {
  const { rows } = await pool.query(
    "SELECT * FROM supplier_health_alerts ORDER BY created_at DESC",
  );
  return rows;
}

async function acknowledgeAlert(id) {
  const { rows } = await pool.query(
    "UPDATE supplier_health_alerts SET is_read = TRUE WHERE id = $1 RETURNING *",
    [id],
  );
  return rows[0] || null;
}

async function toggleWatchlist(supplierId) {
  const current = await pool.query(
    "SELECT watchlisted FROM supplier_watchlist WHERE supplier_id = $1",
    [supplierId],
  );
  const watchlisted = !(current.rows[0]?.watchlisted === true);

  await pool.query(
    `
      INSERT INTO supplier_watchlist (supplier_id, watchlisted, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (supplier_id)
      DO UPDATE SET watchlisted = $2, updated_at = NOW()
    `,
    [supplierId, watchlisted],
  );

  return { supplierId, watchlisted };
}

module.exports = {
  acknowledgeAlert,
  computeHealth,
  getAlerts,
  readConfig,
  runRecalculation,
  summarize,
  toggleWatchlist,
  updateConfig,
};
