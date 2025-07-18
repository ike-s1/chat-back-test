const jwt = require('jsonwebtoken');
const config = require('../config');

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.ACCESS_TOKEN_EXPIRES });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.REFRESH_TOKEN_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function  getUserIdFromAccessToken (req)  {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    return decoded.userId;
  } catch {
    return null;
  }
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  getUserIdFromAccessToken
}; 

