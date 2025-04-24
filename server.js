require("./instrument");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const fs = require("fs");
const path = require("path");
const getRawBody = require("raw-body");
// const Sentry = require("@sentry/node");

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "Uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Load environment variables
dotenv.config();

const app = express();

// Add Express integration to Sentry
//Sentry.addIntegration(expressIntegration({ app }));

// The request handler must be the first middleware on the app
// Sentry.setupExpressErrorHandler(app);
// Middleware
app.use(cors());

// Custom middleware to skip bodyParser.json() for webhook routes
app.use((req, res, next) => {
  if (req.method === "POST" && req.url === "/api/events/webhook/payu") {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});

// Route-specific middleware for webhooks to capture raw body
app.use("/api/events/webhook/payu", (req, res, next) => {
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
        // PayU sends data as form-urlencoded, not JSON
        const params = new URLSearchParams(rawBody);
        req.body = {};
        for (const [key, value] of params) {
          req.body[key] = value;
        }
        next();
      } catch (parseErr) {
        console.error("Error parsing webhook payload:", parseErr);
        return res.status(400).json({ error: "Invalid payload format" });
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
const contactRoutes = require("./routes/contactRoutes");

// API Endpoints
app.use("/api/admin", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/contact", contactRoutes);

// Default Route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// app.get("/debug-sentry", function mainHandler(req, res) {
//   throw new Error("My first Sentry error!");
// });

// Error Handling Middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).send({
//     error: "Something went wrong!",
//     sentryId: res.sentry,
//   });
// });

// Start the server
app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 5000}`);
});

// Export app for use in other modules if needed
module.exports = { app };
