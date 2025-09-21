import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Backend
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  BACKEND_PORT: z.coerce.number().default(4000),
  BACKEND_API_KEY: z.string().min(1, 'Backend API key is required'),
  
  // MySQL
  MYSQL_HOST: z.string().default('160.79.116.246'),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string().default('admin'),
  MYSQL_PASSWORD: z.string().min(1, 'MySQL password is required'),
  MYSQL_DB: z.string().default('agentsrequest'),
  
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
});

export type Config = z.infer<typeof configSchema>;

function validateConfig(): Config {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const config = validateConfig();
