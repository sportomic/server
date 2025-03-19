const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const fs = require("fs");
const path = require("path");
const getRawBody = require("raw-body");

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

// Custom middleware to skip bodyParser.json() for webhook route
app.use((req, res, next) => {
  if (req.method === "POST" && req.url === "/api/events/webhook/razorpay") {
    // Skip to route-specific handler without parsing body
    next();
  } else {
    // Apply bodyParser.json() for all other routes
    bodyParser.json()(req, res, next);
  }
});

// Route-specific middleware for webhook to capture raw body
app.use("/api/events/webhook/razorpay", (req, res, next) => {
  getRawBody(
    req,
    {
      length: req.headers["content-length"],
      encoding: "utf8",
    },
    (err, rawBody) => {
      if (err) {
        console.error("Error capturing raw body:", err);
        return res.status(500).json({ error: "Failed to process raw body" });
      }
      req.rawBody = rawBody;
      try {
        req.body = JSON.parse(rawBody); // Parse for downstream use
        next();
      } catch (parseErr) {
        console.error("Error parsing raw body as JSON:", parseErr);
        return res.status(400).json({ error: "Invalid JSON in request body" });
      }
    }
  );
});

// Other middleware
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
connectDB();

// Routes
const authRoutes = require("./routes/adminAuthRoutes");
const eventRoutes = require("./routes/eventRoutes");

// API Endpoints
app.use("/api/admin", authRoutes); // Authentication routes
app.use("/api/events", eventRoutes); // Event-related routes

// Default Route
app.get("/", (req, res, next) => {
  res.send("API is running...");
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ error: "Something went wrong!" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
