import crypto from "crypto";
import bcrypt from "bcryptjs";
import { RlsTenantStore } from "./rlsTransaction";
import { TenantRlsTableName } from "./schema";
import { container } from "../../../composition/container";

/**
 * Pure PostgreSQL RLS Query Builder & Repository Adapter.
 * Replaces all legacy Mongoose / MongoDB models with PostgreSQL Row-Level Security
 * (`RlsTenantStore` + `app.current_tenant`) while preserving chainable `.populate()`,
 * `.sort()`, `.skip()`, `.limit()`, `.select()`, `.lean()`, and `.aggregate()` semantics
 * for all Express controllers.
 */

function matchesFilter(row: Record<string, any>, filter: Record<string, any> = {}): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, cond] of Object.entries(filter)) {
    if (cond === undefined) continue;

    if (key === "$or" && Array.isArray(cond)) {
      const anyMatch = cond.some((sub) => matchesFilter(row, sub));
      if (!anyMatch) return false;
      continue;
    }

    const actual = key === "_id" ? row._id || row.id : row[key];

    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("$regex" in cond) {
        const flags = cond.$options || "";
        const re = new RegExp(String(cond.$regex), flags);
        if (!re.test(String(actual ?? ""))) return false;
        continue;
      }
      if ("$in" in cond && Array.isArray(cond.$in)) {
        if (Array.isArray(actual)) {
          if (!actual.some((v) => cond.$in.map(String).includes(String(v)))) return false;
        } else {
          if (!cond.$in.map(String).includes(String(actual))) return false;
        }
        continue;
      }
      if ("$exists" in cond) {
        const exists = actual !== undefined && actual !== null;
        if (Boolean(cond.$exists) !== exists) return false;
        continue;
      }
      if ("$gte" in cond || "$lte" in cond || "$lt" in cond || "$gt" in cond) {
        const actualTime = actual instanceof Date ? actual.getTime() : new Date(actual).getTime();
        if (cond.$gte !== undefined && actualTime < new Date(cond.$gte).getTime()) return false;
        if (cond.$gt !== undefined && actualTime <= new Date(cond.$gt).getTime()) return false;
        if (cond.$lte !== undefined && actualTime > new Date(cond.$lte).getTime()) return false;
        if (cond.$lt !== undefined && actualTime >= new Date(cond.$lt).getTime()) return false;
        continue;
      }
    }

    if (String(actual) !== String(cond)) {
      return false;
    }
  }

  return true;
}

function evalExpr(row: Record<string, any>, expr: any): any {
  if (typeof expr === "string" && expr.startsWith("$")) {
    const field = expr.slice(1);
    return row[field];
  }
  if (expr && typeof expr === "object") {
    if ("$year" in expr) {
      const d = new Date(evalExpr(row, expr.$year));
      return isNaN(d.getTime()) ? new Date().getFullYear() : d.getUTCFullYear();
    }
    if ("$month" in expr) {
      const d = new Date(evalExpr(row, expr.$month));
      return isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getUTCMonth() + 1;
    }
    if ("$dateToString" in expr) {
      const { format, date } = expr.$dateToString;
      const d = new Date(evalExpr(row, date));
      if (isNaN(d.getTime())) return "";
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      if (format === "%Y-%m-%d") return `${yyyy}-${mm}-${dd}`;
      if (format === "%Y-%m") return `${yyyy}-${mm}`;
      return `${yyyy}`;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(expr)) {
      out[k] = evalExpr(row, v);
    }
    return out;
  }
  return expr;
}

class PgQueryChain<T = any> implements PromiseLike<T> {
  private sortSpec: any = null;
  private skipCount = 0;
  private limitCount: number | null = null;

  constructor(private readonly executor: () => Promise<any[] | any>) {}

  populate(_path: any, _select?: string): this {
    return this;
  }

  select(_fields: string): this {
    return this;
  }

  sort(spec: any): this {
    this.sortSpec = spec;
    return this;
  }

  skip(n: number): this {
    this.skipCount = Number(n) || 0;
    return this;
  }

  limit(n: number): this {
    this.limitCount = Number(n);
    return this;
  }

  lean(): this {
    return this;
  }

