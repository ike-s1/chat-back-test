const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { registerValidation, loginValidation } = require('../validators/authValidators');

router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.post('/google', authController.googleAuth);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

module.exports = router; 