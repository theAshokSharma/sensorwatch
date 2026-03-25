/**
 * api/config.js
 *
 * Vercel serverless function — runs on the server, never in the browser.
 * Reads environment variables set in the Vercel dashboard and returns
 * them as JSON to the frontend. Credentials never touch the source code.
 *
 * Endpoint: GET /api/config
 */

export default function handler(req, res) {

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Read from Vercel environment variables and build config object.
  // Numeric values are converted from string to number.
  const config = {
    MQTT_URL:      process.env.MQTT_URL      || "",
    MQTT_USERNAME: process.env.MQTT_USERNAME || "",
    MQTT_PASSWORD: process.env.MQTT_PASSWORD || "",
    TOPIC_LEAK:    process.env.TOPIC_LEAK    || "LEAK",
    TOPIC_PRESSURE:process.env.TOPIC_PRESSURE|| "PRESSURE",
    TOPIC_TEMP:    process.env.TOPIC_TEMP    || "TEMP",
    PRESSURE_MIN:  Number(process.env.PRESSURE_MIN ?? 0),
    PRESSURE_MAX:  Number(process.env.PRESSURE_MAX ?? 200),
    TEMP_MIN:      Number(process.env.TEMP_MIN      ?? -20),
    TEMP_MAX:      Number(process.env.TEMP_MAX      ?? 100),
  };

  // Validate that the critical fields are present
  if (!config.MQTT_URL || !config.MQTT_USERNAME || !config.MQTT_PASSWORD) {
    return res.status(500).json({
      error: "Missing required environment variables on server. " +
             "Check MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD in Vercel settings."
    });
  }

  // Cache for 30 seconds on the CDN edge — long enough to reduce hits,
  // short enough that a credential update takes effect quickly.
  res.setHeader("Cache-Control", "public, max-age=30");

  return res.status(200).json(config);
}