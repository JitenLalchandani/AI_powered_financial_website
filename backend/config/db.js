const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
    console.error('\n❌  MONGO_URI is not set correctly in your .env file.');
    console.error('    Open backend/.env, replace <username> and <password> with your MongoDB Atlas credentials.\n');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌  MongoDB connection failed: ${err.message}`);
    console.error('    Check your MONGO_URI, Atlas Network Access (allow 0.0.0.0/0), and Database Access credentials.\n');
    process.exit(1);
  }
};

module.exports = connectDB;
