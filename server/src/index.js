require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init } = require('./database');
const { errorHandler } = require('./middleware/error');

init();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors({ origin: [/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/], credentials: false }));
app.use(express.json());

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/item-types', require('./routes/itemTypes'));
app.use('/api/custom-fields', require('./routes/customFields'));
app.use('/api/summary', require('./routes/summary'));
app.use('/api/report', require('./routes/report'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/export', require('./routes/export'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`SpendVentures API listening on http://localhost:${PORT}`);
});
