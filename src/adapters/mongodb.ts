import { MongoClient, Db, Document } from "mongodb";
import { BaseAdapter } from "./base.js";
import { Environment, MongoConnection, QueryResult } from "../types/index.js";

export class MongoAdapter extends BaseAdapter {
  readonly kind = "mongodb" as const;
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(
    connectionName: string,
    environment: Environment,
    private readonly config: MongoConnection & { uri: string }
  ) {
    super(connectionName, environment);
  }

  async connect(): Promise<void> {
    this.client = new MongoClient(this.config.uri, {
      serverSelectionTimeoutMS: 5000,
    });
    await this.client.connect();
    this.db = this.client.db(this.config.database);
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.db = null;
  }

  async ping(): Promise<boolean> {
    try {
      await this.db?.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Supported operations (operation string → behavior):
   *
   *   "find"        params: [collection, filter, options?]
   *   "aggregate"   params: [collection, pipeline]
   *   "insertOne"   params: [collection, document]
   *   "insertMany"  params: [collection, documents[]]
   *   "updateOne"   params: [collection, filter, update, options?]
   *   "updateMany"  params: [collection, filter, update, options?]
   *   "deleteOne"   params: [collection, filter]
   *   "deleteMany"  params: [collection, filter]
   *   "command"     params: [commandDocument]
   *   "listCollections" params: []
   */
  async executeRaw(operation: string, params: unknown[]): Promise<QueryResult> {
    if (!this.db) throw new Error(`[mongodb:${this.connectionName}] Not connected`);

    switch (operation) {
      case "find": {
        const [col, filter = {}, options = {}] = params as [string, Document, Document];
        const rows = await this.db
          .collection(col)
          .find(filter, options as object)
          .limit((options as { limit?: number }).limit ?? 100)
          .toArray();
        return { rows, rowCount: rows.length };
      }

      case "aggregate": {
        const [col, pipeline] = params as [string, Document[]];
        const rows = await this.db.collection(col).aggregate(pipeline).toArray();
        return { rows, rowCount: rows.length };
      }

      case "insertOne": {
        const [col, doc] = params as [string, Document];
        const result = await this.db.collection(col).insertOne(doc);
        return { raw: result, rowCount: 1 };
      }

      case "insertMany": {
        const [col, docs] = params as [string, Document[]];
        const result = await this.db.collection(col).insertMany(docs);
        return { raw: result, rowCount: result.insertedCount };
      }

      case "updateOne": {
        const [col, filter, update, options = {}] = params as [
          string, Document, Document, Document
        ];
        const result = await this.db.collection(col).updateOne(filter, update, options);
        return { raw: result, rowCount: result.modifiedCount };
      }

      case "updateMany": {
        const [col, filter, update, options = {}] = params as [
          string, Document, Document, Document
        ];
        const result = await this.db.collection(col).updateMany(filter, update, options);
        return { raw: result, rowCount: result.modifiedCount };
      }

      case "deleteOne": {
        const [col, filter] = params as [string, Document];
        const result = await this.db.collection(col).deleteOne(filter);
        return { raw: result, rowCount: result.deletedCount };
      }

      case "deleteMany": {
        const [col, filter] = params as [string, Document];
        const result = await this.db.collection(col).deleteMany(filter);
        return { raw: result, rowCount: result.deletedCount };
      }

      case "command": {
        const [cmd] = params as [Document];
        const result = await this.db.command(cmd);
        return { raw: result };
      }

      case "listCollections": {
        const cols = await this.db.listCollections().toArray();
        return { rows: cols, rowCount: cols.length };
      }

      default:
        throw new Error(`[mongodb] Unknown operation: "${operation}"`);
    }
  }
}
