const { MongoClient } = require("mongodb");
const config = require("../config");

let client;
let db;

const ensureIndexes = async (database) => {
  try {
    await database.collection(config.mongoVerifyEmailCollection).createIndex(
      { expires_at_ts: 1 },
      {
        expireAfterSeconds: 0,
        name: "verify_email_expires_at_ttl",
      }
    );
  } catch (error) {
    console.error("Failed to ensure Mongo indexes", error);
  }
};

const initMongo = async () => {
  if (db) {
    return db;
  }

  if (!config.mongoUri) {
    throw new Error("Mongo URI is not configured");
  }

  client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db(config.mongoDbName);
  await ensureIndexes(db);
  console.log(`Mongo connected to ${config.mongoDbName}`);
  return db;
};

const getDb = () => {
  if (!db) {
    throw new Error("Mongo client not initialized. Call initMongo() first.");
  }

  return db;
};

const closeMongo = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
};

module.exports = {
  initMongo,
  getDb,
  closeMongo,
};
