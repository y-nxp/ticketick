import "server-only";

import * as z from "zod";
import { OPERATIONS, pathParams } from "./operations";

/** Spécification OpenAPI 3.1 tirée du registre des opérations. */

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
};

export function buildOpenApi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const schema = jsonSchemaOf(op.input);
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = new Set((schema.required ?? []) as string[]);
    const inPath = pathParams(op.path);

    const parameters: Record<string, unknown>[] = inPath.map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
      description: props[name]?.description,
    }));
    let requestBody: Record<string, unknown> | undefined;
    const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !inPath.includes(k)));

    if (op.method === "GET") {
      for (const [name, s] of Object.entries(rest)) {
        parameters.push({ name, in: "query", required: required.has(name), schema: s, description: s.description });
      }
    } else if (Object.keys(rest).length > 0) {
      requestBody = {
        required: [...required].some((k) => !inPath.includes(k)),
        content: {
          "application/json": {
            schema: {
              ...schema,
              properties: rest,
              required: [...required].filter((k) => !inPath.includes(k)),
            },
          },
        },
      };
    }
    if (op.creates) {
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: false,
        schema: { type: "string", maxLength: 100 },
        description: "Same key, same result: a retried creation is not duplicated.",
      });
    }

    paths[op.path] ??= {};
    paths[op.path][op.method.toLowerCase()] = {
      operationId: op.name,
      summary: op.title,
      description: op.description,
      tags: [op.tag],
      ...(op.auth === "public" ? { security: [] } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [op.creates ? "201" : "200"]: {
          description: "OK",
          content: { "application/json": { schema: { type: "object" } } },
        },
        default: {
          description: "Error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      "x-mcp-tool": op.name,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "ticketick API",
      version: "1.0.0",
      summary: "Create and publish events, sessions and ticket types on ticketick.ch; search the public catalogue.",
      description:
        "Swiss ticketing platform API for organizers and their AI agents. Write operations act for the organizer of the API key (Bearer tt_…), created in the ticketick admin under « API & agents IA ». Events are created as drafts; publishing needs a key with the publish permission. Times without offset are Swiss local time (Europe/Zurich); prices are in CHF. The same operations are available as an MCP server at " +
        `${origin}/api/mcp. Docs: ${origin}/developers`,
      contact: { name: "ticketick", url: `${origin}/contact` },
      termsOfService: `${origin}/terms`,
    },
    servers: [{ url: `${origin}/api/v1` }],
    externalDocs: { url: `${origin}/developers` },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Organizer" },
      { name: "Events" },
      { name: "Sessions" },
      { name: "Ticket types" },
      { name: "Reference" },
      { name: "Public catalogue", description: "No API key needed." },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Organizer API key, tt_…" },
      },
      schemas: { Error: errorSchema },
    },
  };
}
