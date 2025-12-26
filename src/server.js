const config = require("./config");
const app = require("./app");

app.listen(config.port, () => {
  console.log(`Debrid-Link proxy listening on port ${config.port}`);
});
