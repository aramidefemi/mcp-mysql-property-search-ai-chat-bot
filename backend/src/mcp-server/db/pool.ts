import mysql from 'mysql2/promise';
import { config } from '../../config.js';
import { DatabaseError } from '../../utils/types.js';

let pool: mysql.Pool | null = null;

/**
 * Create and configure MySQL connection pool
 */
export function createPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
      database: config.MYSQL_DB,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      // Enable multiple statement queries for migrations
      multipleStatements: false,
      // Ensure UTF8 encoding
      charset: 'utf8mb4',
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('MySQL pool error:', err);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Recreating MySQL pool...');
        pool = null;
        createPool();
      }
    });
  }

  return pool;
}

/**
 * Get a connection from the pool
 */
export async function getConnection(): Promise<mysql.PoolConnection> {
  const pool = createPool();
  
  try {
    return await pool.getConnection();
  } catch (error) {
    throw new DatabaseError(
      'Failed to get database connection',
      error
    );
  }
}

/**
 * Execute a query with automatic connection management
 */
export async function executeQuery<T = any>(
  query: string,
  params?: any[]
): Promise<mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket | mysql.OkPacket[] | mysql.ResultSetHeader | mysql.ResultSetHeader[]> {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(query, params);
    return rows as T;
  } catch (error) {
    throw new DatabaseError(
      `Query execution failed: ${query}`,
      error
    );
  } finally {
    connection.release();
  }
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await executeQuery('SELECT 1 as test');
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
