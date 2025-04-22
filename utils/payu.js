const crypto = require("crypto");

// PayU configuration
const payuConfig = {
  merchantKey: process.env.PAYU_MERCHANT_KEY,
  merchantSalt: process.env.PAYU_MERCHANT_SALT,
  baseUrl: process.env.PAYU_BASE_URL || "https://secure.payu.in",
  successUrl:
    process.env.PAYU_SUCCESS_URL || "http://localhost:3000/api/payu/success",
  failureUrl:
    process.env.PAYU_FAILURE_URL || "http://localhost:3000/api/payu/failure",
};

exports.createPayuPaymentRequest = async (
  amount,
  eventDetails,
  userDetails
) => {
  const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const productInfo = JSON.stringify({
    eventId: eventDetails.eventId,
    eventName: eventDetails.name,
    eventDate: eventDetails.date,
    eventTime: eventDetails.slot,
    quantity: userDetails.quantity,
    eventVenue: eventDetails.venueName,
  });

  const paymentData = {
    key: payuConfig.merchantKey,
    txnid: txnId,
    amount: amount.toFixed(2),
    productinfo: productInfo,
    firstname: userDetails.name,
    email: userDetails.email || "customer@example.com",
    phone: userDetails.phone,
    surl: payuConfig.successUrl,
    furl: payuConfig.failureUrl,
    udf1: userDetails.skillLevel,
    udf2: userDetails.quantity.toString(),
    udf3: eventDetails.eventId.toString(), // Add eventId for redirect handling
  };

  const hashString = `${payuConfig.merchantKey}|${paymentData.txnid}|${paymentData.amount}|${paymentData.productinfo}|${paymentData.firstname}|${paymentData.email}|${paymentData.udf1}|${paymentData.udf2}|${paymentData.udf3}||||||${payuConfig.merchantSalt}`;
  const hash = crypto.createHash("sha512").update(hashString).digest("hex");
  paymentData.hash = hash;

  return {
    paymentData,
    txnId,
    payuUrl: `${payuConfig.baseUrl}/_payment`,
  };
};

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
    udf3,
    hash,
  } = payuResponse;

  if (
    !status ||
    !txnid ||
    !amount ||
    !productinfo ||
    !firstname ||
    !email ||
    !hash
  ) {
    throw new Error("Missing required fields for hash verification");
  }

  const hashString = `${payuConfig.merchantSalt}|${status}|||||${udf3 || ""}|${
    udf2 || ""
  }|${udf1 || ""}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${
    payuConfig.merchantKey
  }`;
  const calculatedHash = crypto
    .createHash("sha512")
    .update(hashString)
    .digest("hex");

  if (calculatedHash !== hash) {
    console.error("Hash verification failed for PayU response");
    return false;
  }
  return true;
};

exports.processPayuWebhook = (webhookData) => {
  const requiredFields = ["status", "txnid", "mihpayid", "amount", "hash"];
  for (const field of requiredFields) {
    if (!webhookData[field]) {
      throw new Error(`Missing required webhook field: ${field}`);
    }
  }

  const isValid = exports.verifyPayuPayment(webhookData);
  if (!isValid) {
    throw new Error("Invalid PayU webhook signature");
  }

  return {
    status: webhookData.status.toLowerCase(),
    txnId: webhookData.txnid,
    paymentId: webhookData.mihpayid,
    amount: parseFloat(webhookData.amount),
    paymentDetails: webhookData,
  };
};
