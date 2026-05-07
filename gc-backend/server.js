const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();

// Bypass Corporate SSL Firewall Blocks for MongoDB Atlas locally
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(cors());
app.use(express.json());

// Register routes
app.use('/api/gauges', require('./routes/gaugeRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sla-config', require('./routes/slaConfigRoutes'));
app.use('/api/batches', require('./routes/batchRoutes'));
app.use('/api', require('./routes/campaignRoutes'));

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer().catch((error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
