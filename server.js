const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
connectDB();

// Routes
// const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");

// API Endpoints
// app.use("/api/auth", authRoutes); // Authentication routes
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

//

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
