const Event = require("../models/Event");
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../utils/razorpay");
const Excel = require("exceljs");
const XLSX = require("xlsx");
const fs = require("fs");

exports.downloadEventExcel = async (req, res) => {
  try {
    const events = await Event.find();

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet("Events");

    worksheet.addRow([
      "Event ID",
      "Event Name",
      "Sport",
      "Venue Name",
      "Skill Level",
      "Date",
      "Time",
      "Event Price",
      "Participant Name",
      "Participant Phone",
      "Participant Id",
      "Quantity",
      "Total Amount",
    ]);

    for (const event of events) {
      for (const participant of event.participants) {
        if (participant.paymentStatus === "success") {
          worksheet.addRow([
            event._id,
            event.name,
            event.sportsName,
            event.venueName,
            participant.skillLevel,
            event.date,
            event.slot,
            event.price,
            participant.name,
            participant.phone,
            participant.id,
            participant.quantity,
            participant.amount,
          ]);
        }
      }
    }

    const fileName = `events_${new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "")}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("Error in downloadEventExcel:", error);
    res.status(500).json({ error: "Failed to generate Excel file" });
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const { sport } = req.query;
    let filter = {};

    if (sport && sport.toLowerCase() !== "all") {
      filter.sportsName = sport.toLowerCase();
    }

    const events = await Event.find(filter);
    const allSports = await Event.distinct("sportsName");

    const eventsWithSlots = events.map((event) => ({
      ...event._doc,
      slotsLeft: event.participantsLimit - event.currentParticipants,
    }));

    res.status(200).json({
      total: events.length,
      sport: sport || "all",
      availableSports: allSports,
      events: eventsWithSlots,
    });
  } catch (error) {
    console.error("Error in getAllEvents:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
};

exports.getEventById = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
};
//get user based over successfull payment based on event id
exports.getSuccessfulPayments = async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const successfulPayments = event.participants.filter(
      (participant) => participant.paymentStatus === "success"
    );

    const totalBookedSlots = successfulPayments.reduce(
      (acc, curr) => acc + curr.quantity,
      0
    );
    const slotsLeft = event.participantsLimit - totalBookedSlots;

    res.status(200).json({
      eventName: event.name,
      slotsLeft,
      totalBookedSlots,
      totalSuccessfulPayments: successfulPayments.length,
      successfulPayments: successfulPayments.map((p) => ({
        name: p.name,
        phone: p.phone,
        skillLevel: p.skillLevel,
        quantity: p.quantity,
        amount: p.amount,
        paymentId: p.paymentId,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch successful payments" });
  }
};

exports.createEvent = async (req, res) => {
  const {
    name,
    description,
    date,
    slot,
    participantsLimit,
    price,
    venueName,
    venueImage,
    location,
    sportsName,
  } = req.body;

  if (
    !name ||
    !description ||
    !date ||
    !slot ||
    !participantsLimit ||
    !price ||
    !venueName ||
    !location ||
    !sportsName
  ) {
    return res.status(400).send("Please provide all required fields");
  }

  try {
    const event = new Event({
      name,
      description,
      date,
      slot,
      participantsLimit,
      price,
      venueName,
      venueImage,
      location,
      sportsName,
    });

    await event.save();
    res.status(201).json({ message: "Event Created Successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).send("Some error occurred");
  }
};

exports.initiateBooking = async (req, res) => {
  const { id } = req.params;
  const { name, phone, skillLevel, quantity = 1 } = req.body;

  if (!name || !phone || !skillLevel) {
    return res.status(400).json({
      error: "Name, phone number, and skill level are required",
    });
  }

  if (typeof quantity !== "number" || quantity < 1) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const availableSlots = event.participantsLimit - event.currentParticipants;
    if (availableSlots < quantity) {
      return res.status(400).json({
        error: `Only ${availableSlots} slots available`,
      });
    }

    const totalAmount = event.price * quantity;

    const eventDetails = {
      name: event.name,
      date: event.date,
      venueName: event.venueName,
      slot: event.slot,
    };

    const userDetails = { name, phone, skillLevel, quantity };

    const order = await createRazorpayOrder(
      totalAmount,
      eventDetails,
      userDetails
    );

    res.status(200).json({
      message: "Booking initiated",
      orderId: order.id,
      amount: order.amount,
      eventName: event.name,
      eventDate: event.date,
      venue: event.venueName,
      customerName: name,
      customerPhone: phone,
      skillLevel: skillLevel,
      quantity: quantity,
      totalAmount: totalAmount,
      prefill: { name, contact: phone },
    });
  } catch (error) {
    console.error("Booking Initiation Error:", error);
    res.status(500).json({
      error: "Failed to initiate booking",
      details: error.message,
    });
  }
};

exports.confirmPayment = async (req, res) => {
  const { id } = req.params;
  const {
    paymentId,
    razorpayOrderId,
    razorpaySignature,
    participantName,
    participantPhone,
    skillLevel,
    quantity,
  } = req.body;

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const availableSlots = event.participantsLimit - event.currentParticipants;
    if (availableSlots < quantity) {
      return res.status(400).json({ error: "Not enough slots available" });
    }

    const isValid = verifyRazorpayPayment(
      razorpayOrderId,
      paymentId,
      razorpaySignature
    );

    if (!isValid) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const totalAmount = event.price * quantity;

    const participant = {
      name: participantName,
      phone: participantPhone,
      skillLevel: skillLevel,
      paymentStatus: "success",
      paymentId: paymentId,
      orderId: razorpayOrderId,
      bookingDate: new Date(),
      amount: totalAmount,
      quantity: quantity,
    };

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: id,
        currentParticipants: { $lte: event.participantsLimit - quantity },
      },
      {
        $push: { participants: participant },
        $inc: { currentParticipants: quantity },
      },
      { new: true, runValidators: true }
    );

    if (!updatedEvent) {
      return res.status(400).json({ error: "Failed to update event" });
    }

    res.status(200).json({
      message: "Payment confirmed",
      bookingDetails: {
        eventName: event.name,
        eventDate: event.date,
        participantName,
        participantPhone,
        skillLevel,
        quantity,
        totalAmount,
        paymentId,
        orderId: razorpayOrderId,
      },
    });
  } catch (error) {
    console.error("Payment Confirmation Error:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
};
exports.uploadEventsFromExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload an Excel file" });
  }

  try {
    const filePath = req.file.path;
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ message: "Uploaded file not found" });
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const excelSerialToJSDate = (serial) => {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + serial * 86400000);
    };

    const events = data.map((event) => {
      if (
        !event.name ||
        !event.description ||
        !event.date ||
        !event.slot ||
        !event.participantsLimit ||
        !event.price ||
        !event.venueName ||
        !event.location ||
        !event.sportsName
      ) {
        throw new Error("Each event must have all required fields");
      }
      return {
        name: event.name,
        description: event.description,
        date: excelSerialToJSDate(event.date),
        slot: event.slot,
        participantsLimit: Number(event.participantsLimit),
        price: Number(event.price),
        venueName: event.venueName,
        venueImage: event.venueImage || "",
        location: event.location,
        sportsName: event.sportsName,
      };
    });

    await Event.insertMany(events);
    fs.unlinkSync(filePath);

    res.status(201).json({ message: "Events Uploaded Successfully", events });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ message: error.message });
  }
};
// exports.addParticipantManually = async (req, res) => {
//   const { id } = req.params;
//   const { name, phone, skillLevel } = req.body;

//   if (!name || !phone || !skillLevel) {
//     return res.status(400).json({
//       error: "Please provide name, phone, and skill level",
//     });
//   }

//   // Validate skill level
//   if (!["beginner", "intermediate/advanced"].includes(skillLevel)) {
//     return res.status(400).json({
//       error: "Skill level must be either 'beginner' or 'intermediate'",
//     });
//   }

//   try {
//     const event = await Event.findById(id);
//     if (!event) return res.status(404).json({ error: "Event not found" });

//     // Check if slots are available
//     if (event.currentParticipants >= event.participantsLimit) {
//       return res.status(400).json({ error: "Event is fully booked" });
//     }

//     // Create participant object
//     const participant = {
//       name,
//       phone,
//       skillLevel,
//       paymentStatus: "success",
//     };

//     // Use findOneAndUpdate to safely update the document
//     const updatedEvent = await Event.findOneAndUpdate(
//       { _id: id, currentParticipants: { $lt: event.participantsLimit } },
//       {
//         $push: { participants: participant },
//         $inc: { currentParticipants: 1 },
//       },
//       { new: true }
//     );

//     if (!updatedEvent) {
//       return res.status(400).json({ error: "Failed to update event" });
//     }

//     return res.status(200).json({
//       message: "Participant added manually",
//       participant,
//     });
//   } catch (error) {
//     console.error("Manual Participant Addition Error:", error);
//     res.status(500).json({ error: "Failed to add participant manually" });
//   }
// };
