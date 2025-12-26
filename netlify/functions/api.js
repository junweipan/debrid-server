const serverless = require("serverless-http");
const { buildApp } = require("../../src/app");

const app = buildApp();
const handler = serverless(app);

exports.handler = async (event, context) => handler(event, context);
