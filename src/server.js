const config = require("./config");
const { buildApp } = require("./app");

const app = buildApp();

app.listen(config.port, () => {
  console.log(`Debrid-Link proxy listening on port ${config.port}`);
});
