const logger = require('../logger');

function errorHandler(err, req, res, next) {
  logger.error(err.stack || err.message, { error: err });
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

module.exports = errorHandler; 