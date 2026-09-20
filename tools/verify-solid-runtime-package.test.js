const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { verifySolidRuntimePackage } = require('./verify-solid-runtime-package');

const createFixture = ({ installedVersion = '2.0.0-rc.2' } = {}) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'solid-runtime-preflight-'));
  const vendorDir = join(rootDir, 'vendor');
  const installedDir = join(rootDir, 'node_modules', '@solid-intents', 'runtime');
  mkdirSync(vendorDir, { recursive: true });
  mkdirSync(join(installedDir, 'dist'), { recursive: true });

  const archive = 'runtime-test.tgz';
  const bytes = Buffer.from('qualified runtime fixture');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const expectation = {
    archive,
    bundle: 'C3',
    dependencyProfile: 'jsonld9',
    dependencyVersions: {
      solidUtils: '0.6.1',
      jsonld: '9.0.0',
      httpClient: '4.4.0',
      undici: '6.28.1',
    },
    requiredTypeExports: ['DiscoverySession', 'RuntimeRdfQuad'],
    sha256: digest,
    sourceCommit: 'qualified-source',
    version: '2.0.0-rc.2',
  };

  writeFileSync(join(vendorDir, archive), bytes);
  writeFileSync(join(vendorDir, 'runtime-test.sha256'), `${digest}  ${archive}\n`);
  const report = JSON.stringify({
    sourceCommit: expectation.sourceCommit,
    packageVersion: expectation.version,
    workingTree: false,
    bundle: expectation.bundle,
    dependencyProfile: expectation.dependencyProfile,
    sha256: digest,
    archive,
    dependencyQualification: {
      resolvedDependencies: {
        solidUtils: ['0.6.1'],
        jsonld: ['9.0.0'],
        httpClient: ['4.4.0'],
        undici: ['6.28.1'],
      },
      productionAudit: { vulnerabilities: { total: 0 } },
    },
  });
  writeFileSync(join(vendorDir, 'runtime-test.json'), report);
  expectation.reportSha256 = createHash('sha256').update(report).digest('hex');
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({
      dependencies: { '@solid-intents/runtime': `file:vendor/${archive}` },
      overrides: { '@noeldemartin/solid-utils': { jsonld: '9.0.0' } },
    }),
  );
  writeFileSync(
    join(installedDir, 'package.json'),
    JSON.stringify({ version: installedVersion }),
  );
  writeFileSync(
    join(installedDir, 'dist', 'index.d.ts'),
    'export type { DiscoverySession, RuntimeRdfQuad } from "./types.js";\n',
  );

  return { archivePath: join(vendorDir, archive), expectation, rootDir };
};

test('accepts the qualified archive and installed package', () => {
  const fixture = createFixture();
  const result = verifySolidRuntimePackage(fixture);
  assert.equal(result.version, '2.0.0-rc.2');
  assert.equal(result.sourceCommit, 'qualified-source');
});

test('rejects a checksum mismatch', () => {
  const fixture = createFixture();
  writeFileSync(fixture.archivePath, 'changed bytes');
  assert.throws(() => verifySolidRuntimePackage(fixture), /archive SHA-256/);
});

test('rejects a missing archive', () => {
  const fixture = createFixture();
  fixture.expectation = { ...fixture.expectation, archive: 'missing.tgz' };
  assert.throws(() => verifySolidRuntimePackage(fixture), /archive is missing/);
});

test('rejects the wrong installed version', () => {
  const fixture = createFixture({ installedVersion: '2.0.0-rc.1' });
  assert.throws(
    () => verifySolidRuntimePackage(fixture),
    /installed Solid runtime version/i,
  );
});

test('rejects a stale 1.1.1 installation', () => {
  const fixture = createFixture({ installedVersion: '1.1.1' });
  assert.throws(
    () => verifySolidRuntimePackage(fixture),
    /installed Solid runtime version/i,
  );
});
