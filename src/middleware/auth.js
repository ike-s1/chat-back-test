const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const CustomError = require('./CustomError');



const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      throw new CustomError('No token provided', 401);
    }
    const decoded = verifyToken(token);
    const user = await User.findOne({ _id: decoded.userId });
    if (!user) {
      throw new CustomError('User not found', 401);
    }
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(error.status || 401).json({ message: error.message || 'Please authenticate.' });
  }
};

module.exports = auth; 