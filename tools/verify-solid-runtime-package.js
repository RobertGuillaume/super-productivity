const { createHash } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const DEFAULT_EXPECTATION = Object.freeze({
  archive:
    'solid-intents-runtime-2.0.0-rc.2-50af91b10286bbc0647d9380fb3d038eda2abae0-C3-jsonld9-v22.23.2.tgz',
  bundle: 'C3',
  dependencyProfile: 'jsonld9',
  dependencyVersions: Object.freeze({
    solidUtils: '0.6.1',
    jsonld: '9.0.0',
    httpClient: '4.4.0',
    undici: '6.28.1',
  }),
  requiredTypeExports: Object.freeze([
    'DiscoverySession',
    'DiscoverySessionRunReason',
    'DiscoverySessionSnapshot',
    'RuntimeFieldInput',
    'RuntimeFieldScalar',
    'RuntimeFieldValue',
    'RuntimeRdfQuad',
    'RuntimeTypedThing',
  ]),
  reportSha256: '7c49c63a23f909188017d7ccd6bd4b02fac8311aab881d7c1b026aeae88f3bcd',
  sha256: '3b431af31e2c3c92af63b5b3a649259be4981764154033ee656e3a57a14d549a',
  sourceCommit: '50af91b10286bbc0647d9380fb3d038eda2abae0',
  version: '2.0.0-rc.2',
});

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assertFile = (path, label) => {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
};

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const verifySolidRuntimePackage = ({
  rootDir = join(__dirname, '..'),
  expectation = DEFAULT_EXPECTATION,
} = {}) => {
  const vendorDir = join(rootDir, 'vendor');
  const archivePath = join(vendorDir, expectation.archive);
  const checksumPath = archivePath.replace(/\.tgz$/, '.sha256');
  const reportPath = archivePath.replace(/\.tgz$/, '.json');

  assertFile(archivePath, 'Solid runtime archive');
  assertFile(checksumPath, 'Solid runtime checksum');
  assertFile(reportPath, 'Solid runtime qualification report');

  const digest = sha256(archivePath);
  assertEqual(digest, expectation.sha256, 'Solid runtime archive SHA-256');

  const checksum = readFileSync(checksumPath, 'utf8').trim().split(/\s+/);
  assertEqual(checksum[0], expectation.sha256, 'Solid runtime checksum digest');
  assertEqual(checksum[1], expectation.archive, 'Solid runtime checksum filename');

  assertEqual(
    sha256(reportPath),
    expectation.reportSha256,
    'Solid runtime qualification report SHA-256',
  );

  const report = readJson(reportPath);
  assertEqual(
    report.sourceCommit,
    expectation.sourceCommit,
    'Qualification source commit',
  );
  assertEqual(
    report.packageVersion,
    expectation.version,
    'Qualification package version',
  );
  assertEqual(report.workingTree, false, 'Qualification clean working tree');
  assertEqual(report.bundle, expectation.bundle, 'Qualification contract bundle');
  assertEqual(
    report.dependencyProfile,
    expectation.dependencyProfile,
    'Qualification dependency profile',
  );
  assertEqual(report.sha256, expectation.sha256, 'Qualification archive SHA-256');
  assertEqual(report.archive, expectation.archive, 'Qualification archive filename');
  assertEqual(
    report.dependencyQualification?.productionAudit?.vulnerabilities?.total,
    0,
    'Qualified runtime production audit',
  );

  const resolved = report.dependencyQualification?.resolvedDependencies;
  for (const [name, version] of Object.entries(expectation.dependencyVersions)) {
    const versions = resolved?.[name];
    if (!Array.isArray(versions) || versions.length !== 1) {
      throw new Error(`Qualification dependency ${name} must resolve exactly once`);
    }
    assertEqual(versions[0], version, `Qualification dependency ${name}`);
  }

  const manifest = readJson(join(rootDir, 'package.json'));
  assertEqual(
    manifest.dependencies?.['@solid-intents/runtime'],
    `file:vendor/${expectation.archive}`,
    'Application Solid runtime dependency',
  );
  assertEqual(
    manifest.overrides?.['@noeldemartin/solid-utils']?.jsonld,
    expectation.dependencyVersions.jsonld,
    'Application JSON-LD override',
  );

  const installedDir = join(rootDir, 'node_modules', '@solid-intents', 'runtime');
  const installedManifestPath = join(installedDir, 'package.json');
  assertFile(installedManifestPath, 'Installed Solid runtime manifest');
  const installedManifest = readJson(installedManifestPath);
  assertEqual(
    installedManifest.version,
    expectation.version,
    'Installed Solid runtime version',
  );

  const declarationsPath = join(installedDir, 'dist', 'index.d.ts');
  assertFile(declarationsPath, 'Installed Solid runtime declarations');
  const declarations = readFileSync(declarationsPath, 'utf8');
  for (const name of expectation.requiredTypeExports) {
    if (!new RegExp(`\\b${name}\\b`).test(declarations)) {
      throw new Error(`Installed Solid runtime declarations do not export ${name}`);
    }
  }

  return {
    archive: expectation.archive,
    sha256: digest,
    sourceCommit: report.sourceCommit,
    version: installedManifest.version,
  };
};

if (require.main === module) {
  try {
    const verified = verifySolidRuntimePackage();
    console.log(
      `Solid runtime ${verified.version} verified (${verified.sourceCommit}, ${verified.sha256})`,
    );
  } catch (error) {
    console.error(
      `Solid runtime preflight failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_EXPECTATION, verifySolidRuntimePackage };
