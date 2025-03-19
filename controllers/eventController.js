const Event = require("../models/Event");
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../utils/razorpay");
const Excel = require("exceljs");
const XLSX = require("xlsx");
const fs = require("fs");
const axios = require("axios");
const mongoose = require("mongoose");
const crypto = require("crypto");

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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const event = await Event.findById(id).session(session);
      if (!event) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: "Event not found" });
      }

      const successfulParticipants = event.participants.filter(
        (p) => p.paymentStatus === "success"
      );
      const totalBookedSlots = successfulParticipants.reduce(
        (acc, curr) => acc + curr.quantity,
        0
      );
      const availableSlots = event.participantsLimit - totalBookedSlots;

      if (availableSlots < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: `Only ${availableSlots} slots available`,
        });
      }

      const totalAmount = event.price * quantity;

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
      };

      const order = await createRazorpayOrder(
        totalAmount,
        eventDetails,
        userDetails
      );

      const participant = {
        name,
        phone,
        skillLevel,
        paymentStatus: "pending",
        orderId: order.id,
        bookingDate: new Date(),
        amount: totalAmount,
        quantity,
      };

      event.participants.push(participant);
      await event.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        message: "Booking initiated",
        orderId: order.id,
        amount: order.amount,
        eventName: event.name,
        eventDate: event.date,
        venue: event.venueName,
        customerName: name,
        customerPhone: phone,
        skillLevel,
        quantity,
        totalAmount,
        prefill: { name, contact: phone },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Booking Initiation Error:", error);
    res.status(500).json({
      error: "Failed to initiate booking",
      details: error.message,
    });
  }
};

exports.handleRazorpayWebhook = async (req, res) => {
  console.log("Webhook received:", req.body);

  // Verify signature using raw body
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.rawBody; // Requires raw-body middleware

  console.log("Raw body", rawBody);
  console.log("Webhook secret", secret);

  if (!rawBody) {
    console.error("Raw body not available");
    return res.status(500).json({ error: "Raw body not available" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Invalid webhook signature", {
      expectedSignature,
      signature,
    });
    return res.status(400).json({ error: "Invalid signature" });
  }

  const eventType = req.body.event;
  const payload = req.body.payload;

  console.log("Webhook event:", eventType);

  const processPayment = async () => {
    const payment = payload.payment.entity;
    const orderId = payment.order_id;
    const paymentId = payment.id;
    const amount = payment.amount / 100;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const event = await Event.findOne({
        "participants.orderId": orderId,
      }).session(session);
      if (!event) {
        console.error("Event not found for orderId:", orderId);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: "Event not found" });
      }

      const participantIndex = event.participants.findIndex(
        (p) => p.orderId === orderId && p.paymentStatus === "pending"
      );

      if (participantIndex === -1) {
        console.log(
          "Participant already processed or not found for orderId:",
          orderId
        );
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ status: "ok" });
      }

      const participant = event.participants[participantIndex];
      const successfulParticipants = event.participants.filter(
        (p) => p.paymentStatus === "success"
      );
      const totalBookedSlots = successfulParticipants.reduce(
        (acc, curr) => acc + curr.quantity,
        0
      );
      const availableSlots = event.participantsLimit - totalBookedSlots;

      if (availableSlots < participant.quantity) {
        console.error("Not enough slots available for orderId:", orderId);
        await Event.updateOne(
          { _id: event._id, "participants.orderId": orderId },
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
        { _id: event._id, "participants.orderId": orderId },
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

      await session.commitTransaction();
      session.endSession();

      console.log(`Payment confirmed via webhook for orderId: ${orderId}`);
      return res.status(200).json({ status: "ok" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  };

  // Retry logic for transient errors
  const maxRetries = 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      if (
        eventType === "payment.authorized" ||
        eventType === "payment.captured"
      ) {
        await processPayment();
        break; // Success, exit loop
      } else if (eventType === "payment.failed") {
        const payment = payload.payment.entity;
        const orderId = payment.order_id;
        await Event.updateOne(
          { "participants.orderId": orderId },
          { $set: { "participants.$.paymentStatus": "failed" } }
        );
        console.log(`Payment failed for orderId: ${orderId}`);
        return res.status(200).json({ status: "ok" });
      } else {
        console.log("Unhandled webhook event:", eventType);
        return res.status(200).json({ status: "ok" });
      }
    } catch (error) {
      if (
        error.code === 112 &&
        error.errorLabels?.includes("TransientTransactionError")
      ) {
        attempt++;
        console.log(
          `Write conflict detected, retrying (${attempt}/${maxRetries})...`
        );
        if (attempt === maxRetries) {
          console.error("Max retries reached:", error);
          return res
            .status(500)
            .json({ error: "Failed to process webhook after retries" });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      } else {
        console.error("Webhook processing error:", error);
        return res.status(500).json({ error: "Failed to process webhook" });
      }
    }
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
