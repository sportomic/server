const crypto = require("crypto");
const axios = require("axios");

// PayU configuration
const payuConfig = {
  merchantKey: process.env.PAYU_MERCHANT_KEY,
  merchantSalt: process.env.PAYU_MERCHANT_SALT,
  baseUrl: process.env.PAYU_BASE_URL || "https://secure.payu.in",
  successUrl:
    process.env.PAYU_SUCCESS_URL || "https://yourwebsite.com/payment/success",
  failureUrl:
    process.env.PAYU_FAILURE_URL || "https://yourwebsite.com/payment/failure",
};

/**
 * Create a PayU payment request
 * @param {number} amount - Amount in INR
 * @param {object} eventDetails - Event details
 * @param {object} userDetails - User details
 * @returns {object} - PayU payment request data
 */
exports.createPayuPaymentRequest = async (
  amount,
  eventDetails,
  userDetails
) => {
  const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Create product info string with event details
  const productInfo = JSON.stringify({
    eventId: eventDetails.eventId,
    eventName: eventDetails.name,
    eventDate: eventDetails.date,
    eventTime: eventDetails.slot,
    quantity: userDetails.quantity,
    eventVenue: eventDetails.venueName,
  });

  // Prepare payment data
  const paymentData = {
    key: payuConfig.merchantKey,
    txnid: txnId,
    amount: amount.toString(),
    productinfo: productInfo,
    firstname: userDetails.name,
    email: userDetails.email || "customer@example.com", // You might need to add email to your form
    phone: userDetails.phone,
    surl: payuConfig.successUrl,
    furl: payuConfig.failureUrl,
    udf1: userDetails.skillLevel,
    udf2: userDetails.quantity.toString(),
  };

  // Generate hash
  const hashString = `${payuConfig.merchantKey}|${paymentData.txnid}|${paymentData.amount}|${paymentData.productinfo}|${paymentData.firstname}|${paymentData.email}|${paymentData.udf1}|${paymentData.udf2}|||||||${payuConfig.merchantSalt}`;

  const hash = crypto.createHash("sha512").update(hashString).digest("hex");
  paymentData.hash = hash;

  return {
    paymentData,
    txnId,
    payuUrl: `${payuConfig.baseUrl}/_payment`,
  };
};

/**
 * Verify PayU payment response
 * @param {object} payuResponse - Response from PayU
 * @returns {boolean} - Whether the payment is valid
 */
exports.verifyPayuPayment = (payuResponse) => {
  const {
    status,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    mihpayid,
    hash,
  } = payuResponse;

  // Verify hash
  const calculatedHash = crypto
    .createHash("sha512")
    .update(
      `${payuConfig.merchantSalt}|${status}|||||${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${payuConfig.merchantKey}`
    )
    .digest("hex");

  return calculatedHash === hash;
};

/**
 * Process PayU webhook data
 * @param {object} webhookData - Data from PayU webhook
 * @returns {object} - Processed payment data
 */
exports.processPayuWebhook = (webhookData) => {
  // Verify webhook signature if PayU provides one
  // This depends on PayU's webhook implementation

  const isValid = this.verifyPayuPayment(webhookData);

  if (!isValid) {
    throw new Error("Invalid PayU webhook signature");
  }

  return {
    status: webhookData.status === "success" ? "success" : "failed",
    txnId: webhookData.txnid,
    paymentId: webhookData.mihpayid,
    amount: parseFloat(webhookData.amount),
    paymentDetails: webhookData,
  };
};
