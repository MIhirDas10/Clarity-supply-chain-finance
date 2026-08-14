const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// List notifications (optional ?recipient=email)
router.get('/', notificationController.getNotifications);

// Mark one notification as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
