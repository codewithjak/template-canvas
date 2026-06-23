'use strict';

/**
 * storage/artifactStore.js
 *
 * The single artifact backend used by the app. S3-only (no local fallback): the
 * store is built from environment config at startup, so a misconfigured server
 * fails fast rather than silently losing artifacts. See S3_SETUP.md.
 *
 * Interface: { isRemote, put(jobId,{filePath,contentType}),
 *              downloadTarget(jobId,{fileName,expiresInMs}) }.
 */

module.exports = require('./s3Store').fromEnv();
