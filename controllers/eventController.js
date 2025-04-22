const Event = require("../models/Event");
const {
  createPayuPaymentRequest,
  verifyPayuPayment,
  processPayuWebhook,
} = require("../utils/payu");
const Excel = require("exceljs");
const XLSX = require("xlsx");
const fs = require("fs");
const axios = require("axios");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Sentry = require("@sentry/node");

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
      "Payment Id",
      "Order Id",
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
            participant.paymentId,
            participant.orderId,
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
  const transaction = Sentry.startTransaction({
    op: "get_events",
    name: "Get All Events",
  });

  try {
    const { sport } = req.query;
    let filter = {};

    Sentry.setContext("query", {
      sport: sport || "all",
    });

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
    Sentry.captureException(error);
    console.error("Error in getAllEvents:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  } finally {
    transaction.finish();
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
  const transaction = Sentry.startTransaction({
    op: "booking",
    name: "Initiate Booking",
  });

  const { id } = req.params;
  const { name, phone, skillLevel, quantity = 1 } = req.body;

  try {
    // Add request context to Sentry
    Sentry.setContext("booking_request", {
      eventId: id,
      name,
      phone,
      skillLevel,
      quantity,
    });

    if (!name || !phone || !skillLevel) {
      Sentry.setContext("validation_error", {
        missingFields: {
          name: !name,
          phone: !phone,
          skillLevel: !skillLevel,
        },
      });
      return res.status(400).json({
        error: "Name, phone number, and skill level are required",
      });
    }

    if (typeof quantity !== "number" || quantity < 1) {
      Sentry.setContext("validation_error", {
        invalidQuantity: quantity,
      });
      return res.status(400).json({ error: "Invalid quantity" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create a child span for database operations
      const dbSpan = transaction.startChild({
        op: "db",
        description: "Find Event and Process Booking",
      });

      const event = await Event.findById(id).session(session);
      if (!event) {
        Sentry.captureMessage("Event not found during booking", {
          level: "error",
          extra: { eventId: id },
        });
        await session.abortTransaction();
        session.endSession();
        dbSpan.finish();
        return res.status(404).json({ error: "Event not found" });
      }

      // Add event context to Sentry
      Sentry.setContext("event_details", {
        eventId: event._id,
        eventName: event.name,
        participantsLimit: event.participantsLimit,
        currentParticipants: event.currentParticipants,
      });

      const successfulParticipants = event.participants.filter(
        (p) => p.paymentStatus === "success"
      );
      const totalBookedSlots = successfulParticipants.reduce(
        (acc, curr) => acc + curr.quantity,
        0
      );
      const availableSlots = event.participantsLimit - totalBookedSlots;

      if (availableSlots < quantity) {
        Sentry.captureMessage("Insufficient slots available", {
          level: "warning",
          extra: {
            availableSlots,
            requestedQuantity: quantity,
            eventId: event._id,
          },
        });
        await session.abortTransaction();
        session.endSession();
        dbSpan.finish();
        return res.status(400).json({
          error: `Only ${availableSlots} slots available`,
        });
      }

      const totalAmount = event.price * quantity;

      // Create a child span for PayU payment request creation
      const payuSpan = transaction.startChild({
        op: "payu",
        description: "Create PayU Payment Request",
      });

      const eventDetails = {
        eventId: event._id,
        name: event.name,
        date: event.date,
        venueName: event.venueName,
        slot: event.slot,
      };

      const userDetails = {
        name,
        phone,
        skillLevel,
        quantity,
        email: req.body.email || `${phone}@example.com`, // PayU requires email
      };

      const payuRequest = await createPayuPaymentRequest(
        totalAmount,
        eventDetails,
        userDetails
      );
      payuSpan.finish();

      // Add order context to Sentry
      Sentry.setContext("order_details", {
        txnId: payuRequest.txnId,
        amount: totalAmount,
      });

      const participant = {
        name,
        phone,
        skillLevel,
        paymentStatus: "pending",
        orderId: payuRequest.txnId,
        bookingDate: new Date(),
        amount: totalAmount,
        quantity,
      };

      event.participants.push(participant);
      await event.save({ session });

      await session.commitTransaction();
      session.endSession();
      dbSpan.finish();

      res.status(200).json({
        message: "Booking initiated",
        txnId: payuRequest.txnId,
        amount: totalAmount,
        paymentUrl: payuRequest.payuUrl,
        paymentData: payuRequest.paymentData,
        eventName: event.name,
        eventDate: event.date,
        venue: event.venueName,
        customerName: name,
        customerPhone: phone,
        skillLevel,
        quantity,
        totalAmount,
      });
    } catch (error) {
      Sentry.captureException(error);
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error("Booking Initiation Error:", error);
    res.status(500).json({
      error: "Failed to initiate booking",
      details: error.message,
    });
  } finally {
    transaction.finish();
  }
};

// Replace Razorpay webhook handler with PayU webhook handler
exports.handlePayuWebhook = async (req, res) => {
  const transaction = Sentry.startTransaction({
    op: "webhook",
    name: "PayU Webhook Handler",
  });

  try {
    Sentry.setContext("webhook", {
      txnId: req.body.txnid,
      status: req.body.status,
    });

    console.log("PayU Webhook received:", req.body);

    // Process the webhook data
    let paymentData;
    try {
      paymentData = processPayuWebhook(req.body);
    } catch (error) {
      console.error("Error processing PayU webhook:", error);
      return res.status(400).json({ error: "Invalid webhook data" });
    }

    const { txnId, paymentId, status, amount } = paymentData;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const event = await Event.findOne({
        "participants.orderId": txnId,
      }).session(session);
      
      if (!event) {
        console.error("Event not found for txnId:", txnId);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: "Event not found" });
      }

      const participantIndex = event.participants.findIndex(
        (p) => p.orderId === txnId && p.paymentStatus === "pending"
      );

      if (participantIndex === -1) {
        console.log(
          "Participant already processed or not found for txnId:",
          txnId
        );
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ status: "ok" });
      }

      const participant = event.participants[participantIndex];
      
      if (status === "success") {
        const successfulParticipants = event.participants.filter(
          (p) => p.paymentStatus === "success"
        );
        const totalBookedSlots = successfulParticipants.reduce(
          (acc, curr) => acc + curr.quantity,
          0
        );
        const availableSlots = event.participantsLimit - totalBookedSlots;

        if (availableSlots < participant.quantity) {
          console.error("Not enough slots available for txnId:", txnId);
          await Event.updateOne(
            { _id: event._id, "participants.orderId": txnId },
            { $set: { "participants.$.paymentStatus": "failed" } },
            { session }
          );
          await session.commitTransaction();
          session.endSession();
          return res.status(200).json({
            status: "ok",
            note: "Payment processed but booking failed due to insufficient slots",
          });
        }

        await Event.updateOne(
          { _id: event._id, "participants.orderId": txnId },
          {
            $set: {
              "participants.$.paymentStatus": "success",
              "participants.$.paymentId": paymentId,
              "participants.$.bookingDate": new Date(),
              "participants.$.amount": amount,
            },
            $inc: { currentParticipants: participant.quantity },
          },
          { session }
        );
      } else {
        await Event.updateOne(
          { _id: event._id, "participants.orderId": txnId },
          { $set: { "participants.$.paymentStatus": "failed" } },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      console.log(`Payment ${status} via webhook for txnId: ${txnId}`);
      return res.status(200).json({ status: "ok" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  } finally {
    transaction.finish();
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
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const utcDate = new Date(excelEpoch.getTime() + serial * 86400000);
      if (serial >= 60) {
        utcDate.setTime(utcDate.getTime() + 86400000);
      }
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
      .filter((p) => p.phone && /^\d{12}$/.test(p.phone));

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
            to: [participant.phone],
            components: {
              header_1: {
                type: "image",
                value:
                  event.venueImage || "https://files.msg91.com/432091/vcaifgxt",
              },
              body_1: { type: "text", value: participant.name },
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

    const response = await axios.post(MSG91_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
    });

    event.confirmationCount += 1;
    await event.save();

    res.status(200).json({
      message: "Confirmation messages sent",
      confirmationCount: event.confirmationCount,
      data: response.data,
    });
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
                  event.venueImage || "https://files.msg91.com/432091/vcaifgxt",
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

    const response = await axios.post(MSG91_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
    });

    event.cancellationCount += 1;
    await event.save();

    res.status(200).json({
      message: "Cancellation messages sent",
      cancellationCount: event.cancellationCount,
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error sending cancellation:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Failed to send cancellation messages" });
  }
};
