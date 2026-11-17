import crypto from "crypto";

export interface IGlobalNotice {
  id: string;
  _id: string;
  title: string;
  content: string;
  category: "general" | "academic" | "exam" | "event" | "holiday" | "urgent";
  targetAudience: ("student" | "parent" | "teacher" | "employee" | "all")[];
  targetOrganizations: string[];
  priority: "low" | "medium" | "high";
  status: "draft" | "published" | "archived";
  publishDate: Date;
  expiryDate?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const platformNoticesStore = new Map<string, IGlobalNotice>();

export const GlobalNotice = {
  async create(input: Partial<IGlobalNotice>): Promise<IGlobalNotice> {
    const id = crypto.randomUUID();
    const record: IGlobalNotice = {
      id,
      _id: id,
      title: input.title || "Platform Announcement",
      content: input.content || "",
      category: input.category || "general",
      targetAudience: input.targetAudience || ["all"],
      targetOrganizations: input.targetOrganizations || ["all"],
      priority: input.priority || "medium",
      status: input.status || "published",
      publishDate: input.publishDate ? new Date(input.publishDate) : new Date(),
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      createdBy: input.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    platformNoticesStore.set(id, record);
    return record;
  },

  find() {
    return {
      sort: async (_spec?: any) => {
        return Array.from(platformNoticesStore.values()).sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
      },
    };
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<IGlobalNotice>,
    _opts?: any
  ): Promise<IGlobalNotice | null> {
    const existing = platformNoticesStore.get(String(id));
    if (!existing) return null;
    const updated: IGlobalNotice = {
      ...existing,
      ...patch,
      id: existing.id,
      _id: existing._id,
      updatedAt: new Date(),
    };
    platformNoticesStore.set(existing.id, updated);
    return updated;
  },

  async findByIdAndDelete(id: string): Promise<IGlobalNotice | null> {
    const existing = platformNoticesStore.get(String(id));
    if (!existing) return null;
    platformNoticesStore.delete(String(id));
    return existing;
  },
};
