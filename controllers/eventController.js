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
// Removed: const Sentry = require("@sentry/node");

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

    // Removed: Sentry.setContext("query", { sport: sport || "all" });

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
    // Removed: Sentry.captureException(error);
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
  const { name, phone, skillLevel, quantity = 1, email } = req.body;

  try {
    if (!name || !phone || !skillLevel) {
      return res.status(400).json({
        error: "Name, phone number, and skill level are required",
      });
    }

    if (typeof quantity !== "number" || quantity < 1) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: "Phone number must be 10 digits" });
    }

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
        email: email || `${phone}@example.com`, // PayU requires email
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

      // Flatten response
      res.status(200).json({
        message: "Booking initiated",
        payuUrl: payuRequest.payuUrl,
        key: payuRequest.paymentData.key,
        txnid: payuRequest.txnId,
        amount: payuRequest.paymentData.amount,
        productinfo: payuRequest.paymentData.productinfo,
        firstname: payuRequest.paymentData.firstname,
        email: payuRequest.paymentData.email,
        phone: payuRequest.paymentData.phone,
        surl: payuRequest.paymentData.surl,
        furl: payuRequest.paymentData.furl,
        hash: payuRequest.paymentData.hash,
        udf1: payuRequest.paymentData.udf1,
        udf2: payuRequest.paymentData.udf2,
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
    console.error(`Booking Initiation Error for event ${id}:`, error.message);
    res.status(500).json({
      error: "Failed to initiate booking",
      details: error.message,
    });
  }
};

// Replace Razorpay webhook handler with PayU webhook handler
exports.handlePayuWebhook = async (req, res) => {
  try {
    console.log("PayU Webhook received:", JSON.stringify(req.body, null, 2));

    let paymentData;
    try {
      paymentData = processPayuWebhook(req.body);
    } catch (error) {
      console.error("Error processing PayU webhook:", error.message);
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
        console.error(`Event not found for txnId: ${txnId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ error: "Event not found" });
      }

      const participantIndex = event.participants.findIndex(
        (p) => p.orderId === txnId && p.paymentStatus === "pending"
      );

      if (participantIndex === -1) {
        console.log(
          `Participant already processed or not found for txnId: ${txnId}`
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
          console.error(`Insufficient slots for txnId: ${txnId}`);
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
      } else {
        await Event.updateOne(
          { _id: event._id, "participants.orderId": txnId },
          {
            $set: {
              "participants.$.paymentStatus":
                status === "pending" ? "pending" : "failed",
              "participants.$.paymentId": paymentId,
            },
          },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      console.log(`Payment ${status} processed for txnId: ${txnId}`);
      return res.status(200).json({ status: "ok" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error(
      `Webhook processing error for txnId: ${req.body.txnid || "unknown"}`,
      error.message
    );
    res.status(500).json({ error: "Failed to process webhook" });
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

exports.handlePayuSuccess = async (req, res) => {
  try {
    const isValid = verifyPayuPayment(req.body);
    if (!isValid) {
      console.error("Invalid hash in PayU success redirect:", req.body.txnid);
      return res.redirect("/payment/failure");
    }

    if (req.body.status === "success") {
      const eventId = req.body.udf3; // Retrieve eventId from udf3
      return res.redirect(`/event/${eventId}?payment=success`);
    } else {
      return res.redirect("/payment/failure");
    }
  } catch (error) {
    console.error("Error in PayU success redirect:", error.message);
    return res.redirect("/payment/failure");
  }
};

exports.handlePayuFailure = async (req, res) => {
  try {
    console.log("PayU payment failed:", req.body);
    return res.redirect("/payment/failure");
  } catch (error) {
    console.error("Error in PayU failure redirect:", error.message);
    return res.redirect("/payment/failure");
  }
};
