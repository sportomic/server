require("./instrument");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const fs = require("fs");
const path = require("path");
const getRawBody = require("raw-body");

const uploadsDir = path.join(__dirname, "Uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

dotenv.config();

const app = express();

// Middleware
app.use(cors());

// Custom middleware to skip body parsing for webhook routes
app.use((req, res, next) => {
  if (req.method === "POST" && req.url === "/api/events/webhook/payu") {
    // Skip all body parsing for PayU webhook
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
          // Parse form-urlencoded data
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
  } else {
    next();
  }
});

// Apply body parsing for non-webhook routes
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
connectDB();

// Routes
const authRoutes = require("./routes/adminAuthRoutes");
const eventRoutes = require("./routes/eventRoutes");
const contactRoutes = require("./routes/contactRoutes");

app.use("/api/admin", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/contact", contactRoutes);

// Default Route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start the server
app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 5000}`);
});

module.exports = { app };
