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
  addParticipantManually,
  uploadEventsFromExcel,
  editEvent,
  deleteEvent,
} = require("../controllers/eventController");
// const verifyAdmin = require("../middleware/verifyAdmin");

const upload = require("../middleware/uploadFile");

router.post("/upload", upload.single("file"), uploadEventsFromExcel);
router.get("/", getAllEvents);
router.get("/excel", downloadEventExcel);
router.get("/:id", getEventById);
router.get("/:id/successful-payments", getSuccessfulPayments);
router.put("/:id", editEvent);
router.delete("/:id", deleteEvent);
router.post("/add-event", createEvent);
router.post("/:id/book", initiateBooking);
router.post("/:id/confirm", confirmPayment);
// router.post("/:id/participants/manual", addParticipantManually);

module.exports = router;
