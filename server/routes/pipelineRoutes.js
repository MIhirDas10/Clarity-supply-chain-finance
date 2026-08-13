const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

// get invoice status
router.get('/:id/status', invoiceController.getInvoiceStatus);
// update invoice status pipeline
router.patch('/:id/status', invoiceController.updateInvoiceStatus);
// get all invoices 
router.get('/', invoiceController.getAllInvoices);
// create invoice
router.post('/', invoiceController.createInvoice);
module.exports = router;