const express = require('express');
const cors = require('cors');
const invoiceRoutes = require('./routes/invoiceRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();

app.use(cors());
app.use(express.json());
// Swagger API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/invoices', invoiceRoutes);
module.exports = app;
