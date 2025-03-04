const Event = require("../models/Event");
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../utils/razorpay");
const Excel = require("exceljs");
const XLSX = require("xlsx");
const fs = require("fs");
const axios = require("axios");

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

exports.editEvent = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    if (!id) return res.status(400).json({ error: "Event ID is required" });
    const event = await Event.findByIdAndUpdate(id, updates, { new: true });
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json({ message: "Event updated successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update event" });
  }
};

exports.deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    if (!id) return res.status(400).json({ error: "Event ID is required" });
    const event = await Event.findByIdAndDelete(id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.status(200).json({ message: "Event deleted successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete event" });
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

    // Store participant with pending status and orderId
    const participant = {
      name,
      phone,
      skillLevel,
      paymentStatus: "pending",
      orderId: order.id, // Ensure this is saved for webhook matching
      quantity,
      amount: totalAmount,
    };

    await Event.findByIdAndUpdate(id, {
      $push: { participants: participant },
    });

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

    // Check if participant already exists with this orderId
    const existingParticipant = event.participants.find(
      (p) => p.orderId === razorpayOrderId
    );

    if (existingParticipant) {
      // If webhook already processed it, return success without updating
      if (existingParticipant.paymentStatus === "success") {
        return res.status(200).json({
          message: "Payment already confirmed",
          bookingDetails: {
            eventName: event.name,
            eventDate: event.date,
            participantName: existingParticipant.name,
            participantPhone: existingParticipant.phone,
            skillLevel: existingParticipant.skillLevel,
            quantity: existingParticipant.quantity,
            totalAmount: existingParticipant.amount,
            paymentId: existingParticipant.paymentId,
            orderId: existingParticipant.orderId,
          },
        });
      }

      // Update existing participant (webhook hasn’t run yet)
      const updatedEvent = await Event.findOneAndUpdate(
        {
          _id: id,
          "participants.orderId": razorpayOrderId,
        },
        {
          $set: {
            "participants.$.paymentStatus": "success",
            "participants.$.paymentId": paymentId,
            "participants.$.bookingDate": new Date(),
            "participants.$.amount": totalAmount,
          },
          $inc: { currentParticipants: quantity },
        },
        { new: true }
      );

      if (!updatedEvent) {
        return res.status(400).json({ error: "Failed to update event" });
      }
    } else {
      // If no participant exists (rare edge case), add it
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
        { new: true }
      );

      if (!updatedEvent) {
        return res.status(400).json({ error: "Failed to update event" });
      }
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

const crypto = require("crypto");
exports.handleRazorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Invalid webhook signature");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const eventType = req.body.event;
  const payload = req.body.payload;

  if (eventType === "payment.authorized" || eventType === "payment.captured") {
    const payment = payload.payment.entity;
    const orderId = payment.order_id;
    const paymentId = payment.id;
    const amount = payment.amount / 100; // Convert paise to rupees

    try {
      const event = await Event.findOne({ "participants.orderId": orderId });
      if (!event) {
        console.error("Event not found for orderId:", orderId);
        return res.status(404).json({ error: "Event not found" });
      }

      const participant = event.participants.find(
        (p) => p.orderId === orderId && p.paymentStatus === "success"
      );

      if (!participant) {
        const updatedEvent = await Event.findOneAndUpdate(
          { _id: event._id, "participants.orderId": orderId },
          {
            $set: {
              "participants.$.paymentStatus": "success",
              "participants.$.paymentId": paymentId,
              "participants.$.bookingDate": new Date(),
              "participants.$.amount": amount,
            },
            $inc: {
              currentParticipants: event.participants.find(
                (p) => p.orderId === orderId
              ).quantity,
            },
          },
          { new: true }
        );

        if (!updatedEvent) {
          console.error("Failed to update event for orderId:", orderId);
          return res.status(400).json({ error: "Failed to update event" });
        }

        console.log(`Payment recorded for orderId: ${orderId}`);
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
      return res.status(500).json({ error: "Failed to process webhook" });
    }
  }

  res.status(200).json({ status: "ok" });
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
      // Create a date based on Excel's epoch (December 30, 1899)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));

      // Calculate milliseconds and create a UTC date
      const utcDate = new Date(excelEpoch.getTime() + serial * 86400000);

      // Adjust for the Excel leap year bug (1900 is not a leap year)
      if (serial >= 60) {
        utcDate.setTime(utcDate.getTime() + 86400000);
      }

      // Return the date keeping it in UTC to avoid timezone shifts
      const year = utcDate.getUTCFullYear();
      const month = utcDate.getUTCMonth();
      const day = utcDate.getUTCDate();

      return new Date(Date.UTC(year, month, day));
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

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_API_URL = process.env.MSG91_API_URL;
const INTEGRATED_NUMBER = process.env.INTEGRATED_NUMBER;

exports.sendConfirmation = async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const participants = event.participants
      .filter((p) => p.paymentStatus === "success")
      .map((p) => ({
        phone: `91${p.phone}`,
        name: p.name || "Player",
      }))
      .filter((p) => p.phone && /^\d{12}$/.test(p.phone)); // Ensure valid 12-digit numbers with country code

    // console.log("Participants to send confirmation:", participants);

    if (participants.length === 0) {
      return res.status(400).json({
        error: "No valid participants with successful payments found",
      });
    }

    const formattedDate = new Date(event.date)
      .toLocaleDateString("en-GB")
      .replace(/\//g, "-");

    const payload = {
      integrated_number: INTEGRATED_NUMBER,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: "playverse_game_confirmation_24_feb_template",
          language: { code: "en", policy: "deterministic" },
          namespace: "6e8aa1f2_7d4c_4f4b_865c_882d0f4043be",
          to_and_components: participants.map((participant) => ({
            to: [participant.phone], // Single phone number per entry
            components: {
              header_1: {
                type: "image",
                value:
                  event.venueImage || "https://files.msg91.com/432091/vcaifgxt",
              },
              body_1: { type: "text", value: participant.name }, // Individual name
              body_2: { type: "text", value: event.name },
              body_3: { type: "text", value: event.venueName },
              body_4: { type: "text", value: event.sportsName },
              body_5: { type: "text", value: formattedDate },
              body_6: { type: "text", value: event.slot },
              body_7: { type: "text", value: event.location },
              button_1: {
                subtype: "url",
                type: "text",
                value: "https://sportomic.com/confirm?event=" + event._id,
              },
            },
          })),
        },
      },
    };

    // console.log("MSG91 Payload:", JSON.stringify(payload, null, 2));

    const response = await axios.post(MSG91_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
    });

    // console.log("MSG91 Response:", response.data);
    res
      .status(200)
      .json({ message: "Confirmation messages sent", data: response.data });
  } catch (error) {
    console.error(
      "Error sending confirmation:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to send confirmation messages" });
  }
};

exports.sendCancellation = async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const participants = event.participants
      .filter((p) => p.paymentStatus === "success")
      .map((p) => ({
        phone: `91${p.phone}`,
        name: p.name || "Player",
      }))
      .filter((p) => p.phone && /^\d{12}$/.test(p.phone));

    // console.log("Participants to send cancellation:", participants);

    if (participants.length === 0) {
      return res.status(400).json({
        error: "No valid participants with successful payments found",
      });
    }

    const formattedDate = new Date(event.date)
      .toLocaleDateString("en-GB")
      .replace(/\//g, "-");

    const payload = {
      integrated_number: INTEGRATED_NUMBER,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: "playverse_cancellation_msg_24_feb",
          language: { code: "en", policy: "deterministic" },
          namespace: "6e8aa1f2_7d4c_4f4b_865c_882d0f4043be",
          to_and_components: participants.map((participant) => ({
            to: [participant.phone],
            components: {
              header_1: {
                type: "image",
                value:
                  event.venueImage || "https://files.msg91.com/432091/vcaifgxt", // Use venueImage or fallback
              },
              body_1: { type: "text", value: participant.name },
              body_2: { type: "text", value: event.name },
              body_3: { type: "text", value: event.venueName },
              body_4: { type: "text", value: event.sportsName },
              body_5: { type: "text", value: formattedDate },
              body_6: { type: "text", value: event.slot },
            },
          })),
        },
      },
    };

    // console.log("MSG91 Payload:", JSON.stringify(payload, null, 2));

    const response = await axios.post(MSG91_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
    });

    // console.log("MSG91 Response:", response.data);
    res
      .status(200)
      .json({ message: "Cancellation messages sent", data: response.data });
  } catch (error) {
    console.error(
      "Error sending cancellation:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to send cancellation messages" });
  }
};
