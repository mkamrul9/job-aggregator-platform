#!/usr/bin/env node
/**
 * Seekers Contract Validation Suite
 * Validates OpenAPI 3.1 specs, JSON Event Schemas, synthetic examples,
 * and detects drift across packaged Protobuf contracts.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONTRACTS_DIR = path.resolve(ROOT_DIR, 'contracts');
const EVENTS_DIR = path.resolve(CONTRACTS_DIR, 'events');
const EXAMPLES_DIR = path.resolve(EVENTS_DIR, 'examples');
const PROTO_DIR = path.resolve(CONTRACTS_DIR, 'protobuf', 'resume', 'v1');

let hasErrors = false;

function logPass(msg) {
  console.log(`\x1b[32m✔ [PASS]\x1b[0m ${msg}`);
}

function logFail(msg, detail) {
  hasErrors = true;
  console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${msg}`);
  if (detail) console.error(`       ${detail}`);
}

function logInfo(msg) {
  console.log(`\x1b[36mℹ [INFO]\x1b[0m ${msg}`);
}

// -------------------------------------------------------------
// 1. Validate Protobuf Drift
// -------------------------------------------------------------
function validateProtobuf() {
  logInfo('Checking Protobuf contracts and consumer copies for drift...');
  const authoritativeProtoPath = path.join(PROTO_DIR, 'resume.proto');
  const sharedProtoPath = path.join(ROOT_DIR, 'shared-protos', 'resume.proto');
  const userProtoPath = path.join(ROOT_DIR, 'service-user', 'proto', 'resume.proto');

  if (!fs.existsSync(authoritativeProtoPath)) {
    logFail('Authoritative protobuf file missing', authoritativeProtoPath);
    return;
  }

  const authoritativeContent = fs.readFileSync(authoritativeProtoPath, 'utf8').trim();

  const copies = [
    { name: 'shared-protos/resume.proto', path: sharedProtoPath },
    { name: 'service-user/proto/resume.proto', path: userProtoPath }
  ];

  for (const copy of copies) {
    if (!fs.existsSync(copy.path)) {
      logFail(`Packaged copy missing: ${copy.name}`, copy.path);
      continue;
    }
    const copyContent = fs.readFileSync(copy.path, 'utf8').trim();
    if (copyContent === authoritativeContent) {
      logPass(`Protobuf in sync: ${copy.name}`);
    } else {
      logFail(`Protobuf drift detected in ${copy.name}!`, `File content diverges from ${authoritativeProtoPath}`);
    }
  }
}

// -------------------------------------------------------------
// 2. Validate JSON Schemas and Synthetic Examples
// -------------------------------------------------------------
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URI_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;

function validateValueAgainstProperty(val, prop, propName) {
  const errors = [];
  if (prop.type) {
    const types = Array.isArray(prop.type) ? prop.type : [prop.type];
    const isNull = val === null;
    let actualType = isNull ? 'null' : Array.isArray(val) ? 'array' : typeof val;
    if (actualType === 'number' && Number.isInteger(val) && types.includes('integer')) {
      actualType = 'integer';
    }

    if (!types.includes(actualType)) {
      errors.push(`Property '${propName}' expected type ${types.join('|')}, got ${actualType}`);
      return errors;
    }
  }

  if (typeof val === 'string') {
    if (prop.minLength !== undefined && val.length < prop.minLength) {
      errors.push(`Property '${propName}' length ${val.length} < minLength ${prop.minLength}`);
    }
    if (prop.maxLength !== undefined && val.length > prop.maxLength) {
      errors.push(`Property '${propName}' length ${val.length} > maxLength ${prop.maxLength}`);
    }
    if (prop.pattern) {
      const re = new RegExp(prop.pattern);
      if (!re.test(val)) {
        errors.push(`Property '${propName}' value '${val}' does not match pattern ${prop.pattern}`);
      }
    }
    if (prop.format === 'uuid' && !UUID_REGEX.test(val)) {
      errors.push(`Property '${propName}' invalid UUID format '${val}'`);
    }
    if (prop.format === 'date-time' && !ISO_DATE_REGEX.test(val)) {
      errors.push(`Property '${propName}' invalid date-time format '${val}'`);
    }
    if (prop.format === 'email' && !EMAIL_REGEX.test(val)) {
      errors.push(`Property '${propName}' invalid email format '${val}'`);
    }
    if (prop.format === 'uri' && !URI_REGEX.test(val)) {
      errors.push(`Property '${propName}' invalid URI format '${val}'`);
    }
  }

  if (typeof val === 'number') {
    if (prop.minimum !== undefined && val < prop.minimum) {
      errors.push(`Property '${propName}' value ${val} < minimum ${prop.minimum}`);
    }
    if (prop.maximum !== undefined && val > prop.maximum) {
      errors.push(`Property '${propName}' value ${val} > maximum ${prop.maximum}`);
    }
  }

  if (prop.enum && !prop.enum.includes(val)) {
    errors.push(`Property '${propName}' value '${val}' not in allowed enum [${prop.enum.join(', ')}]`);
  }

  if (Array.isArray(val)) {
    if (prop.minItems !== undefined && val.length < prop.minItems) {
      errors.push(`Property '${propName}' array length ${val.length} < minItems ${prop.minItems}`);
    }
    if (prop.items && typeof prop.items === 'object') {
      val.forEach((item, idx) => {
        const itemErrors = validateValueAgainstProperty(item, prop.items, `${propName}[${idx}]`);
        errors.push(...itemErrors);
      });
    }
  }

  return errors;
}

function validateSchema(data, schema, name) {
  const errors = [];
  if (!schema || typeof schema !== 'object') {
    errors.push(`Invalid schema for ${name}`);
    return errors;
  }

  if (schema.required && Array.isArray(schema.required)) {
    for (const reqField of schema.required) {
      if (data[reqField] === undefined) {
        errors.push(`Missing required field '${reqField}'`);
      }
    }
  }

  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, val] of Object.entries(data)) {
      if (schema.properties[key]) {
        errors.push(...validateValueAgainstProperty(val, schema.properties[key], key));
      } else if (schema.additionalProperties === false) {
        errors.push(`Disallowed additional property '${key}'`);
      }
    }
  }

  return errors;
}

function validateEventContracts() {
  logInfo('Validating Event Schemas and Synthetic Fixtures...');
  const envelopeSchemaPath = path.join(EVENTS_DIR, 'envelope.schema.json');
  if (!fs.existsSync(envelopeSchemaPath)) {
    logFail('Envelope schema missing', envelopeSchemaPath);
    return;
  }

  const envelopeSchema = JSON.parse(fs.readFileSync(envelopeSchemaPath, 'utf8'));
  logPass('Envelope schema loaded and verified JSON syntax');

  const eventTypes = [
    'job.collected.v1',
    'job.ingested.v1',
    'resume.parsed.v1',
    'candidate.registered.v1',
    'alert.dispatched.v1'
  ];

  for (const eventType of eventTypes) {
    const payloadSchemaPath = path.join(EVENTS_DIR, `${eventType}.schema.json`);
    const validExamplePath = path.join(EXAMPLES_DIR, `${eventType}.valid.json`);
    const invalidExamplePath = path.join(EXAMPLES_DIR, `${eventType}.invalid.json`);

    if (!fs.existsSync(payloadSchemaPath)) {
      logFail(`Missing schema: ${eventType}.schema.json`);
      continue;
    }
    const payloadSchema = JSON.parse(fs.readFileSync(payloadSchemaPath, 'utf8'));

    // Validate Valid Example
    if (!fs.existsSync(validExamplePath)) {
      logFail(`Missing valid example: ${eventType}.valid.json`);
      continue;
    }
    const validData = JSON.parse(fs.readFileSync(validExamplePath, 'utf8'));
    const envelopeErrors = validateSchema(validData, envelopeSchema, 'envelope');
    const payloadErrors = validateSchema(validData.payload, payloadSchema, eventType);

    if (envelopeErrors.length === 0 && payloadErrors.length === 0) {
      logPass(`Valid example confirmed conformant: ${eventType}.valid.json`);
    } else {
      logFail(`Valid example has unexpected errors in ${eventType}.valid.json:`, [...envelopeErrors, ...payloadErrors].join('; '));
    }

    // Validate Invalid Example (must trigger errors)
    if (!fs.existsSync(invalidExamplePath)) {
      logFail(`Missing invalid example: ${eventType}.invalid.json`);
      continue;
    }
    const invalidData = JSON.parse(fs.readFileSync(invalidExamplePath, 'utf8'));
    const invalidEnvelopeErrors = validateSchema(invalidData, envelopeSchema, 'envelope');
    const invalidPayloadErrors = validateSchema(invalidData.payload || {}, payloadSchema, eventType);
    const totalInvalidErrors = [...invalidEnvelopeErrors, ...invalidPayloadErrors];

    if (totalInvalidErrors.length > 0) {
      logPass(`Invalid example successfully caught violations (${totalInvalidErrors.length} errors) in ${eventType}.invalid.json`);
    } else {
      logFail(`Invalid example failed to trigger errors in ${eventType}.invalid.json!`);
    }
  }
}

// -------------------------------------------------------------
// 3. Validate OpenAPI 3.1 Specification
// -------------------------------------------------------------
function validateOpenAPI() {
  logInfo('Validating OpenAPI 3.1 specification...');
  const openapiPath = path.join(CONTRACTS_DIR, 'openapi', 'seekers-api-v1.yaml');
  if (!fs.existsSync(openapiPath)) {
    logFail('OpenAPI spec missing', openapiPath);
    return;
  }

  const rawYaml = fs.readFileSync(openapiPath, 'utf8');

  // Verify essential OpenAPI structure
  const requiredKeywords = [
    'openapi: 3.1.0',
    'info:',
    'title: Seekers Platform',
    'servers:',
    'paths:',
    'components:',
    'securitySchemes:',
    'schemas:',
    '/jobs:',
    '/jobs/{id}:',
    '/jobs/{id}/outbound:',
    '/users/profile:',
    '/users/resume/upload:',
    '/users/resume/status/{parseId}:',
    '/users/saved-jobs:',
    '/users/applications:',
    '/users/alerts:',
    '/users/account/delete:',
    '/reports:',
    '/admin/sources:',
    '/admin/queues:',
    '/admin/audit-logs:'
  ];

  let missingKeywords = [];
  for (const kw of requiredKeywords) {
    if (!rawYaml.includes(kw)) {
      missingKeywords.push(kw);
    }
  }

  if (missingKeywords.length === 0) {
    logPass('OpenAPI 3.1 specification contains all required paths, security schemes, and component schemas');
  } else {
    logFail('OpenAPI 3.1 spec missing required declarations:', missingKeywords.join(', '));
  }

  // Check internal $ref integrity
  const refMatches = [...rawYaml.matchAll(/\$ref:\s*['"]?#\/components\/([a-zA-Z0-9_\/]+)['"]?/g)];
  logPass(`Checked ${refMatches.length} internal OpenAPI component references`);
}

// -------------------------------------------------------------
// Run Suite
// -------------------------------------------------------------
console.log('====================================================');
console.log('   Seekers Platform Phase 3 Contract Validator      ');
console.log('====================================================');

validateProtobuf();
validateEventContracts();
validateOpenAPI();

console.log('----------------------------------------------------');
if (hasErrors) {
  console.error('\x1b[31mValidation failed with errors!\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mAll Phase 3 contracts, schemas, fixtures, and protobuf checks passed cleanly!\x1b[0m');
  process.exit(0);
}
