const pool = require("../db");
const notificationService = require("./notificationService");

const DEFAULT_CONFIG = { watchBelow: 80, distressBelow: 60 };
const BAND_COLOR = {
  "No Activity": "slate",
  Healthy: "green",
  Watch: "yellow",
  Distress: "red",
};
const BAND_RANK = { "No Activity": 0, Healthy: 1, Watch: 2, Distress: 3 };

function rankBand(band) {
  return BAND_RANK[band] || 0;
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeSupplierName(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function scopedSupplierId(supplierId, buyerName) {
  const id = clean(supplierId);
  if (!buyerName) return id;
  return `${normalizeSupplierName(buyerName)}::${id}`;
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
  const params = [buyerName || null];

  const { rows } = await pool.query(
    `
      SELECT COALESCE(i.supplier_id::text, '') AS supplier_id,
             e.supplier_name,
             e.erp_status AS status,
             e.amount AS invoice_amount,
             e.payout_amount
      FROM erp_ledger e
      LEFT JOIN invoices i ON i.id::text = e.invoice_id
      WHERE e.supplier_name IS NOT NULL
        AND ($1::text IS NULL OR LOWER(e.buyer_name) = LOWER($1))

      UNION ALL

      SELECT i.supplier_id::text AS supplier_id,
             COALESCE(account_user.business_name, named_user.business_name, supplier.name, alias.name, 'Supplier ' || i.supplier_id) AS supplier_name,
             i.status,
             i.invoice_amount,
             i.payout_amount
      FROM invoices i
      LEFT JOIN users account_user
        ON account_user.role = 'supplier' AND account_user.id::text = i.supplier_id
      LEFT JOIN suppliers supplier
        ON supplier.id::text = i.supplier_id
      LEFT JOIN supplier_names alias
        ON alias.supplier_id = i.supplier_id
      LEFT JOIN users named_user
        ON named_user.role = 'supplier'
       AND supplier.name IS NOT NULL
       AND LOWER(named_user.business_name) = LOWER(supplier.name)
      WHERE i.supplier_id IS NOT NULL
        AND ($1::text IS NULL OR LOWER(i.buyer_name) = LOWER($1))
        AND NOT EXISTS (
          SELECT 1 FROM erp_ledger e WHERE e.invoice_id = i.id::text
        )
    `,
    params,
  );

  return rows;
}

async function getCorrectionCounts(buyerName) {
  const params = buyerName ? [buyerName] : [];
  const buyerFilter = buyerName ? " AND LOWER(i.buyer_name) = LOWER($1)" : "";
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

async function getWatchlistMap(buyerName) {
  const rows = await optionalRows(
    "SELECT supplier_id, watchlisted FROM supplier_watchlist",
    [],
    "Could not read watchlist, treating all as not flagged",
  );
  const scopedPrefix = buyerName ? `${normalizeSupplierName(buyerName)}::` : "";
  const visibleRows = scopedPrefix
    ? rows.filter((row) => clean(row.supplier_id).startsWith(scopedPrefix))
    : rows;

  return Object.fromEntries(
    visibleRows.map((row) => [row.supplier_id, row.watchlisted === true]),
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

function mergeSupplierRows(groups) {
  const suppliers = new Map();

  for (const row of groups.flat()) {
    const id = clean(row.supplier_id || row.id);
    const name = clean(row.name);
    if (!id && !name) continue;

    const key = normalizeSupplierName(name) || `id:${id}`;
    const current = suppliers.get(key);
    const aliases = new Set(current?.aliases || []);
    if (id) aliases.add(id);

    suppliers.set(key, {
      id: current?.id || id || key,
      name: current?.name || name || `Supplier ${id}`,
      contact: current?.contact || clean(row.contact),
      status: current?.status || clean(row.status) || "Active",
      hasBuyerActivity: Boolean(
        current?.hasBuyerActivity || row.has_buyer_activity || row.hasBuyerActivity,
      ),
      aliases: [...aliases],
    });
  }

  return [...suppliers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function getSupplierMasterRows(buyerName) {
  const [accountRows, supplierRows, aliasRows, invoiceRows, ledgerRows] = await Promise.all([
    optionalRows(
      `SELECT id::text AS supplier_id, business_name AS name, email AS contact, status
       FROM users
       WHERE role = 'supplier'`,
      [],
      "Could not read supplier users",
    ),
    optionalRows(
      `SELECT s.id::text AS supplier_id, s.name, COALESCE(u.email, '') AS contact,
              COALESCE(u.status, 'Active') AS status
       FROM suppliers s
       LEFT JOIN users u ON u.role = 'supplier' AND LOWER(u.business_name) = LOWER(s.name)`,
      [],
      "Could not read suppliers table",
    ),
    optionalRows(
      `SELECT supplier_id::text, name, '' AS contact, 'Active' AS status
       FROM supplier_names`,
      [],
      "Could not read supplier_names table",
    ),
    optionalRows(
      `SELECT i.supplier_id::text AS supplier_id,
              COALESCE(account_user.business_name, named_user.business_name, supplier.name, alias.name, 'Supplier ' || i.supplier_id) AS name,
              COALESCE(account_user.email, named_user.email, '') AS contact,
              COALESCE(account_user.status, named_user.status, 'Active') AS status,
              TRUE AS has_buyer_activity
       FROM invoices i
       LEFT JOIN users account_user
         ON account_user.role = 'supplier' AND account_user.id::text = i.supplier_id
       LEFT JOIN suppliers supplier
         ON supplier.id::text = i.supplier_id
       LEFT JOIN supplier_names alias
         ON alias.supplier_id = i.supplier_id
       LEFT JOIN users named_user
         ON named_user.role = 'supplier'
        AND supplier.name IS NOT NULL
        AND LOWER(named_user.business_name) = LOWER(supplier.name)
       WHERE i.supplier_id IS NOT NULL
         AND ($1::text IS NULL OR LOWER(i.buyer_name) = LOWER($1))
       GROUP BY i.supplier_id, account_user.business_name, named_user.business_name,
                supplier.name, alias.name, account_user.email, named_user.email,
                account_user.status, named_user.status`,
      [buyerName || null],
      "Could not read invoice supplier names",
    ),
    optionalRows(
      `SELECT '' AS supplier_id,
              e.supplier_name AS name,
              '' AS contact,
              'Active' AS status,
              TRUE AS has_buyer_activity
       FROM erp_ledger e
       WHERE e.supplier_name IS NOT NULL
         AND ($1::text IS NULL OR LOWER(e.buyer_name) = LOWER($1))
       GROUP BY e.supplier_name`,
      [buyerName || null],
      "Could not read ERP ledger supplier names",
    ),
  ]);

  if (buyerName) {
    return mergeSupplierRows([invoiceRows, ledgerRows]);
  }

  return mergeSupplierRows([
    invoiceRows,
    ledgerRows,
    accountRows,
    supplierRows,
    aliasRows,
  ]);
}

function correctionTotal(aliases, correctionCounts) {
  return aliases.reduce(
    (total, id) => total + Number(correctionCounts[id] || 0),
    0,
  );
}

function isWatchlisted(supplier, watchlist, buyerName) {
  return supplier.aliases.some((id) => watchlist[scopedSupplierId(id, buyerName)]);
}

function emptyStats(id, names, correctionCounts, master = {}) {
  const aliases = [...new Set([id, ...(master.aliases || [])].filter(Boolean))];

  return {
    id,
    name: master.name || names[id] || `Supplier ${id}`,
    contact: master.contact || "",
    masterStatus: master.status || "Active",
    aliases,
    hasBuyerActivity: Boolean(master.hasBuyerActivity),
    totalInvoices: 0,
    earlyFunded: 0,
    disputed: 0,
    lateCorrections: correctionTotal(aliases, correctionCounts),
    totalDiscount: 0,
    totalInvoiceAmount: 0,
  };
}

function buildSupplierStats(masterRows, invoices, names, correctionCounts) {
  const suppliers = {};
  const aliasToSupplierId = new Map();

  masterRows.forEach((master) => {
    const supplier = emptyStats(master.id, names, correctionCounts, master);
    suppliers[supplier.id] = supplier;
    supplier.aliases.forEach((alias) => aliasToSupplierId.set(alias, supplier.id));
  });

  invoices.forEach((invoice) => {
    const invoiceSupplierName = clean(
      invoice.supplier_name || names[invoice.supplier_id],
    );
    const invoiceSupplierId =
      clean(invoice.supplier_id) || normalizeSupplierName(invoiceSupplierName);
    if (!invoiceSupplierId) return;

    const id = aliasToSupplierId.get(invoiceSupplierId) || invoiceSupplierId;
    suppliers[id] ||= emptyStats(id, names, correctionCounts, {
      aliases: [invoiceSupplierId],
      name: invoiceSupplierName,
      hasBuyerActivity: true,
    });
    aliasToSupplierId.set(invoiceSupplierId, id);

    const supplier = suppliers[id];
    const amount = Number(invoice.invoice_amount) || 0;
    const payout = Number(invoice.payout_amount) || 0;

    supplier.hasBuyerActivity = true;
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

function scoreSupplier(supplier, config, watchlist, buyerName) {
  if (supplier.totalInvoices === 0) {
    return {
      ...supplier,
      score: null,
      band: "No Activity",
      color: BAND_COLOR["No Activity"],
      reasons: ["No AP ledger activity for this buyer yet."],
      earlyFundingRate: 0,
      avgDiscountRate: "0.0",
      watchlisted: isWatchlisted(supplier, watchlist, buyerName),
    };
  }

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
    watchlisted: isWatchlisted(supplier, watchlist, buyerName),
  };
}

async function computeHealth(buyerName) {
  const [config, invoices, correctionCounts, watchlist, names, masterRows] =
    await Promise.all([
      readConfig(),
      getInvoices(buyerName),
      getCorrectionCounts(buyerName),
      getWatchlistMap(buyerName),
      getNameMap(),
      getSupplierMasterRows(buyerName),
    ]);

  return buildSupplierStats(masterRows, invoices, names, correctionCounts)
    .map((supplier) => scoreSupplier(supplier, config, watchlist, buyerName))
    .sort((a, b) => {
      if (a.hasBuyerActivity !== b.hasBuyerActivity) {
        return a.hasBuyerActivity ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function summarize(analytics) {
  const counts = { "No Activity": 0, Healthy: 0, Watch: 0, Distress: 0 };

  analytics.forEach((supplier) => {
    counts[supplier.band] = (counts[supplier.band] || 0) + 1;
  });

  const active = analytics.filter((supplier) => supplier.hasBuyerActivity).length;

  return {
    totalSuppliers: analytics.length,
    active,
    noActivity: counts["No Activity"],
    healthy: counts.Healthy,
    watch: counts.Watch,
    distress: counts.Distress,
    healthyPercent: percent(counts.Healthy, active),
    watchPercent: percent(counts.Watch, active),
    distressPercent: percent(counts.Distress, active),
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

async function createAlert(supplier, message, recipientEmail) {
  await pool.query(
    `
      INSERT INTO supplier_health_alerts (supplier_id, score, message)
      VALUES ($1, $2, $3)
    `,
    [supplier.id, supplier.score, message],
  );

  if (!recipientEmail) {
    console.error("Supplier health email skipped: no logged-in buyer email found.");
    return;
  }

  await notificationService.sendNotification({
    recipient: recipientEmail,
    message,
    invoiceLink: "/health",
    type: "distress_alert",
    emailSubject: "Clarity B2B: Supplier Health Alert",
  });
}

async function runRecalculation(options = {}) {
  const analytics = await computeHealth(options.buyerName);

  for (const supplier of analytics) {
    const scopedSupplier = {
      ...supplier,
      id: scopedSupplierId(supplier.id, options.buyerName),
    };
    const previousBand = await getPreviousBand(scopedSupplier.id);
    await saveHealth(scopedSupplier);

    const message = getAlertMessage(supplier, previousBand);
    if (message) {
      await createAlert(scopedSupplier, message, options.recipientEmail);
    }
  }

  return analytics;
}

async function getAlerts(buyerName) {
  const { rows } = await pool.query(
    "SELECT * FROM supplier_health_alerts ORDER BY created_at DESC",
  );

  const currentHealth = await computeHealth(buyerName);
  const currentById = new Map();
  currentHealth.forEach((supplier) => {
    [supplier.id, ...(supplier.aliases || [])].forEach((id) => {
      currentById.set(scopedSupplierId(id, buyerName), supplier);
    });
  });

  return rows
    .filter((alert) => {
      const supplier = currentById.get(String(alert.supplier_id));
      return supplier && ["Watch", "Distress"].includes(supplier.band);
    })
    .map((alert) => {
      const supplier = currentById.get(String(alert.supplier_id));
      return {
        ...alert,
        current_score: supplier.score,
        current_band: supplier.band,
        supplier_name: supplier.name,
      };
    });
}

async function acknowledgeAlert(id) {
  const { rows } = await pool.query(
    "UPDATE supplier_health_alerts SET is_read = TRUE WHERE id = $1 RETURNING *",
    [id],
  );
  return rows[0] || null;
}

async function toggleWatchlist(supplierId, buyerName) {
  const watchlistId = scopedSupplierId(supplierId, buyerName);
  const current = await pool.query(
    "SELECT watchlisted FROM supplier_watchlist WHERE supplier_id = $1",
    [watchlistId],
  );
  const watchlisted = !(current.rows[0]?.watchlisted === true);

  await pool.query(
    `
      INSERT INTO supplier_watchlist (supplier_id, watchlisted, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (supplier_id)
      DO UPDATE SET watchlisted = $2, updated_at = NOW()
    `,
    [watchlistId, watchlisted],
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
