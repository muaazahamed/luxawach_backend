const mongoose = require('mongoose');
const dns = require('dns');

const normalizeServers = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const configureMongoDns = () => {
  const configuredServers = normalizeServers(process.env.MONGO_DNS_SERVERS);
  if (configuredServers.length > 0) {
    dns.setServers(configuredServers);
    return;
  }

  const currentServers = dns.getServers();
  const isLoopbackOnly =
    currentServers.length > 0 &&
    currentServers.every((server) => server === '127.0.0.1' || server === '::1');

  if (isLoopbackOnly) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured');
  }

  configureMongoDns();

  const connection = await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
  });

  console.log(`MongoDB Connected: ${connection.connection.host}`);
  return connection;
};

module.exports = connectDB;
