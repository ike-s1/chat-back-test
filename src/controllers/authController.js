// Auth Controller
const { signAccessToken, signRefreshToken, verifyToken, getUserIdFromAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client("751909940203-1foa9d4b6mrsrpovvbgohnutdhe8mcpn.apps.googleusercontent.com");
const logger = require('../logger');
const CustomError = require('../middleware/CustomError');
const Token = require('../models/Token');


exports.register = async (req, res, next) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new CustomError('User already exists', 400));
    }
    const user = new User({ email, password, name });
    await user.save();
    const accessToken = signAccessToken({ userId: user._id });
    const refreshToken = signRefreshToken({ userId: user._id });
    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      return next(error);
    }
    logger.error("Error creating user:", error);
    next(new CustomError('Error creating user', 500));
  }
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return next(new CustomError('Invalid credentials', 401));
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(new CustomError('Invalid credentials', 401));
    }
    const accessToken = signAccessToken({ userId: user._id });
    const refreshToken = signRefreshToken({ userId: user._id });

    await Token.create({
      userID: user._id,
      accessToken,
      refreshToken
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    if (error instanceof CustomError) {
      return next(error);
    }
    logger.error("Error logging in:", error);
    next(new CustomError('Error logging in', 500));
  }
};

exports.googleAuth = async (req, res, next) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: "751909940203-1foa9d4b6mrsrpovvbgohnutdhe8mcpn.apps.googleusercontent.com"
    });
    const payload = ticket.getPayload();
    const { email, sub: googleId, name, picture } = payload;
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        name,
        googleId,
        password: Math.random().toString(36),
      });
      await user.save();
    }
    const accessToken = signAccessToken({ userId: user._id });
    const refreshToken = signRefreshToken({ userId: user._id });

    await Token.create({
      userID: user._id,
      accessToken,
      refreshToken
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture
      }
    });
  } catch (err) {
    logger.error("Google Auth Error:", err);
    next(new CustomError('Invalid Google token', 401));
  }
};

exports.refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token required' });
  }

  try {
    const decoded = verifyToken(refreshToken);
    const user = await User.findById(decoded.userId);
    const tokenDoc = await Token.findOne({ refreshToken });
    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid or revoked refresh token' });
    }

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const newAccessToken = signAccessToken({ userId: user._id });
    tokenDoc.accessToken = newAccessToken;
    await tokenDoc.save();

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};


exports.logout = async (req, res, next) => {
  try {
    const userIdFromAccessToken = getUserIdFromAccessToken(req);

    const tokenDoc = await Token.findOne({ userID: userIdFromAccessToken });

    if (!tokenDoc) {
      return res.status(401).json({ message: 'Token not found or already logged out' });
    }

    await Token.deleteOne({ _id: tokenDoc._id });;

    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json(response({ statusCode: 500, data: { message: error.message } }));
  }
};