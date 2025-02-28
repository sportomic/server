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
} = require("../controllers/eventController");
// const verifyAdmin = require("../middleware/verifyAdmin");

const upload = require("../middleware/uploadFile");

//bulk upload events
router.post("/upload", upload.single("file"), uploadEventsFromExcel);

//download report
router.get("/excel", downloadEventExcel);

//create,read,edit,delete events
router.get("/", getAllEvents);
router.get("/:id", getEventById);
router.get("/:id/successful-payments", getSuccessfulPayments);
router.put("/:id", editEvent);
router.delete("/:id", deleteEvent);
router.post("/add-event", createEvent);

//booking, payment details
router.post("/:id/book", initiateBooking);
router.post("/:id/confirm", confirmPayment);

//send confirmation and cancellation messages
router.post("/:id/send-confirmation", sendConfirmation);
router.post("/:id/send-cancellation", sendCancellation);

module.exports = router;
