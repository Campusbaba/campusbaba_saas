import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface ISuperAdmin {
  id: string;
  _id: string;
  name: string;
  email: string;
  password: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const platformAdminsStore = new Map<string, ISuperAdmin>();

export const SuperAdmin = {
  async findOne(filter: { email?: string; id?: string; _id?: string }): Promise<ISuperAdmin | null> {
    if (filter.email) {
      const normalized = filter.email.toLowerCase().trim();
      for (const admin of platformAdminsStore.values()) {
        if (admin.email === normalized) return admin;
      }
      return null;
    }
    const id = filter.id || filter._id;
    if (id) {
      return platformAdminsStore.get(String(id)) || null;
    }
    return null;
  },

  async create(input: {
    name: string;
    email: string;
    password: string;
    isActive?: boolean;
  }): Promise<ISuperAdmin> {
    const id = crypto.randomUUID();
    const hashedPassword = String(input.password).startsWith("$2")
      ? input.password
      : await bcrypt.hash(input.password, 10);

    const record: ISuperAdmin = {
      id,
      _id: id,
      name: input.name,
      email: input.email.toLowerCase().trim(),
      password: hashedPassword,
      isActive: input.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      async comparePassword(candidatePassword: string): Promise<boolean> {
        return bcrypt.compare(candidatePassword, this.password);
      },
    };

    platformAdminsStore.set(id, record);
    return record;
  },
};
