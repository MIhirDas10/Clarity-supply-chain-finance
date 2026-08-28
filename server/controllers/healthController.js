const healthService = require("../services/supplierHealthService");

function sendError(res, message, status = 500) {
  return res.status(status).json({ error: message });
}

function route(handler, errorLabel, clientMessage) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      sendError(res, clientMessage);
    }
  };
}

function validateConfig({ watchBelow, distressBelow }) {
  if (typeof watchBelow !== "number" || typeof distressBelow !== "number") {
    return "watchBelow and distressBelow must be numbers";
  }
  if (distressBelow < 0 || watchBelow > 100) {
    return "Thresholds must be between 0 and 100";
  }
  if (distressBelow >= watchBelow) {
    return "distressBelow must be less than watchBelow";
  }
  return null;
}

function buyerScope(req) {
  if (req.user?.role === "buyer") {
    return req.user.business_name;
  }
  return req.query.buyer;
}

exports.runRecalculation = healthService.runRecalculation;

exports.getSupplierHealth = route(
  async (req, res) => {
    const suppliers = await healthService.computeHealth(buyerScope(req));
    res.status(200).json(suppliers);
  },
  "Supplier Health Error",
  "Failed to compute supplier health",
);

exports.getSupplierById = route(
  async (req, res) => {
    const suppliers = await healthService.computeHealth(buyerScope(req));
    const supplier = suppliers.find(
      (item) => String(item.id) === String(req.params.id),
    );

    if (!supplier) {
      return sendError(res, "Supplier not found", 404);
    }

    res.status(200).json(supplier);
  },
  "Supplier Detail Error",
  "Failed to compute supplier health",
);

exports.getSummary = route(
  async (req, res) => {
    const suppliers = await healthService.computeHealth(buyerScope(req));
    res.status(200).json(healthService.summarize(suppliers));
  },
  "Supplier Summary Error",
  "Failed to compute supplier summary",
);

exports.recalculate = route(
  async (req, res) => {
    const suppliers = await healthService.runRecalculation({
      buyerName: buyerScope(req),
      recipientEmail: req.user.email,
    });
    res.status(200).json({
      message: "Supplier health recalculated and saved",
      suppliersProcessed: suppliers.length,
      data: suppliers,
    });
  },
  "Recalculate Error",
  "Failed to recalculate supplier health",
);

exports.getAlerts = route(
  async (req, res) => {
    res.status(200).json(await healthService.getAlerts(buyerScope(req)));
  },
  "Get Alerts Error",
  "Failed to fetch alerts",
);

exports.acknowledgeAlert = route(
  async (req, res) => {
    const alert = await healthService.acknowledgeAlert(req.params.id);

    if (!alert) {
      return sendError(res, "Alert not found", 404);
    }

    res.status(200).json(alert);
  },
  "Acknowledge Alert Error",
  "Failed to acknowledge alert",
);

exports.getConfig = route(
  async (req, res) => {
    res.status(200).json(await healthService.readConfig());
  },
  "Get Config Error",
  "Failed to read config",
);

exports.updateConfig = route(
  async (req, res) => {
    const validationError = validateConfig(req.body);
    if (validationError) {
      return sendError(res, validationError, 400);
    }

    res.status(200).json(await healthService.updateConfig(req.body));
  },
  "Update Config Error",
  "Failed to update config",
);

exports.toggleWatchlist = route(
  async (req, res) => {
    res.status(200).json(
      await healthService.toggleWatchlist(req.params.id, buyerScope(req)),
    );
  },
  "Toggle Watchlist Error",
  "Failed to update watchlist",
);

exports.getWatchlist = route(
  async (req, res) => {
    const suppliers = await healthService.computeHealth(buyerScope(req));
    res.status(200).json(suppliers.filter((supplier) => supplier.watchlisted));
  },
  "Get Watchlist Error",
  "Failed to fetch watchlist",
);
