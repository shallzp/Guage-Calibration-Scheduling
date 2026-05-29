const dotenv = require('dotenv');

const connectDB = require('./config/db');

const Campaign = require('./models/campaign/Campaign');
const PartsDispatch = require('./models/campaign/PartsDispatch');
const Gauge = require('./models/gauge/Gauge');
const Batch = require('./models/gauge/Batch');
const CurrentBatch = require('./models/gauge/CurrentBatch');
const PreviousBatch = require('./models/gauge/PreviousBatch');
const User = require('./models/gauge/User');
const SLAConfig = require('./models/gauge/SLAConfig');

const { toCampaignDocument, toUserDocument, toGaugeDocument, buildBatchSeedData, buildAllBatchesSeedData } = require('./utils/seedNormalizers');

const campaignData = require('./data/campaign/campaignData.json');
const partsDispatchData = require('./data/campaign/partsDispatchData.json');
const gaugeListData = require('./data/gauge/gaugeList.json');
const usersData = require('./data/gauge/users.json');

dotenv.config();

// Bypass Corporate SSL Firewall Blocks for MongoDB Atlas locally
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


async function purgeAllData() {
  await Campaign.deleteMany();
  await PartsDispatch.deleteMany();
  await User.deleteMany();
  await Gauge.deleteMany();
  await Batch.deleteMany();
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

    // Compute current & previous batches from gauge batch_keys (with backfilled snapshots)
    const { currentBatches, previousBatches } = buildBatchSeedData(gaugeListData);

    // Compute unified batches collection (all statuses, gauge_keys as dicts)
    const allBatches = buildAllBatchesSeedData(gaugeListData);

    await Campaign.insertMany(campaigns);
    await PartsDispatch.insertMany(partsDispatches);
    await User.insertMany(users);
    await Gauge.insertMany(gauges);
    await Batch.insertMany(allBatches);
    await CurrentBatch.insertMany(currentBatches);
    await PreviousBatch.insertMany(previousBatches);
    await SLAConfig.create(SLAConfig.DEFAULT_SLA_CONFIG);

    console.log(
      `Seed completed: ${campaigns.length} campaigns, ${partsDispatches.length} parts dispatch records, ${users.length} users, ${gauges.length} gauges, ${allBatches.length} batches, ${currentBatches.length} current batches, ${previousBatches.length} previous batches, 1 SLA config.`
    );
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedData();