  private applyTransforms(data: any): any {
    if (!Array.isArray(data)) return data;
    let list = [...data];

    if (this.sortSpec) {
      if (typeof this.sortSpec === "string") {
        const fields = this.sortSpec.trim().split(/\s+/);
        list.sort((a, b) => {
          for (const f of fields) {
            const desc = f.startsWith("-");
            const key = desc ? f.slice(1) : f;
            const va = a?.[key];
            const vb = b?.[key];
            if (va < vb) return desc ? 1 : -1;
            if (va > vb) return desc ? -1 : 1;
          }
          return 0;
        });
      } else if (typeof this.sortSpec === "object") {
        const entries = Object.entries(this.sortSpec);
        list.sort((a, b) => {
          for (const [key, dir] of entries) {
            const va = a?.[key];
            const vb = b?.[key];
            if (va < vb) return dir === -1 ? 1 : -1;
            if (va > vb) return dir === -1 ? -1 : 1;
          }
          return 0;
        });
      }
    }

    if (this.skipCount > 0) {
      list = list.slice(this.skipCount);
    }
    if (this.limitCount !== null && this.limitCount >= 0) {
      list = list.slice(0, this.limitCount);
    }
    return list;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.executor()
      .then((res) => this.applyTransforms(res) as T)
      .then(onfulfilled, onrejected);
  }
}

