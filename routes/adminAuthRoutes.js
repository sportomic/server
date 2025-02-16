const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuthMiddleware");
const crypto = require("crypto");

//login route
router.post("/login", (req, res) => {
  const { password } = req.body;

  // Compare with hashed password stored in environment variable
  const hashedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");

  if (hashedPassword === process.env.ADMIN_PASSWORD_HASH) {
    // Generate a token (you might want to use JWT in production)
    const token = process.env.ADMIN_TOKEN;
    res.json({ token });
  } else {
    res.status(401).json({ message: "Invalid password" });
  }
});

router.get("/verify", adminAuth, (req, res) => {
  res.json({ valid: true });
});

module.exports = router;
