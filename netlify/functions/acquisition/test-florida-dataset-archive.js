const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const {
  FloridaDatasetArchiveService
} = require("./FloridaDatasetArchiveService.js");

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function createZipWithPython(zipPath, entries) {
  const script = `
import sys
import zipfile

zip_path = sys.argv[1]
entries = sys.argv[2:]

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for item in entries:
        name, source = item.split("::", 1)
        zf.write(source, arcname=name)
`;

  const args = [
    "-c",
    script,
    zipPath,
    ...entries.map(
      ({ archiveName, sourcePath }) =>
        `${archiveName}::${sourcePath}`
    )
  ];

  execFileSync("/usr/bin/python3", args);
}

async function expectReject(
  fn,
  messageFragment
) {
  let rejected = false;

  try {
    await fn();
  } catch (err) {
    rejected = true;

    if (messageFragment) {
      assert(
        String(err.message).includes(
          messageFragment
        ),
        `Expected error containing "${messageFragment}", got: ${err.message}`
      );
    }
  }

  assert(
    rejected,
    "Expected operation to reject."
  );
}

async function run() {
  const tempRoot = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "florida_archive_test_"
    )
  );

  try {
    const service =
      new FloridaDatasetArchiveService();

    console.log(
      "TEST 1: valid ZIP extraction"
    );

    const sourceDataPath =
      path.join(
        tempRoot,
        "source.txt"
      );

    const expectedData =
      Buffer.from(
        "A".repeat(1440) +
        "\n" +
        "B".repeat(1440) +
        "\n",
        "ascii"
      );

    fs.writeFileSync(
      sourceDataPath,
      expectedData
    );

    const validZipPath =
      path.join(
        tempRoot,
        "valid.zip"
      );

    createZipWithPython(
      validZipPath,
      [
        {
          archiveName:
            "CORPDATA.TXT",
          sourcePath:
            sourceDataPath
        }
      ]
    );

    const validOutputDir =
      path.join(
        tempRoot,
        "valid_output"
      );

    const result =
      await service.extractArchive(
        validZipPath,
        validOutputDir
      );

    assert.strictEqual(
      result.status,
      "extracted"
    );

    assert.strictEqual(
      result.archiveFilePath,
      validZipPath
    );

    assert.strictEqual(
      result.extractedFileName,
      "CORPDATA.TXT"
    );

    assert(
      fs.existsSync(
        result.extractedFilePath
      )
    );

    assert.deepStrictEqual(
      fs.readFileSync(
        result.extractedFilePath
      ),
      expectedData
    );

    assert.strictEqual(
      result.archiveFileSha256,
      sha256File(validZipPath)
    );

    assert.strictEqual(
      result.extractedFileSha256,
      sha256File(
        result.extractedFilePath
      )
    );

    assert.strictEqual(
      result.archiveFileSha256.length,
      64
    );

    assert.strictEqual(
      result.extractedFileSha256.length,
      64
    );

    assert.strictEqual(
      result.extractedFileSizeBytes,
      expectedData.length
    );

    console.log(
      "PASS: valid ZIP extraction"
    );

    console.log(
      "TEST 2: missing archive"
    );

    await expectReject(
      () =>
        service.extractArchive(
          path.join(
            tempRoot,
            "missing.zip"
          ),
          path.join(
            tempRoot,
            "missing_output"
          )
        ),
      "does not exist"
    );

    console.log(
      "PASS: missing archive rejected"
    );

    console.log(
      "TEST 3: directory is not a regular archive file"
    );

    const directoryPath =
      path.join(
        tempRoot,
        "directory.zip"
      );

    fs.mkdirSync(
      directoryPath
    );

    await expectReject(
      () =>
        service.extractArchive(
          directoryPath,
          path.join(
            tempRoot,
            "directory_output"
          )
        ),
      "not a regular file"
    );

    console.log(
      "PASS: non-file archive rejected"
    );

    console.log(
      "TEST 4: HTML renamed as ZIP"
    );

    const htmlZipPath =
      path.join(
        tempRoot,
        "html.zip"
      );

    fs.writeFileSync(
      htmlZipPath,
      "<!DOCTYPE html><html><body>Cloudflare challenge</body></html>"
    );

    await expectReject(
      () =>
        service.extractArchive(
          htmlZipPath,
          path.join(
            tempRoot,
            "html_output"
          )
        ),
      "Invalid ZIP magic signature"
    );

    console.log(
      "PASS: HTML masquerading as ZIP rejected"
    );

    console.log(
      "TEST 5: malformed ZIP with ZIP-like signature"
    );

    const malformedZipPath =
      path.join(
        tempRoot,
        "malformed.zip"
      );

    fs.writeFileSync(
      malformedZipPath,
      Buffer.from([
        0x50,
        0x4b,
        0x03,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00
      ])
    );

    await expectReject(
      () =>
        service.extractArchive(
          malformedZipPath,
          path.join(
            tempRoot,
            "malformed_output"
          )
        ),
      "Failed to open ZIP archive"
    );

    console.log(
      "PASS: malformed ZIP rejected"
    );

    console.log(
      "TEST 6: no eligible registry data file"
    );

    const readmePath =
      path.join(
        tempRoot,
        "README.md"
      );

    fs.writeFileSync(
      readmePath,
      "# not registry data"
    );

    const noCandidateZip =
      path.join(
        tempRoot,
        "no_candidate.zip"
      );

    createZipWithPython(
      noCandidateZip,
      [
        {
          archiveName:
            "README.md",
          sourcePath:
            readmePath
        }
      ]
    );

    await expectReject(
      () =>
        service.extractArchive(
          noCandidateZip,
          path.join(
            tempRoot,
            "no_candidate_output"
          )
        ),
      "No eligible registry data file"
    );

    console.log(
      "PASS: archive without data candidate rejected"
    );

    console.log(
      "TEST 7: ambiguous eligible data files"
    );

    const secondDataPath =
      path.join(
        tempRoot,
        "second.dat"
      );

    fs.writeFileSync(
      secondDataPath,
      "SECOND"
    );

    const ambiguousZipPath =
      path.join(
        tempRoot,
        "ambiguous.zip"
      );

    createZipWithPython(
      ambiguousZipPath,
      [
        {
          archiveName:
            "first.txt",
          sourcePath:
            sourceDataPath
        },
        {
          archiveName:
            "second.dat",
          sourcePath:
            secondDataPath
        }
      ]
    );

    await expectReject(
      () =>
        service.extractArchive(
          ambiguousZipPath,
          path.join(
            tempRoot,
            "ambiguous_output"
          )
        ),
      "Ambiguous archive"
    );

    console.log(
      "PASS: ambiguous archive rejected"
    );

    console.log(
      "TEST 8: path traversal entry rejected before extraction"
    );

    const traversalZipPath =
      path.join(
        tempRoot,
        "traversal.zip"
      );

    createZipWithPython(
      traversalZipPath,
      [
        {
          archiveName:
            "../evil.txt",
          sourcePath:
            sourceDataPath
        }
      ]
    );

    const traversalOutput =
      path.join(
        tempRoot,
        "traversal_output"
      );

    await expectReject(
      () =>
        service.extractArchive(
          traversalZipPath,
          traversalOutput
        ),
      "Unsafe entry path"
    );

    if (
      fs.existsSync(
        traversalOutput
      )
    ) {
      assert.strictEqual(
        fs.readdirSync(
          traversalOutput
        ).length,
        0,
        "Traversal rejection must not leave extracted files."
      );
    }

    console.log(
      "PASS: traversal rejected with no extracted output"
    );

    console.log(
      "TEST 9: declared uncompressed size limit"
    );

    const limitedService =
      new FloridaDatasetArchiveService({
        maxArchiveSizeBytes:
          10 * 1024 * 1024,
        maxFileSizeBytes:
          1024
      });

    await expectReject(
      () =>
        limitedService.extractArchive(
          validZipPath,
          path.join(
            tempRoot,
            "size_output"
          )
        ),
      "Declared uncompressed file size"
    );

    console.log(
      "PASS: declared size limit enforced"
    );

    console.log();
    console.log(
      "PASS: FloridaDatasetArchiveService integration tests passed."
    );
  } finally {
    fs.rmSync(
      tempRoot,
      {
        recursive: true,
        force: true
      }
    );
  }
}

run().catch((err) => {
  console.error(
    "FAIL:",
    err
  );
  process.exitCode = 1;
});
