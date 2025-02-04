const express = require("express");
const {
  getAllEvents,
  getEventById,
  getSuccessfulPayments,
  createEvent,
  initiateBooking,
  confirmPayment,
} = require("../controllers/eventController");
// const verifyAdmin = require("../middleware/verifyAdmin");

const router = express.Router();

router.get("/", getAllEvents);
router.get("/:id", getEventById);
router.get("/:id/successful-payments", getSuccessfulPayments);
router.post("/add-event", createEvent);
router.post("/:id/book", initiateBooking);
router.post("/:id/confirm", confirmPayment);

module.exports = router;
