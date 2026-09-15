const express = require('express');
const {
  register, login, me, verifyOtp, resendOtp, forgotPassword, resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validate');

const router = express.Router();

// Every field the API accepts is declared here. Anything not listed is
// stripped before it reaches a controller, which is what stops both
// NoSQL-operator injection (`{"$ne":""}` is not a string) and mass
// assignment (`role: "admin"` in a register body is silently dropped).
const emailField    = rules.email({ required: true });
const passwordField = rules.str({ required: true, min: 8, max: 200, trim: false });

router.post('/register', validate({
  body: {
    name:            rules.str({ required: true, min: 1, max: 80 }),
    email:           emailField,
    password:        passwordField,
    confirmPassword: rules.str({ max: 200, trim: false }),
  },
}), register);

router.post('/login', validate({
  body: {
    email:    emailField,
    // No min length on login — an old account may predate the current policy,
    // and rejecting short input here would leak which passwords are too short.
    password: rules.str({ required: true, max: 200, trim: false }),
  },
}), login);

router.post('/verify-otp', validate({
  body: {
    email: emailField,
    otp:   rules.str({ required: true, min: 6, max: 6, pattern: /^\d{6}$/, patternMessage: 'Code must be 6 digits.' }),
  },
}), verifyOtp);

router.post('/resend-otp', validate({ body: { email: emailField } }), resendOtp);

router.post('/forgot-password', validate({ body: { email: emailField } }), forgotPassword);

router.post('/reset-password', validate({
  body: {
    email:           emailField,
    token:           rules.str({ required: true, min: 20, max: 200, trim: false }),
    password:        passwordField,
    confirmPassword: rules.str({ max: 200, trim: false }),
  },
}), resetPassword);

router.get('/me', protect, me);

module.exports = router;
