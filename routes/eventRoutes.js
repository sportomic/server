const express = require("express");
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  getSuccessfulPayments,
  createEvent,
  initiateBooking,
  // confirmPayment,
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

router.post("/upload", upload.single("file"), uploadEventsFromExcel);
router.get("/excel", downloadEventExcel);
router.post("/add-event", createEvent);
router.put("/:id", editEvent);
router.delete("/:id", deleteEvent);

router.get("/", getAllEvents);
router.get("/:id", getEventById);
router.get("/:id/successful-payments", getSuccessfulPayments);

router.post("/webhook/razorpay", handleRazorpayWebhook);
router.post("/:id/book", initiateBooking);
// router.post("/:id/confirm", confirmPayment);

router.post("/:id/send-confirmation", sendConfirmation);
router.post("/:id/send-cancellation", sendCancellation);

module.exports = router;
