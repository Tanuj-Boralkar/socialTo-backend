const mongoose = require("mongoose");
module.exports = () =>
  mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });