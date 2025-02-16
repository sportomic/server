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
  const { id } = req.params; // Event ID

  try {
    // Find the event by ID
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // const totalSuccessfulPayments = event.participants.filter(
    //   (participant) => participant.paymentStatus === "success"
    // ).length;

    // Filter participants with successful payment status
    const successfulPayments = event.participants.filter(
      (participant) => participant.paymentStatus === "success"
    );

    // const slotsLeft = event.participantsLimit - totalSuccessfulPayments;

    res.status(200).json({
      eventName: event.name,
      // slotsLeft,
      totalSuccessfulPayments: successfulPayments.length,
      successfulPayments,
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

  // Check for required fields
  if (
    !name ||
    !description ||
    !date ||
    !slot ||
    !participantsLimit ||
    !price ||
    !venueName || // Venue name is required
    !location || // Location is required
    !sportsName // Sports name is required
  ) {
    return res.status(400).send("Please provide all required fields");
  }

  try {
    // Create a new event
    const event = new Event({
      name,
      description,
      date,
      slot,
      participantsLimit,
      price,
      venueName,
      venueImage, // Include the optional venue image
      location, // Include location field
      sportsName, // Include sports name field
    });

    // Save the event to the database
    await event.save();

    res.status(201).json({ message: "Event Created Successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).send("Some error occurred");
  }
};

exports.initiateBooking = async (req, res) => {
  const { id } = req.params;
  const { name, phone, skillLevel } = req.body;

  if (!name || !phone || !skillLevel) {
    return res.status(400).json({
      error: "Name, phone number, and skill level are required",
    });
  }

  // Validate skill level
  if (!["beginner", "intermediate/advanced"].includes(skillLevel)) {
    return res.status(400).json({
      error: "Skill level must be either 'beginner' or 'intermediate'",
    });
  }

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Check if slots are available
    if (event.currentParticipants >= event.participantsLimit) {
      return res.status(400).json({ error: "Event is fully booked" });
    }

    const userDetails = {
      name,
      phone,
      skillLevel,
    };

    const eventDetails = {
      name: event.name,
      date: event.date,
      venueName: event.venueName,
      slot: event.slot,
    };

    const order = await createRazorpayOrder(
      event.price,
      eventDetails,
      userDetails
    );

    res.status(200).json({
      message: "Booking initiated",
      orderId: order.id,
      amount: order.amount,
      eventName: event.name,
      eventDate: event.date,
      eventTime: new Date(event.date).toLocaleTimeString(),
      venue: event.venueName,
      customerName: name,
      customerPhone: phone,
      skillLevel: skillLevel,
      prefill: {
        name: name,
        contact: phone,
      },
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
  } = req.body;

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify payment signature
    const isValid = verifyRazorpayPayment(
      razorpayOrderId,
      paymentId,
      razorpaySignature
    );

    if (isValid) {
      if (event.currentParticipants >= event.participantsLimit) {
        return res.status(400).json({ error: "Event is fully booked" });
      }

      // Validate skill level for new bookings
      if (
        !skillLevel ||
        !["beginner", "intermediate/advanced"].includes(skillLevel)
      ) {
        return res.status(400).json({
          error: "Valid skill level (beginner or intermediate) is required",
        });
      }

      // Create participant object with skill level
      const participant = {
        name: participantName,
        phone: participantPhone,
        skillLevel: skillLevel,
        paymentStatus: "success",
        paymentId: paymentId,
        orderId: razorpayOrderId,
        bookingDate: new Date(),
        amount: event.price,
      };

      // Use findOneAndUpdate to safely update the document
      const updatedEvent = await Event.findOneAndUpdate(
        { _id: id, currentParticipants: { $lt: event.participantsLimit } },
        {
          $push: { participants: participant },
          $inc: { currentParticipants: 1 },
        },
        { new: true, runValidators: true } // Disable validation for this update
      );

      if (!updatedEvent) {
        return res.status(400).json({ error: "Failed to update event" });
      }

      return res.status(200).json({
        message: "Payment confirmed",
        bookingDetails: {
          eventName: event.name,
          eventDate: event.date,
          participantName,
          participantPhone,
          skillLevel,
          paymentId,
          orderId: razorpayOrderId,
          amount: event.price,
        },
      });
    } else {
      return res.status(400).json({ error: "Payment verification failed" });
    }
  } catch (error) {
    console.error("Payment Confirmation Error:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
};

exports.uploadEventsFromExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload an Excel file" });
  }

  // Log the file path to check if it exists
  console.log("Uploaded File Path:", req.file.path);

  try {
    const filePath = req.file.path;

    // Verify file exists before processing
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

    console.log("Parsed Excel Data:", data); // Debugging

    // Validate required fields
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
        console.error("Missing required field in:", event);
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
        venueImage: event.venueImage || "", // Default empty string
        location: event.location,
        sportsName: event.sportsName,
      };
    });

    await Event.insertMany(events);
    fs.unlinkSync(filePath); // Delete file after processing

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