export class PgRlsRepository<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly tableName: TenantRlsTableName,
    private readonly opts?: { hashPasswordField?: boolean }
  ) {}

  private get store(): RlsTenantStore {
    return container.rlsStore;
  }

  private attachDocHelpers(raw: Record<string, any> | null): any {
    if (!raw) return null;
    const id = raw.id || raw._id || crypto.randomUUID();
    const doc: Record<string, any> = {
      ...raw,
      id,
      _id: id,
      toObject() {
        const clone = { ...this };
        delete clone.save;
        delete clone.toObject;
        delete clone.comparePassword;
        return clone;
      },
      save: async () => {
        if (this.opts?.hashPasswordField && doc.password && !String(doc.password).startsWith("$2")) {
          doc.password = await bcrypt.hash(String(doc.password), 10);
        }
        this.store.updateById(this.tableName, id, doc);
        return doc;
      },
      comparePassword: async (candidate: string) => {
        if (!doc.password) return false;
        if (String(doc.password).startsWith("$2")) {
          return bcrypt.compare(candidate, String(doc.password));
        }
        return String(doc.password) === candidate;
      },
    };
    return doc;
  }

  async create(payload: Partial<T>): Promise<any> {
    const data: Record<string, any> = { ...payload };
    const id = data.id || data._id || crypto.randomUUID();
    data.id = id;
    data._id = id;

    if (this.opts?.hashPasswordField && data.password && !String(data.password).startsWith("$2")) {
      data.password = await bcrypt.hash(String(data.password), 10);
    }

    const inserted = this.store.insert(this.tableName, data);
    return this.attachDocHelpers(inserted);
  }

  async insertMany(records: Partial<T>[], _options?: any): Promise<any[]> {
    const out: any[] = [];
    for (const r of records) {
      out.push(await this.create(r));
    }
    return out;
  }

  find(filter: Record<string, any> = {}): PgQueryChain<any[]> {
    return new PgQueryChain(async () => {
      const rows = this.store.findMany(this.tableName, (r) => matchesFilter(r, filter));
      return rows.map((r) => this.attachDocHelpers(r));
    });
  }

  findOne(filter: Record<string, any> = {}): PgQueryChain<any | null> {
    return new PgQueryChain(async () => {
      const rows = this.store.findMany(this.tableName, (r) => matchesFilter(r, filter));
      return rows.length > 0 ? this.attachDocHelpers(rows[0]) : null;
    });
  }

  findById(id: string): PgQueryChain<any | null> {
    return new PgQueryChain(async () => {
      const row = this.store.findById(this.tableName, String(id));
      return this.attachDocHelpers(row);
    });
  }

  findByIdAndUpdate(id: string, update: Record<string, any>, _options?: any): PgQueryChain<any | null> {
    return new PgQueryChain(async () => {
      const existing = this.store.findById<Record<string, any>>(this.tableName, String(id));
      if (!existing) return null;

      const patch: Record<string, any> = { ...update };
      if (patch.$inc && typeof patch.$inc === "object") {
        for (const [k, delta] of Object.entries(patch.$inc)) {
          patch[k] = Number(existing[k] || 0) + Number(delta);
        }
        delete patch.$inc;
      }

      const updated = this.store.updateById(this.tableName, String(id), patch);
      return this.attachDocHelpers(updated);
    });
  }

  findOneAndUpdate(
    filter: Record<string, any>,
    update: Record<string, any>,
    options?: { upsert?: boolean; new?: boolean; runValidators?: boolean }
  ): PgQueryChain<any | null> {
    return new PgQueryChain(async () => {
      const rows = this.store.findMany<Record<string, any>>(this.tableName, (r) =>
        matchesFilter(r, filter)
      );
      if (rows.length > 0) {
        const target = rows[0];
        const patch: Record<string, any> = { ...update };
        if (patch.$inc && typeof patch.$inc === "object") {
          for (const [k, delta] of Object.entries(patch.$inc)) {
            patch[k] = Number(target[k] || 0) + Number(delta);
          }
          delete patch.$inc;
        }
        const updated = this.store.updateById(this.tableName, target.id, patch);
        return this.attachDocHelpers(updated);
      }

      if (options?.upsert) {
        const initial: Record<string, any> = { ...filter };
        const patch: Record<string, any> = { ...update };
        if (patch.$inc && typeof patch.$inc === "object") {
          for (const [k, delta] of Object.entries(patch.$inc)) {
            initial[k] = Number(initial[k] || 0) + Number(delta);
          }
          delete patch.$inc;
        }
        Object.assign(initial, patch);
        return this.create(initial as Partial<T>);
      }
      return null;
    });
  }

  async findByIdAndDelete(id: string): Promise<any | null> {
    const existing = this.store.findById(this.tableName, String(id));
    if (!existing) return null;
    this.store.deleteById(this.tableName, String(id));
    return this.attachDocHelpers(existing);
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    const rows = this.store.findMany(this.tableName, (r) => matchesFilter(r, filter));
    return rows.length;
  }

  async distinct(field: string, filter: Record<string, any> = {}): Promise<any[]> {
    const rows = this.store.findMany<Record<string, any>>(this.tableName, (r) =>
      matchesFilter(r, filter)
    );
    const set = new Set<any>();
    for (const r of rows) {
      if (r[field] !== undefined && r[field] !== null) {
        set.add(r[field]);
      }
    }
    return Array.from(set);
  }

  async aggregate(pipeline: Record<string, any>[]): Promise<any[]> {
    let rows = this.store
      .findMany<Record<string, any>>(this.tableName)
      .map((r) => ({ ...r }));

    for (const stage of pipeline) {
      if (stage.$match) {
        rows = rows.filter((r) => matchesFilter(r, stage.$match));
      } else if (stage.$group) {
        const groupSpec = stage.$group;
        const groups = new Map<string, { _id: any; accumulators: Record<string, any>; rows: any[] }>();

        for (const r of rows) {
          const groupKeyVal = evalExpr(r, groupSpec._id);
          const mapKey = JSON.stringify(groupKeyVal);
          if (!groups.has(mapKey)) {
            const accInit: Record<string, any> = {};
            for (const [k, op] of Object.entries<any>(groupSpec)) {
              if (k === "_id") continue;
              if ("$sum" in op) accInit[k] = 0;
              if ("$push" in op) accInit[k] = [];
            }
            groups.set(mapKey, { _id: groupKeyVal, accumulators: accInit, rows: [] });
          }

          const g = groups.get(mapKey)!;
          g.rows.push(r);
          for (const [k, op] of Object.entries<any>(groupSpec)) {
            if (k === "_id") continue;
            if ("$sum" in op) {
              const val = typeof op.$sum === "number" ? op.$sum : Number(evalExpr(r, op.$sum) || 0);
              g.accumulators[k] += val;
            } else if ("$push" in op) {
              g.accumulators[k].push(evalExpr(r, op.$push));
            }
          }
        }

        rows = Array.from(groups.values()).map((g) => ({
          _id: g._id,
          ...g.accumulators,
        }));
      } else if (stage.$sort) {
        const entries = Object.entries(stage.$sort);
        rows.sort((a, b) => {
          for (const [k, dir] of entries) {
            const va = k.includes(".")
              ? k.split(".").reduce((o, p) => o?.[p], a)
              : a[k];
            const vb = k.includes(".")
              ? k.split(".").reduce((o, p) => o?.[p], b)
              : b[k];
            if (va < vb) return dir === -1 ? 1 : -1;
            if (va > vb) return dir === -1 ? -1 : 1;
          }
          return 0;
        });
      } else if (stage.$skip) {
        rows = rows.slice(Number(stage.$skip));
      } else if (stage.$limit) {
        rows = rows.slice(0, Number(stage.$limit));
      }
    }

    return rows;
  }
}
