import mongoose, { Schema, Document } from "mongoose";

export interface ITenant extends Document {
  name: string;
  subdomain: string;
  dbURI: string;
  subscriptionStatus: "active" | "inactive" | "past_due";
  billingPlan: string;
  maxStudents: number;
  maxGuardians: number;
  maxTeachers: number;
  maxClasses: number;
  maxAdmins: number;
  perStudentFeeBdt: number;
  orgStudentShareBdt: number;
  platformStudentShareBdt: number;
  guardianPortalFree: boolean;
  guardianMultiStudentAllowed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: [true, "Tenant name is required"],
      trim: true,
    },
    subdomain: {
      type: String,
      required: [true, "Subdomain is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    dbURI: {
      type: String,
      required: [true, "Database URI is required"],
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "past_due"],
      default: "active",
    },
    billingPlan: {
      type: String,
      default: "campus_connect",
    },
    maxStudents: {
      type: Number,
      default: -1, // -1 means unlimited
    },
    maxGuardians: {
      type: Number,
      default: -1, // -1 means unlimited (free guardian portal)
    },
    maxTeachers: {
      type: Number,
      default: 10,
    },
    maxClasses: {
      type: Number,
      default: 50,
    },
    maxAdmins: {
      type: Number,
      default: 3,
    },
    perStudentFeeBdt: {
      type: Number,
      default: 15, // e.g., ৳15 total per student
    },
    orgStudentShareBdt: {
      type: Number,
      default: 5, // e.g., ৳5 goes to organization
    },
    platformStudentShareBdt: {
      type: Number,
      default: 10, // e.g., ৳10 goes to CampusBaba platform
    },
    guardianPortalFree: {
      type: Boolean,
      default: true,
    },
    guardianMultiStudentAllowed: {
      type: Boolean,
      default: true, // true = 1 guardian can monitor multiple students; false = 1 guardian : 1 student
    },
  },
  {
    timestamps: true,
  }
);

tenantSchema.index({ subdomain: 1 });

export const Tenant = mongoose.model<ITenant>("Tenant", tenantSchema);
