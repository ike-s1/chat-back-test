const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const config = {
  port: process.env.PORT || 2000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: process.env.CORS_ORIGINS,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiAgentId: process.env.OPENAI_AGENT_ID,
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  
  r2: {
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  ACCESS_TOKEN_EXPIRES: '20m',
  REFRESH_TOKEN_EXPIRES: '3h',
};


module.exports = config; 