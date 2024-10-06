import 'dotenv/config';
import { z } from 'zod';

interface EnvVars {
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;

  ID_SISTEMA: number;

  REDIS_HOST: string;
  REDIS_PORT: string;

  PORT: number;
  HOST_API: string;

  JWT_SECRET: string;
  JWT_SECRET_EXPIRES_TIME: string;

  FORMAT_DATE_BD: string;
  FORMAT_TIME_BD: string;
  PATH_DRIVE: string;

  WHATSAPP_API_ID: string;
  WHATSAPP_API_TOKEN: string;

  OPENAI_API_KEY: string;
  
}

const envsSchema = z.object({
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_HOST: z.string(),
  DB_PORT: z.string().refine(val => !isNaN(Number(val)), {
    message: "DB_PORT must be a number"
  }).transform(Number),
  DB_USERNAME: z.string(),

  ID_SISTEMA: z.string().refine(val => !isNaN(Number(val)), {
    message: "ID_SISTEMA must be a number"
  }).transform(Number),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.string(),

  PORT: z.string().refine(val => !isNaN(Number(val)), {
    message: "PORT must be a number"
  }).transform(Number),

  HOST_API: z.string(),

  JWT_SECRET: z.string(),
  JWT_SECRET_EXPIRES_TIME: z.string(),

  FORMAT_DATE_BD: z.string(),
  FORMAT_TIME_BD: z.string(),
  PATH_DRIVE: z.string(),

  WHATSAPP_API_ID: z.string(),
  WHATSAPP_API_TOKEN: z.string(),

  OPENAI_API_KEY: z.string(),
}).passthrough();

const result = envsSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Config validation error: ${result.error.message}`);
}

const envVars = result.data as EnvVars;

export const envs = {
  dbPassword: envVars.DB_PASSWORD,
  dbName: envVars.DB_NAME,
  dbHost: envVars.DB_HOST,
  dbPort: envVars.DB_PORT,
  dbUsername: envVars.DB_USERNAME,

  idSistema: envVars.ID_SISTEMA,

  redisHost: envVars.REDIS_HOST,
  redisPort: envVars.REDIS_PORT,

  port: envVars.PORT,
  hostApi: envVars.HOST_API,

  jwtSecret: envVars.JWT_SECRET,
  jwtSecretExpiresTime: envVars.JWT_SECRET_EXPIRES_TIME,

  formatDateBd: envVars.FORMAT_DATE_BD,
  formatTimeBd: envVars.FORMAT_TIME_BD,
  pathDrive: envVars.PATH_DRIVE,

  whatsappApiId: envVars.WHATSAPP_API_ID,
  whatsappApiToken: envVars.WHATSAPP_API_TOKEN,
  openaiApiKey: envVars.OPENAI_API_KEY,
};
