import mongoose from "mongoose";
import { SuperAdmin } from "../masterModels/SuperAdmin";
import { config } from "./index";

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = config.env.MONGODB_URI;

    await mongoose.connect(mongoUri);

    console.log("✅ Database connected successfully");

    // P0-4 Fix: Removed hardcoded admin@campusbaba.com / password123 auto-seeding.
    // SuperAdmin creation now requires explicit SUPERADMIN_BOOTSTRAP_EMAIL & SUPERADMIN_BOOTSTRAP_TOKEN.
    if (
      config.auth.superAdminBootstrapEmail &&
      config.auth.superAdminBootstrapToken &&
      config.auth.superAdminBootstrapToken.length >= 12
    ) {
      try {
        const existingAdmin = await SuperAdmin.findOne({
          email: config.auth.superAdminBootstrapEmail.toLowerCase().trim(),
        });
        if (!existingAdmin) {
          await SuperAdmin.create({
            name: "Platform Bootstrap Admin",
            email: config.auth.superAdminBootstrapEmail.toLowerCase().trim(),
            password: config.auth.superAdminBootstrapToken,
            isActive: true,
          });
          console.log(
            `✅ Bootstrap Super Admin initialized for ${config.auth.superAdminBootstrapEmail} (password change required on first login)`
          );
        }
      } catch (err) {
        console.error("❌ Failed to run Super Admin bootstrap:", err);
      }
    }

    mongoose.connection.on("error", (error) => {
      console.error("❌ Database connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  Database disconnected");
    });
  } catch (error) {
    console.error("❌ Failed to connect to Database:", error);
    process.exit(1);
  }
};
