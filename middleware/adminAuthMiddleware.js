const adminAuth = (req, res, next) => {
  const token = req.header("x-admin-token");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied, no token provided" });
  }

  try {
    if (token !== process.env.ADMIN_TOKEN) {
      res.status(401).json({ message: "Access denied, invalid token" });
    }
    next();
  } catch (e) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = adminAuth;
