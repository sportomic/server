const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createRazorpayOrder = async (amount, eventDetails, userDetails) => {
  const orderOptions = {
    amount: amount * 100, // Convert to paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    notes: {
      event_name: eventDetails.name,
      event_date: eventDetails.date,
      event_time: eventDetails.slot,
      event_venue: eventDetails.venueName,
      customer_name: userDetails.name,
      customer_phone: userDetails.phone,
      customer_skill: userDetails.skillLevel,
    },
  };

  return await razorpay.orders.create(orderOptions);
};

exports.verifyRazorpayPayment = (
  razorpayOrderId,
  paymentId,
  razorpaySignature
) => {
  const body = `${razorpayOrderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return expectedSignature === razorpaySignature;
};
