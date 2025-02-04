const express = require("express");
const router = express.Router();
const { signup, login, updateRole } = require("../controllers/authController");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");

// User signup route
router.post("/signup", signup);

// User login route
router.post("/login", login);

// Update user role (only admins can update roles)
router.put("/update-role", verifyToken, verifyAdmin, updateRole);

module.exports = router;
