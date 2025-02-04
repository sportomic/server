const Event = require("../models/Event");
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../utils/razorpay");

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
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res
      .status(400)
      .json({ error: "Name and phone number are required" });
  }

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const order = await createRazorpayOrder(event.price);
    res.status(200).json({
      message: "Booking initiated",
      orderId: order.id,
      amount: order.amount,
      eventName: event.name,
    });
  } catch (error) {
    console.error("Booking Initiation Error:", error);
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to initiate booking", details: error.message });
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
  } = req.body;

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isValid = verifyRazorpayPayment(
      razorpayOrderId,
      paymentId,
      razorpaySignature
    );

    if (isValid) {
      // Push participant and increment the counter atomically
      event.participants.push({
        name: participantName,
        phone: participantPhone,
        paymentStatus: "success",
      });

      // Update currentParticipants
      event.currentParticipants += 1;

      await event.save();

      return res.status(200).json({ message: "Payment confirmed" });
    } else {
      return res.status(400).json({ error: "Payment verification failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
};
