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

// Log PayU configuration (including salt for debugging)
console.log("PayU Configuration:", {
  merchantKey: payuConfig.merchantKey,
  merchantSalt: payuConfig.merchantSalt,
  baseUrl: payuConfig.baseUrl,
  successUrl: payuConfig.successUrl,
  failureUrl: payuConfig.failureUrl,
});

exports.createPayuPaymentRequest = async (amount, eventDetails, userDetails) => {
  console.log("Creating PayU payment request with inputs:", {
    amount,
    eventDetails,
    userDetails,
  });

  const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  console.log("Generated transaction ID:", txnId);

  // Log eventDetails.eventId to debug
  console.log("eventDetails.eventId:", eventDetails.eventId);

  // Simplify productinfo to a short string
  const productInfo = `${eventDetails.name} (${eventDetails.slot})`;
  console.log("Product info:", productInfo);

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
    udf1: userDetails.skillLevel || "",
    udf2: userDetails.quantity.toString() || "",
    udf3: eventDetails.eventId ? eventDetails.eventId.toString() : "",
    udf4: "",
    udf5: "",
  };

  // Sanitize fields to remove pipe characters and trim whitespace
  Object.keys(paymentData).forEach(key => {
    if (typeof paymentData[key] === 'string') {
      paymentData[key] = paymentData[key].replace(/\|/g, '').trim();
    }
  });

  // Generate hash string exactly matching PayU's format
  const hashString = `${payuConfig.merchantKey}|${paymentData.txnid}|${paymentData.amount}|${paymentData.productinfo}|${paymentData.firstname}|${paymentData.email}|${paymentData.udf1}|${paymentData.udf2}|${paymentData.udf3}|${paymentData.udf4}|${paymentData.udf5}||||||${payuConfig.merchantSalt}`;

  // Calculate hash using SHA512
  const hash = crypto.createHash("sha512").update(hashString).digest("hex");
  paymentData.hash = hash;

  const response = {
    paymentData,
    txnId,
    payuUrl: `${payuConfig.baseUrl}/_payment`,
  };
  console.log("Payment request response:", response);

  return response;
};

exports.verifyPayuPayment = (payuResponse) => {
  console.log("Verifying PayU payment response:", payuResponse);

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
    udf4,
    udf5,
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
    console.error("Missing required fields for hash verification:", {
      status,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      hash,
    });
    throw new Error("Missing required fields for hash verification");
  }

  const hashString = `${payuConfig.merchantSalt}|${status}|||||${udf5 || ""}|${
    udf4 || ""
  }|${udf3 || ""}|${udf2 || ""}|${
    udf1 || ""
  }|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${
    payuConfig.merchantKey
  }`;
  console.log("Hash string components for verification:", {
    salt: payuConfig.merchantSalt,
    status,
    udf5: udf5 || "",
    udf4: udf4 || "",
    udf3: udf3 || "",
    udf2: udf2 || "",
    udf1: udf1 || "",
    email,
    firstname,
    productinfo,
    amount,
    txnid,
    key: payuConfig.merchantKey,
  });
  console.log("Hash string for verification:", hashString);

  const calculatedHash = crypto
    .createHash("sha512")
    .update(hashString)
    .digest("hex");
  console.log("Calculated hash for verification:", calculatedHash);
  console.log("Received hash from PayU:", hash);

  if (calculatedHash !== hash) {
    console.error(
      "Hash verification failed: Calculated hash does not match received hash"
    );
    return false;
  }

  console.log("Hash verification successful");
  return true;
};

exports.processPayuWebhook = (webhookData) => {
  console.log("Processing PayU webhook data:", webhookData);

  const requiredFields = ["status", "txnid", "mihpayid", "amount", "hash"];
  for (const field of requiredFields) {
    if (!webhookData[field]) {
      console.error(`Missing required webhook field: ${field}`, webhookData);
      throw new Error(`Missing required webhook field: ${field}`);
    }
  }

  const isValid = exports.verifyPayuPayment(webhookData);
  if (!isValid) {
    console.error("Invalid PayU webhook signature");
    throw new Error("Invalid PayU webhook signature");
  }

  const processedData = {
    status: webhookData.status.toLowerCase(),
    txnId: webhookData.txnid,
    paymentId: webhookData.mihpayid,
    amount: parseFloat(webhookData.amount),
    paymentDetails: webhookData,
  };
  console.log("Webhook processed successfully:", processedData);

  return processedData;
};
