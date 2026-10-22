const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../model/User");

const createAdmin = async () => {
try {
const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("Admin environment variables are missing");
}

if (ADMIN_PASSWORD.length < 12) {
  throw new Error("Admin password must be at least 12 characters");
}

await connectDB();

const email = ADMIN_EMAIL.toLowerCase().trim();

const existingUser = await User.findOne({ email });

if (existingUser) {
  console.log(
    "This email already exists. No account or role was changed."
  );
  return;
}

const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

const admin = await User.create({
  name: ADMIN_NAME,
  email,
  password: hashedPassword,
  phone: "Not provided",
  role: "admin",
  isVerified: true,
});

console.log("Admin account created successfully.");
console.log("Admin ID:", admin._id.toString());
console.log("Admin email:", admin.email);

} catch (error) {
console.error("Admin creation failed:", error.message);
process.exitCode = 1;
} finally {
await mongoose.disconnect();
}
};

createAdmin();
