const dotenv = require('dotenv');

const connectDB = require('./config/db');

const Campaign = require('./models/campaign/Campaign');
const PartsDispatch = require('./models/campaign/PartsDispatch');
const Gauge = require('./models/gauge/Gauge');
const CurrentBatch = require('./models/gauge/CurrentBatch');
const PreviousBatch = require('./models/gauge/PreviousBatch');
const User = require('./models/gauge/User');
const SLAConfig = require('./models/gauge/SLAConfig');

const { toCampaignDocument, toUserDocument, toGaugeDocument, toCurrentBatchDocument, toPreviousBatchDocument } = require('./utils/seedNormalizers');

const campaignData = require('./data/campaign/campaignData.json');
const partsDispatchData = require('./data/campaign/partsDispatchData.json');
const gaugeListData = require('./data/gauge/gaugeList.json');
const currentBatchData = require('./data/gauge/currentBatch.json');
const previousBatchData = require('./data/gauge/previousBatch.json');
const usersData = require('./data/gauge/users.json');

dotenv.config();

// Bypass Corporate SSL Firewall Blocks for MongoDB Atlas locally
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


async function purgeAllData() {
  await Campaign.deleteMany();
  await PartsDispatch.deleteMany();
  await User.deleteMany();
  await Gauge.deleteMany();
  await CurrentBatch.deleteMany();
  await PreviousBatch.deleteMany();
  await SLAConfig.deleteMany();
  console.log('All collections cleared.');
}

const seedData = async () => {
  await connectDB();
  try {
    await purgeAllData();

    const campaigns = campaignData.map(toCampaignDocument);
    const partsDispatches = partsDispatchData.map((record) => ({ ...record }));
    const users = usersData.map(toUserDocument);
    const gauges = gaugeListData.map(toGaugeDocument);
    const currentBatches = currentBatchData.map(toCurrentBatchDocument);
    const previousBatches = previousBatchData.map(toPreviousBatchDocument);

    await Campaign.insertMany(campaigns);
    await PartsDispatch.insertMany(partsDispatches);
    await User.insertMany(users);
    await Gauge.insertMany(gauges);
    await CurrentBatch.insertMany(currentBatches);
    await PreviousBatch.insertMany(previousBatches);
    await SLAConfig.create(SLAConfig.DEFAULT_SLA_CONFIG);

    console.log(
      `Seed completed: ${campaigns.length} campaigns, ${partsDispatches.length} parts dispatch records, ${users.length} users, ${gauges.length} gauges, ${currentBatches.length} current batches, ${previousBatches.length} previous batches, 1 SLA config.`
    );
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedData();
