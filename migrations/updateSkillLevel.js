const mongoose = require("mongoose");
const Event = require("../models/Event");
const connectDB = require("../config/db"); // Import your connectDB function
require("dotenv").config(); // Make sure to import your env configuration

async function updateExistingParticipants() {
  try {
    // Connect to MongoDB using your connectDB function
    await connectDB();

    const events = await Event.find({
      "participants.skillLevel": { $exists: false },
    });

    console.log(`Found ${events.length} events to update`);

    for (const event of events) {
      event.participants.forEach((participant) => {
        if (!participant.skillLevel) {
          participant.skillLevel = "beginner"; // Set default skill level
        }
      });
      await event.save({ validateBeforeSave: false });
    }

    console.log("Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
updateExistingParticipants();
