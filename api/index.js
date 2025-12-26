const app = require("../src/app");

// Expose the Express app as a Vercel serverless function entry.
module.exports = (req, res) => app(req, res);
