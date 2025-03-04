const express = require("express");
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  getSuccessfulPayments,
  createEvent,
  initiateBooking,
  confirmPayment,
  downloadEventExcel,
  uploadEventsFromExcel,
  editEvent,
  deleteEvent,
  sendConfirmation,
  sendCancellation,
  handleRazorpayWebhook,
} = require("../controllers/eventController");
const verifyAdmin = require("../middleware/verifyAdmin"); // Import the middleware
const upload = require("../middleware/uploadFile");

// Admin-only routes (protected with verifyAdmin middleware)
router.post("/upload", upload.single("file"), uploadEventsFromExcel);
router.get("/excel", downloadEventExcel);
router.post("/add-event", createEvent);
router.put("/:id", editEvent);
router.delete("/:id", deleteEvent);

// Public routes (no admin verification needed)
router.get("/", getAllEvents);
router.get("/:id", getEventById);
router.get("/:id/successful-payments", getSuccessfulPayments);

// Booking and payment routes (could be restricted based on your needs)
router.post("/webhook/razorpay", handleRazorpayWebhook);
router.post("/:id/book", initiateBooking);
router.post("/:id/confirm", confirmPayment);

// Notification routes (could be admin-only or user-specific depending on logic)
router.post("/:id/send-confirmation", sendConfirmation);
router.post("/:id/send-cancellation", sendCancellation);

module.exports = router;
