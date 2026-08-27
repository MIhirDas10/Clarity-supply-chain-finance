const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");

// List notifications for the logged-in account
router.get("/", notificationController.getNotifications);

// Mark one notification as read
router.patch("/:id/read", notificationController.markAsRead);

module.exports = router;
