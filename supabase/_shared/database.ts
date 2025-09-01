/**
 * Database Utilities for Supabase Edge Functions
 * Helper functions for common database operations
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_CONFIG } from "./config.ts";
import { writeLog, LOG_LEVELS } from "./logging.ts";

/**
 * Get authenticated Supabase client
 */
export function getSupabaseClient(useServiceRole = true): SupabaseClient {
  const key = useServiceRole ? SUPABASE_CONFIG.SERVICE_ROLE_KEY : SUPABASE_CONFIG.ANON_KEY;
  return createClient(SUPABASE_CONFIG.URL, key);
}

/**
 * Batch operation helper
 */
export class BatchOperations {
  private supabase: SupabaseClient;
  private operations: Array<() => Promise<any>> = [];

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || getSupabaseClient();
  }

  /**
   * Add an operation to the batch
   */
  add(operation: () => Promise<any>): BatchOperations {
    this.operations.push(operation);
    return this;
  }

  /**
   * Add multiple insert operations
   */
  addInserts<T>(tableName: string, records: T[]): BatchOperations {
    const chunkSize = 1000; // Supabase limit
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      this.add(async () => await this.supabase.from(tableName).insert(chunk));
    }
    return this;
  }

  /**
   * Add multiple update operations
   */
  addUpdates<T extends Record<string, any>>(
    tableName: string, 
    updates: Array<{ filter: Record<string, any>; data: Partial<T> }>
  ): BatchOperations {
    updates.forEach(({ filter, data }) => {
      this.add(async () => {
        let query = this.supabase.from(tableName).update(data);
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
        return query;
      });
    });
    return this;
  }

  /**
   * Add multiple delete operations
   */
  addDeletes(tableName: string, filters: Array<Record<string, any>>): BatchOperations {
    filters.forEach(filter => {
      this.add(async () => {
        let query = this.supabase.from(tableName).delete();
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
        return query;
      });
    });
    return this;
  }

  /**
   * Execute all operations
   */
  async execute(functionName = "batch-operations"): Promise<any[]> {
    const results: any[] = [];
    const errors: Error[] = [];

    await writeLog(LOG_LEVELS.INFO, `Executing ${this.operations.length} batch operations`, functionName);

    for (const [index, operation] of this.operations.entries()) {
      try {
        const result = await operation();
        results.push(result);
        
        if (result.error) {
          errors.push(new Error(`Operation ${index}: ${result.error.message}`));
        }
      } catch (error) {
        errors.push(error as Error);
        await writeLog(LOG_LEVELS.ERROR, `Batch operation ${index} failed`, functionName, { error });
      }
    }

    if (errors.length > 0) {
      await writeLog(LOG_LEVELS.WARNING, `${errors.length} operations failed out of ${this.operations.length}`, functionName);
      throw new Error(`Batch execution completed with ${errors.length} errors`);
    }

    await writeLog(LOG_LEVELS.INFO, `Successfully executed ${this.operations.length} batch operations`, functionName);
    return results;
  }

  /**
   * Clear all operations
   */
  clear(): BatchOperations {
    this.operations = [];
    return this;
  }
}

/**
 * Database query helpers
 */
export class DatabaseHelpers {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || getSupabaseClient();
  }

  /**
   * Get user by ID with error handling
   */
  async getUser(userId: string, functionName = "database-helper"): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        await writeLog(LOG_LEVELS.ERROR, `Error fetching user ${userId}`, functionName, { error: error.message });
        throw error;
      }

      return data;
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed to get user ${userId}`, functionName, { error });
      throw error;
    }
  }

  /**
   * Get school by ID with error handling
   */
  async getSchool(schoolId: string, functionName = "database-helper"): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single();

      if (error && error.code !== 'PGRST116') {
        await writeLog(LOG_LEVELS.ERROR, `Error fetching school ${schoolId}`, functionName, { error: error.message });
        throw error;
      }

      return data;
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed to get school ${schoolId}`, functionName, { error });
      throw error;
    }
  }

  /**
   * Get users by school ID
   */
  async getUsersBySchool(schoolId: string, userType?: string, functionName = "database-helper"): Promise<any[]> {
    try {
      let query = this.supabase
        .from('users')
        .select('*')
        .eq('school_id', schoolId);

      if (userType) {
        query = query.eq('user_type', userType);
      }

      const { data, error } = await query;

      if (error) {
        await writeLog(LOG_LEVELS.ERROR, `Error fetching users for school ${schoolId}`, functionName, { error: error.message });
        throw error;
      }

      return data || [];
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed to get users for school ${schoolId}`, functionName, { error });
      throw error;
    }
  }

  /**
   * Soft delete record
   */
  async softDelete(tableName: string, id: string, functionName = "database-helper"): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(tableName)
        .update({ 
          deleted_at: new Date().toISOString(),
          is_active: false 
        })
        .eq('id', id);

      if (error) {
        await writeLog(LOG_LEVELS.ERROR, `Error soft deleting ${tableName} record ${id}`, functionName, { error: error.message });
        throw error;
      }

      await writeLog(LOG_LEVELS.INFO, `Soft deleted ${tableName} record ${id}`, functionName);
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed to soft delete ${tableName} record ${id}`, functionName, { error });
      throw error;
    }
  }

  /**
   * Archive old records
   */
  async archiveOldRecords(
    tableName: string, 
    olderThanDays: number, 
    dateField = 'created_at',
    functionName = "database-helper"
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data, error } = await this.supabase
        .from(tableName)
        .update({ archived_at: new Date().toISOString() })
        .lt(dateField, cutoffDate.toISOString())
        .is('archived_at', null)
        .select('id');

      if (error) {
        await writeLog(LOG_LEVELS.ERROR, `Error archiving old records in ${tableName}`, functionName, { error: error.message });
        throw error;
      }

      const count = data?.length || 0;
      await writeLog(LOG_LEVELS.INFO, `Archived ${count} old records in ${tableName}`, functionName);
      return count;
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed to archive old records in ${tableName}`, functionName, { error });
      throw error;
    }
  }

  /**
   * Get paginated results
   */
  async getPaginated<T>(
    tableName: string,
    options: {
      select?: string;
      filters?: Record<string, any>;
      orderBy?: string;
      ascending?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
    functionName = "database-helper"
  ): Promise<{ data: T[]; count: number; hasMore: boolean }> {
    try {
      const {
        select = '*',
        filters = {},
        orderBy = 'created_at',
        ascending = false,
        page = 1,
        pageSize = 50
      } = options;

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from(tableName)
        .select(select, { count: 'exact' })
        .order(orderBy, { ascending })
        .range(from, to);

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      });

      const { data, error, count } = await query;

      if (error) {
        await writeLog(LOG_LEVELS.ERROR, `Error in paginated query for ${tableName}`, functionName, { error: error.message });
        throw error;
      }

      return {
        data: (data as T[]) || [],
        count: count || 0,
        hasMore: (data?.length || 0) === pageSize
      };
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Failed paginated query for ${tableName}`, functionName, { error });
      throw error;
    }
  }
}

// Export singleton instance
export const dbHelpers = new DatabaseHelpers();