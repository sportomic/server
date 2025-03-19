const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const fs = require("fs");
const path = require("path");

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
      next();
    }
  );
});

app.use(bodyParser.json());
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
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Error Handling Middleware (Optional)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ error: "Something went wrong!" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
