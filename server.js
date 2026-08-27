const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", require("./src/routes/api"));
app.use("/admin/api", require("./src/routes/admin"));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, msg: err.message });
});

app.listen(config.port, () => {
  console.log("========================================");
  console.log("  豪猪接码卡密系统 启动成功");
  console.log("  前端: http://localhost:" + config.port + "/");
  console.log("  管理后台: http://localhost:" + config.port + "/admin");
  console.log("  管理员Token: " + config.adminToken);
  console.log("========================================");
});
