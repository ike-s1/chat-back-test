const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./src/middleware/errorHandler');
const config = require('./src/config');


dotenv.config();
const app = express();

app.set('trust proxy', 1);

app.use(helmet()); 

const allowedOrigins = [config.corsOrigins];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS policy violation'), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

if (config.nodeEnv === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user')
const assistantRoutes = require('./src/routes/assistant');
const sourcesRoutes = require('./src/routes/sources');
const healthRoutes = require('./src/routes/health');


app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes)
app.use('/api/assistant', assistantRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/health', healthRoutes);


mongoose.connect(config.mongodbUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));


app.use(errorHandler);


const PORT = config.port || 2000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 