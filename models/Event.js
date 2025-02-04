const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  paymentStatus: {
    type: String,
    enum: ["pending", "success"],
    default: "pending",
  },
});

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  slot: {
    type: String,
    required: true,
  },
  participantsLimit: {
    type: Number,
    required: true,
  },
  participants: [participantSchema],
  price: {
    type: Number,
    required: true,
  },
  sportsName: {
    type: String,
    required: true,
    lowercase: true, // This will automatically convert to lowercase
  },
  venueName: {
    type: String,
    required: true,
  },
  venueImage: {
    type: String,
  },
  location: {
    type: String,
    required: true,
  },
});

// Add an index on sportsName for better query performance
eventSchema.index({ sportsName: 1 });

module.exports = mongoose.model("Event", eventSchema);
