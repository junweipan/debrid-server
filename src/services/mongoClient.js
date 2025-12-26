const { MongoClient } = require("mongodb");
const config = require("../config");

let client;
let db;

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
