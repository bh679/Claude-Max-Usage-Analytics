const express = require('express');
const otelAuth = require('../middleware/otelAuth');
const { insertOtelMetricsBatch, insertOtelEventsBatch } = require('../db');

const router = express.Router();

router.use(otelAuth);

/**
 * Convert OTLP KeyValue[] array to a flat object.
 * OTLP attributes: [{ "key": "type", "value": { "stringValue": "input" } }]
 */
function flattenAttributes(attrs) {
  if (!Array.isArray(attrs)) return {};
  const obj = {};
  for (const attr of attrs) {
    const val = attr.value;
    if (val.stringValue !== undefined) obj[attr.key] = val.stringValue;
    else if (val.intValue !== undefined) obj[attr.key] = parseInt(val.intValue, 10);
    else if (val.doubleValue !== undefined) obj[attr.key] = val.doubleValue;
    else if (val.boolValue !== undefined) obj[attr.key] = val.boolValue;
  }
  return obj;
}

function extractSessionId(resourceAttrs) {
  const flat = flattenAttributes(resourceAttrs);
  return flat['session.id'] || null;
}

function extractValue(dataPoint) {
  if (dataPoint.asInt !== undefined) return parseInt(dataPoint.asInt, 10);
  if (dataPoint.asDouble !== undefined) return dataPoint.asDouble;
  if (dataPoint.value !== undefined) return parseFloat(dataPoint.value);
  return 0;
}

// POST /v1/metrics — OTLP HTTP/JSON metrics receiver
router.post('/metrics', (req, res) => {
  const body = req.body;

  if (!body || !body.resourceMetrics) {
    return res.status(400).json({ error: 'Invalid OTLP metrics payload' });
  }

  const rows = [];

  for (const rm of body.resourceMetrics) {
    const resourceAttrs = rm.resource?.attributes || [];
    const sessionId = extractSessionId(resourceAttrs);
    const resourceJson = JSON.stringify(flattenAttributes(resourceAttrs));

    for (const sm of (rm.scopeMetrics || [])) {
      for (const metric of (sm.metrics || [])) {
        const dataPoints = metric.sum?.dataPoints
          || metric.gauge?.dataPoints
          || metric.histogram?.dataPoints
          || [];

        for (const dp of dataPoints) {
          const dpAttrs = flattenAttributes(dp.attributes || []);
          rows.push({
            metric_name: metric.name,
            value: extractValue(dp),
            unit: metric.unit || null,
            attributes: JSON.stringify(dpAttrs),
            session_id: dpAttrs['session.id'] || sessionId,
            resource: resourceJson,
            time_unix_nano: dp.timeUnixNano || null,
          });
        }
      }
    }
  }

  if (rows.length > 0) {
    try {
      insertOtelMetricsBatch(rows);
    } catch (err) {
      console.error('Failed to store OTLP metrics:', err.message);
      return res.status(500).json({ error: 'Failed to store metrics' });
    }
  }

  res.json({});
});

// POST /v1/logs — OTLP HTTP/JSON logs receiver
router.post('/logs', (req, res) => {
  const body = req.body;

  if (!body || !body.resourceLogs) {
    return res.status(400).json({ error: 'Invalid OTLP logs payload' });
  }

  const rows = [];

  for (const rl of body.resourceLogs) {
    const resourceAttrs = rl.resource?.attributes || [];
    const sessionId = extractSessionId(resourceAttrs);
    const resourceJson = JSON.stringify(flattenAttributes(resourceAttrs));

    for (const sl of (rl.scopeLogs || [])) {
      for (const logRecord of (sl.logRecords || [])) {
        const logAttrs = flattenAttributes(logRecord.attributes || []);
        const eventName = logAttrs['event.name'] || 'unknown';
        const promptId = logAttrs['prompt.id'] || null;
        const bodyStr = logRecord.body?.stringValue || JSON.stringify(logRecord.body) || null;

        rows.push({
          event_name: eventName,
          body: bodyStr,
          attributes: JSON.stringify(logAttrs),
          session_id: logAttrs['session.id'] || sessionId,
          prompt_id: promptId,
          resource: resourceJson,
          time_unix_nano: logRecord.timeUnixNano || null,
        });
      }
    }
  }

  if (rows.length > 0) {
    try {
      insertOtelEventsBatch(rows);
    } catch (err) {
      console.error('Failed to store OTLP logs:', err.message);
      return res.status(500).json({ error: 'Failed to store logs' });
    }
  }

  res.json({});
});

module.exports = router;
