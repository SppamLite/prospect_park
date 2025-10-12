#!/usr/bin/env bun

// Test script to verify information_schema.tables query

const queries = [
  "SHOW TABLES",
  "SELECT * FROM information_schema.tables",
  "SELECT table_schema, table_name FROM information_schema.tables",
  "SELECT * FROM information_schema.tables WHERE table_schema = 'public'",
];

async function testQuery(query: string) {
  console.log(`\n\n=== Testing: ${query} ===`);

  try {
    // Connect using Bun's native TCP
    const socket = await Bun.connect({
      hostname: "localhost",
      port: 7889,
      socket: {
        data(socket, data) {
          console.log("Received data:", new TextDecoder().decode(data));
        },
        open(socket) {
          console.log("Connected");
        },
        close(socket) {
          console.log("Connection closed");
        },
        error(socket, error) {
          console.error("Socket error:", error);
        },
      },
    });

    console.log("Query sent");
  } catch (error) {
    console.error("Error:", error);
  }
}

for (const query of queries) {
  await testQuery(query);
  await Bun.sleep(100);
}
