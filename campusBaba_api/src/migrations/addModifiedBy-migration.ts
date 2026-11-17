import mongoose from "mongoose";
import { config } from "../config";

const MONGO_URI = config.env.MONGODB_URI;

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const db = mongoose.connection.db!;

  const result = await db
    .collection("notices")
    .updateMany(
      { modifiedBy: { $exists: true }, modifiedByModel: { $exists: false } },
      { $set: { modifiedByModel: "Employee" } }
    );

  console.log(
    `✅ Migration complete. Updated ${result.modifiedCount} notices with missing modifiedByModel.`
  );

  await mongoose.disconnect();
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  });
}
