// netlify/functions/acquisition/test-florida-dataset-acquisition.js
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  FloridaDatasetAcquisitionService
} = require("./FloridaDatasetAcquisitionService.js");

const TEST_DIR = path.join(__dirname, "test-tmp");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${serverPort}`);

      if (url.pathname === "/valid") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end("valid payload data");
      } else if (url.pathname === "/abs-redirect") {
        res.writeHead(302, { Location: `http://localhost:${serverPort}/valid` });
        res.end();
      } else if (url.pathname === "/rel-redirect") {
        res.writeHead(302, { Location: "/valid" });
        res.end();
      } else if (url.pathname === "/redirect-1") {
        res.writeHead(302, { Location: "/redirect-2" });
        res.end();
      } else if (url.pathname === "/redirect-2") {
        res.writeHead(302, { Location: "/valid" });
        res.end();
      } else if (url.pathname === "/redirect-3") {
        res.writeHead(302, { Location: "/redirect-1" });
        res.end();
      } else if (url.pathname === "/redirect-loop") {
        res.writeHead(302, { Location: "/redirect-loop" });
        res.end();
      } else if (url.pathname === "/500-error") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server Error");
      } else if (url.pathname === "/timeout") {
        // Intentionally keep open
      } else if (url.pathname === "/html-header") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Header HTML</body></html>");
      } else if (url.pathname === "/html-sniff") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end("<!DOCTYPE html><html><body>Sniffed HTML</body></html>");
      } else if (url.pathname === "/zero-byte") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end("");
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

async function runTests() {
  cleanDir(TEST_DIR);
  await startServer();

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const service = new FloridaDatasetAcquisitionService({
    storageDirectory: TEST_DIR,
    timeoutMs: 300,
    maxRedirects: 2
  });

  try {
    // 1. Rejection of invalid acquisitionType even with customSourceUrl supplied
    let invalidTypeRejected = false;
    try {
      await service.acquireDataset({
        acquisitionType: "invalid_type_name",
        customSourceUrl: `${baseUrl}/valid`,
        outputFileName: "should_fail.txt"
      });
    } catch (err) {
      invalidTypeRejected = true;
      assert(
        err.message.includes('Unsupported acquisitionType "invalid_type_name"'),
        `Unexpected error message: ${err.message}`
      );
    }
    assert(invalidTypeRejected, "Invalid acquisitionType must be rejected");

    // 2. Local-file streaming acquisition test
    const localSamplePath = path.join(TEST_DIR, "local_sample.txt");
    const localContent = "STREAMING_LOCAL_FILE_SAMPLE_DATA_1234567890";
    fs.writeFileSync(localSamplePath, localContent);

    const expectedLocalSha = crypto.createHash("sha256").update(localContent).digest("hex");
    const localResult = await service.acquireDataset({
      acquisitionType: "daily_delta",
      customSourceUrl: localSamplePath,
      outputFileName: "local_copied.txt"
    });

    assert(localResult.status === "acquired", "Local status must be acquired");
    assert(
      localResult.fileSizeBytes === Buffer.byteLength(localContent),
      "Local byte count must match"
    );
    assert(
      localResult.sourceFileSha256 === expectedLocalSha,
      "Local SHA-256 must match source file hash"
    );
    assert(fs.existsSync(localResult.localFilePath), "Copied local file must exist");

    // 3. Success, SHA-256, and byte count via HTTP
    const payload = "valid payload data";
    const expectedSha256 = crypto.createHash("sha256").update(payload).digest("hex");
    const resSuccess = await service.acquireDataset({
      acquisitionType: "daily_delta",
      customSourceUrl: `${baseUrl}/valid`,
      outputFileName: "out_valid.txt"
    });
    assert(resSuccess.status === "acquired", "Status should be acquired");
    assert(resSuccess.fileSizeBytes === Buffer.byteLength(payload), "Byte size matches payload");
    assert(
      resSuccess.sourceFileSha256 === expectedSha256,
      "sourceFileSha256 matches expected SHA-256"
    );
    assert(fs.existsSync(resSuccess.localFilePath), "File exists on disk");

    // 4. Absolute redirect
    const resAbs = await service.acquireDataset({
      acquisitionType: "daily_delta",
      customSourceUrl: `${baseUrl}/abs-redirect`,
      outputFileName: "out_abs.txt"
    });
    assert(resAbs.fileSizeBytes === Buffer.byteLength(payload), "Absolute redirect succeeds");

    // 5. Relative redirect
    const resRel = await service.acquireDataset({
      acquisitionType: "daily_delta",
      customSourceUrl: `${baseUrl}/rel-redirect`,
      outputFileName: "out_rel.txt"
    });
    assert(resRel.fileSizeBytes === Buffer.byteLength(payload), "Relative redirect succeeds");

    // 6. Finite redirect chain tests (maxRedirects = 2)
    // 2 redirects (/redirect-1 -> /redirect-2 -> /valid) must succeed
    const res2Redirects = await service.acquireDataset({
      acquisitionType: "daily_delta",
      customSourceUrl: `${baseUrl}/redirect-1`,
      outputFileName: "out_2_redirects.txt"
    });
    assert(
      res2Redirects.fileSizeBytes === Buffer.byteLength(payload),
      "2 redirects should succeed with maxRedirects: 2"
    );

    // Helper for failure cleanup verification
    const assertCleanup = async (url, targetFile, expectedErrorSnippet) => {
      const targetPath = path.join(TEST_DIR, targetFile);
      let failed = false;
      try {
        await service.acquireDataset({
          acquisitionType: "daily_delta",
          customSourceUrl: url,
          outputFileName: targetFile
        });
      } catch (err) {
        failed = true;
        assert(
          err.message.toLowerCase().includes(expectedErrorSnippet.toLowerCase()),
          `Expected err containing '${expectedErrorSnippet}', got '${err.message}'`
        );
      }
      assert(failed, `Request to ${url} should have thrown an error`);
      assert(!fs.existsSync(targetPath), `File ${targetFile} should be cleaned up on failure`);
    };

    // 3 redirects (/redirect-3 -> /redirect-1 -> /redirect-2 -> /valid) must fail
    await assertCleanup(
      `${baseUrl}/redirect-3`,
      "out_3_redirects.txt",
      "exceeded maximum redirect limit of 2"
    );

    // 7. Redirect loop
    await assertCleanup(`${baseUrl}/redirect-loop`, "out_loop.txt", "exceeded maximum redirect limit of 2");

    // 8. HTTP Error
    await assertCleanup(`${baseUrl}/500-error`, "out_500.txt", "status code 500");

    // 9. Timeout
    await assertCleanup(`${baseUrl}/timeout`, "out_timeout.txt", "timed out");

    // 10. HTML Rejection (Header)
    await assertCleanup(`${baseUrl}/html-header`, "out_html_header.txt", "text/html");

    // 11. HTML Rejection (Sniffing)
    await assertCleanup(`${baseUrl}/html-sniff`, "out_html_sniff.txt", "html content detected");

    // 12. Zero-byte rejection
    await assertCleanup(`${baseUrl}/zero-byte`, "out_zero.txt", "zero-byte file payload");

    console.log("PASS: All FloridaDatasetAcquisitionService integration tests passed successfully.");
  } finally {
    if (server) {
      server.close();
    }
    cleanDir(TEST_DIR);
  }
}

runTests().catch((err) => {
  console.error("FAIL: Test Suite Failure:", err);
  process.exit(1);
});
