/**
 * OCR cloud para Rinde fácil.
 *
 * Apps Script llama a Google Cloud Vision mediante el OAuth del propio script.
 * Document AI queda disponible como proveedor opcional cuando la comunidad
 * configure un processor; Drive OCR sigue siendo el fallback conservador.
 *
 * Propiedades de script:
 *   RINDE_FACIL_OCR_PROVIDER = drive_v3 | cloud_vision | document_ai | hybrid
 *   RINDE_FACIL_GCP_PROJECT_ID = proyecto para cuota/facturación de Vision
 *   RINDE_FACIL_DOCUMENT_AI_PROCESSOR = projects/.../processors/...
 */

const CLOUD_OCR_CONFIG = {
  providerProperty: 'RINDE_FACIL_OCR_PROVIDER',
  projectProperty: 'RINDE_FACIL_GCP_PROJECT_ID',
  processorProperty: 'RINDE_FACIL_DOCUMENT_AI_PROCESSOR',
  defaultProvider: 'drive_v3',
  visionEndpoint: 'https://vision.googleapis.com/v1/images:annotate',
  fileVisionEndpoint: 'https://vision.googleapis.com/v1/files:annotate',
  documentAiEndpoint: 'https://documentai.googleapis.com/v1/',
  languageHints: ['es', 'en']
};

function scriptProperty_(name) {
  if (typeof PropertiesService === 'undefined') return '';
  return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}

function configuredOcrProvider_() {
  const configured = scriptProperty_(CLOUD_OCR_CONFIG.providerProperty).toLowerCase();
  return ['drive_v3', 'cloud_vision', 'document_ai', 'hybrid'].includes(configured)
    ? configured
    : CLOUD_OCR_CONFIG.defaultProvider;
}

function cloudOcrNotConfigured_(engine, reason, metadata) {
  return {
    status: 'ERROR', raw_text: '', ocr_engine: engine,
    file_id: metadata && metadata.file_id || null,
    file_name: metadata && metadata.file_name || null,
    file_hash_sha256: metadata && metadata.file_hash_sha256 || null,
    duration_ms: 0, error: reason, configuration_required: true
  };
}

function isCloudVisionFileMime_(mimeType) {
  return ['application/pdf', 'image/tiff', 'image/gif'].includes(
    String(mimeType || '').toLowerCase()
  );
}

function validateCloudVisionPages_(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('Debe indicarse explícitamente qué páginas del archivo procesar.');
  }
  if (pages.length > 5) {
    throw new Error('Cloud Vision procesa como máximo cinco páginas por solicitud.');
  }
  const normalized = pages.map(Number);
  if (normalized.some(page => !Number.isInteger(page) || page < 1)) {
    throw new Error('Las páginas deben ser enteros positivos, numerados desde 1.');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('La lista de páginas no puede contener duplicados.');
  }
  return normalized;
}

function buildCloudVisionRequest_(blob, options = {}) {
  if (!blob || typeof blob.getBytes !== 'function') {
    throw new Error('Se requiere un Blob de Apps Script para Cloud Vision.');
  }
  const mimeType = typeof blob.getContentType === 'function'
    ? String(blob.getContentType() || '').toLowerCase()
    : '';
  const content = Utilities.base64Encode(blob.getBytes());
  const features = [{ type: 'DOCUMENT_TEXT_DETECTION' }];
  const imageContext = {
    languageHints: options.languageHints || CLOUD_OCR_CONFIG.languageHints
  };
  if (isCloudVisionFileMime_(mimeType)) {
    const fileRequest = {
      inputConfig: { content: content, mimeType: mimeType },
      features: features,
      imageContext: imageContext
    };
    if (Array.isArray(options.pages) && options.pages.length) {
      fileRequest.pages = validateCloudVisionPages_(options.pages);
    }
    return { requests: [fileRequest] };
  }
  return {
    requests: [{
      image: { content: content },
      features: features,
      imageContext: imageContext
    }]
  };
}

function cloudVisionConfidenceStats_(annotation) {
  const confidences = [];
  const pageGroups = Array.isArray(annotation) ? annotation : [annotation || {}];
  pageGroups.forEach(group => (group && group.pages || []).forEach(page =>
    (page.blocks || []).forEach(block =>
      (block.paragraphs || []).forEach(paragraph =>
        (paragraph.words || []).forEach(word => {
          if (typeof word.confidence === 'number') confidences.push(word.confidence);
        })
      )
    )
  ));
  return {
    mean: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null,
    count: confidences.length
  };
}

function averageCloudVisionConfidence_(annotation) {
  return cloudVisionConfidenceStats_(annotation).mean;
}

function cloudVisionQuality_(annotation, rawText) {
  const confidence = averageCloudVisionConfidence_(annotation);
  const hasText = String(rawText || '').trim().length > 0;
  return {
    status: 'REVIEW_REQUIRED', visual_verification_required: true,
    visual_verification_status: 'PENDING',
    confidence_basis: 'cloud_vision_word_confidence_plus_human_review',
    mean_word_confidence: confidence, text_detected: hasText,
    reasons: hasText ? ['HUMAN_VISUAL_ATTESTATION_REQUIRED'] : ['OCR_TEXT_UNAVAILABLE']
  };
}

/* ángulo de un cuadro de texto según hacia dónde va su borde superior, en 0, 90, 180 o 270 grados */
function cloudVisionAngle_(box) {
  const v = box && box.vertices;
  if (!v || v.length < 2) return 0;
  const dx = (v[1].x || 0) - (v[0].x || 0), dy = (v[1].y || 0) - (v[0].y || 0);
  let deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI / 90) * 90;
  deg = ((deg % 360) + 360) % 360;
  return deg === 360 ? 0 : deg;
}

/* caja normalizada (0 a 1) respecto de la página, para que el analizador no dependa del tamaño del escaneo */
function cloudVisionBox_(box, width, height) {
  const v = (box && box.vertices) || [];
  if (!v.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const xs = v.map(p => (p.x || 0) / (width || 1));
  const ys = v.map(p => (p.y || 0) / (height || 1));
  return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
}

/* páginas con su rotación y sus párrafos (texto + caja), para reconstruir tablas en el analizador */
function cloudVisionLayout_(annotations, pageNumbers) {
  const layout = [];
  annotations.forEach((annotation, index) => (annotation.pages || []).forEach(page => {
    const width = Number(page.width) || 1, height = Number(page.height) || 1;
    const votes = { 0: 0, 90: 0, 180: 0, 270: 0 };
    const paragraphs = [];
    (page.blocks || []).forEach(block => (block.paragraphs || []).forEach(paragraph => {
      const words = (paragraph.words || []).map(word =>
        (word.symbols || []).map(symbol => symbol.text || '').join(''));
      const text = words.join(' ').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const angle = cloudVisionAngle_((paragraph.words || [])[0] && paragraph.words[0].boundingBox);
      votes[angle] += text.length; // el ángulo de la página es el que tiene más texto
      paragraphs.push({ text: text, angle: angle, box: cloudVisionBox_(paragraph.boundingBox, width, height) });
    }));
    const angle = Number(Object.keys(votes).reduce((best, key) => votes[key] > votes[best] ? key : best, '0'));
    layout.push({
      number: (pageNumbers && pageNumbers[index]) || layout.length + 1,
      angle: angle, width: width, height: height, paragraphs: paragraphs
    });
  }));
  return layout;
}

function parseCloudVisionPayload_(payload, metadata = {}) {
  const fileResponse = payload && payload.responses && payload.responses[0] || {};
  if (payload && payload.error || fileResponse.error) {
    const error = payload && payload.error || fileResponse.error;
    return {
      status: 'ERROR', raw_text: '', ocr_engine: 'cloud_vision',
      file_id: metadata.file_id || null, file_name: metadata.file_name || null,
      file_hash_sha256: metadata.file_hash_sha256 || null,
      duration_ms: metadata.duration_ms || 0,
      error: error.message || JSON.stringify(error)
    };
  }
  const pageResponses = Array.isArray(fileResponse.responses)
    ? fileResponse.responses
    : [fileResponse];
  const pageErrors = pageResponses.map(response => response.error).filter(Boolean);
  const annotations = pageResponses.map(response => response.fullTextAnnotation || {});
  const rawText = annotations.map((annotation, index) => String(annotation.text ||
    ((pageResponses[index].textAnnotations || [])[0] || {}).description || '').trim())
    .filter(Boolean).join('\n\n');
  const allPages = annotations.reduce((pages, annotation) =>
    pages.concat(annotation.pages || []), []);
  const confidenceStats = cloudVisionConfidenceStats_({ pages: allPages });
  const error = pageErrors.length
    ? pageErrors.map(item => item.message || JSON.stringify(item)).join('; ')
    : null;
  return {
    status: rawText && !error ? 'SUCCESS' : 'ERROR', raw_text: rawText,
    ocr_engine: 'cloud_vision', cloud_model: 'DOCUMENT_TEXT_DETECTION',
    file_id: metadata.file_id || null, file_name: metadata.file_name || null,
    file_hash_sha256: metadata.file_hash_sha256 || null,
    duration_ms: metadata.duration_ms || 0,
    confidence: confidenceStats.mean,
    confidence_sample_count: confidenceStats.count,
    page_count: pageResponses.length,
    total_pages: Number(fileResponse.totalPages) || null,
    ocr_quality: cloudVisionQuality_({ pages: allPages }, rawText),
    pages_layout: cloudVisionLayout_(annotations, pageResponses.map(response => response.context && response.context.pageNumber)),
    error: error || (rawText ? null : 'Cloud Vision no devolvió texto.')
  };
}

function cloudVisionRequestedPages_(metadata) {
  if (Array.isArray(metadata.pages) && metadata.pages.length) {
    return metadata.pages.map(Number);
  }
  const pageCount = Number(metadata.page_count);
  if (!Number.isInteger(pageCount) || pageCount < 1) return null;
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function cloudVisionPageBatches_(pages) {
  const normalized = (Array.isArray(pages) ? pages : []).map(Number);
  if (!normalized.length || normalized.some(page => !Number.isInteger(page) || page < 1)) {
    throw new Error('Las páginas deben ser enteros positivos, numerados desde 1.');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('La lista de páginas no puede contener duplicados.');
  }
  if (normalized.length <= 5) return [validateCloudVisionPages_(normalized)];
  const batches = [];
  for (let index = 0; index < normalized.length; index += 5) {
    batches.push(validateCloudVisionPages_(normalized.slice(index, index + 5)));
  }
  return batches;
}

function callCloudVisionRequest_(blob, metadata, pages) {
  const mimeType = typeof blob.getContentType === 'function'
    ? String(blob.getContentType() || '').toLowerCase()
    : '';
  const fileRequest = isCloudVisionFileMime_(mimeType);
  const endpoint = fileRequest
    ? CLOUD_OCR_CONFIG.fileVisionEndpoint
    : CLOUD_OCR_CONFIG.visionEndpoint;
  const started = Date.now();
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(buildCloudVisionRequest_(blob, { pages: pages })),
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'x-goog-user-project': scriptProperty_(CLOUD_OCR_CONFIG.projectProperty)
    }, muteHttpExceptions: true
  });
  const result = parseCloudVisionPayload_(JSON.parse(response.getContentText() || '{}'),
    Object.assign({}, metadata, { duration_ms: Date.now() - started }));
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    result.status = 'ERROR';
    result.error = result.error || 'Cloud Vision HTTP ' + response.getResponseCode();
  }
  return result;
}

function callCloudVision_(blob, metadata = {}) {
  const projectId = scriptProperty_(CLOUD_OCR_CONFIG.projectProperty);
  if (!projectId) return cloudOcrNotConfigured_('cloud_vision',
    'Falta la propiedad RINDE_FACIL_GCP_PROJECT_ID.', metadata);
  if (typeof UrlFetchApp === 'undefined' || typeof ScriptApp === 'undefined') {
    return cloudOcrNotConfigured_('cloud_vision',
      'UrlFetchApp/ScriptApp no están disponibles en Apps Script.', metadata);
  }
  const mimeType = blob && typeof blob.getContentType === 'function'
    ? String(blob.getContentType() || '').toLowerCase()
    : '';
  const fileRequest = isCloudVisionFileMime_(mimeType);
  const started = Date.now();
  try {
    let requestedPages = [];
    let results = [];
    let expectedPageCount = null;
    if (!fileRequest) {
      results = [callCloudVisionRequest_(blob, metadata, null)];
    } else {
      const explicitPages = Array.isArray(metadata.pages) && metadata.pages.length > 0;
      const configuredPageCount = Number(metadata.page_count);
      const hasConfiguredPageCount = Number.isInteger(configuredPageCount) && configuredPageCount > 0;
      if (explicitPages) {
        requestedPages = metadata.pages.map(Number);
        const batches = cloudVisionPageBatches_(requestedPages);
        results = batches.map(pages => callCloudVisionRequest_(blob, metadata, pages));
        expectedPageCount = hasConfiguredPageCount ? configuredPageCount : null;
      } else if (hasConfiguredPageCount) {
        expectedPageCount = configuredPageCount;
        requestedPages = Array.from({ length: expectedPageCount }, (_, index) => index + 1);
        results = cloudVisionPageBatches_(requestedPages)
          .map(pages => callCloudVisionRequest_(blob, metadata, pages));
      } else {
        // The synchronous file endpoint returns totalPages and, by default,
        // OCRs the first five pages. Reuse that batch and request any remainder.
        const discovery = callCloudVisionRequest_(blob, metadata, []);
        if (discovery.status !== 'SUCCESS' || !Number.isInteger(discovery.total_pages) ||
            discovery.total_pages < 1 || discovery.page_count !== Math.min(5, discovery.total_pages)) {
          return Object.assign({}, discovery, {
            status: 'ERROR', raw_text: '', duration_ms: Date.now() - started,
            document_coverage: 'UNKNOWN_OR_PARTIAL',
            error: discovery.error || 'PDF_PAGE_COUNT_UNKNOWN: Cloud Vision no confirmó el número total de páginas y su cobertura.'
          });
        }
        expectedPageCount = discovery.total_pages;
        requestedPages = Array.from({ length: expectedPageCount }, (_, index) => index + 1);
        results = [discovery];
        const firstUnprocessedPage = discovery.page_count + 1;
        if (firstUnprocessedPage <= expectedPageCount) {
          const remainingPages = Array.from(
            { length: expectedPageCount - discovery.page_count },
            (_, index) => firstUnprocessedPage + index
          );
          results = results.concat(cloudVisionPageBatches_(remainingPages)
            .map(pages => callCloudVisionRequest_(blob, metadata, pages)));
        }
      }
    }

    const failed = results.find(result => result.status !== 'SUCCESS');
    if (failed) {
      return Object.assign({}, failed, {
        raw_text: '', duration_ms: Date.now() - started,
        pages_requested: requestedPages,
        pages_returned: results.reduce((sum, result) => sum + (result.page_count || 0), 0)
      });
    }
    if (!fileRequest) {
      const result = results[0];
      result.document_coverage = 'COMPLETE';
      result.pages_requested = [];
      result.pages_returned = 1;
      return result;
    }

    const pageCount = expectedPageCount;
    const reportedPageCounts = results.map(result => result.total_pages).filter(Number.isInteger);
    const countsAgree = reportedPageCounts.every(count => count === pageCount);
    const returnedPages = results.reduce((sum, result) => sum + (result.page_count || 0), 0);
    const pageSelectionComplete = Number.isInteger(pageCount) && pageCount > 0 &&
      requestedPages.length === pageCount && returnedPages === pageCount && countsAgree &&
      requestedPages.every((page, index) => page === index + 1);
    const confidenceSamples = results.reduce((sum, result) =>
      sum + (result.confidence_sample_count || 0), 0);
    const confidenceTotal = results.reduce((sum, result) =>
      sum + (result.confidence || 0) * (result.confidence_sample_count || 0), 0);
    const rawText = results.map(result => result.raw_text).filter(Boolean).join('\n\n');
    const confidence = confidenceSamples ? confidenceTotal / confidenceSamples : null;
    const output = {
      status: rawText ? 'SUCCESS' : 'ERROR', raw_text: rawText,
      ocr_engine: 'cloud_vision', cloud_model: 'DOCUMENT_TEXT_DETECTION',
      file_id: metadata.file_id || null, file_name: metadata.file_name || null,
      file_hash_sha256: metadata.file_hash_sha256 || null,
      duration_ms: Date.now() - started, confidence,
      confidence_sample_count: confidenceSamples,
      page_count: returnedPages,
      total_pages: pageCount,
      pages_requested: requestedPages,
      pages_returned: returnedPages,
      document_coverage: pageSelectionComplete ? 'COMPLETE' :
        (Number.isInteger(pageCount) ? 'PARTIAL_PAGE_SELECTION' : 'UNKNOWN_OR_PARTIAL'),
      ocr_quality: cloudVisionQuality_({ pages: [] }, rawText),
      error: pageSelectionComplete && rawText ? null :
        (rawText ? 'PDF_COVERAGE_INCOMPLETE: no se procesaron todas las páginas.' : 'Cloud Vision no devolvió texto.')
    };
    output.ocr_quality.mean_word_confidence = confidence;
    output.pages_layout = results.reduce((all, result) => all.concat(result.pages_layout || []), [])
      .sort((a, b) => a.number - b.number);
    return output;
  } catch (error) {
    return {
      status: 'ERROR', raw_text: '', ocr_engine: 'cloud_vision',
      file_id: metadata.file_id || null, file_name: metadata.file_name || null,
      file_hash_sha256: metadata.file_hash_sha256 || null,
      duration_ms: Date.now() - started,
      pages_requested: requestedPages,
      error: error.message || String(error)
    };
  }
}

function cloudVisionErrorCategory_(error) {
  const message = String(error || '');
  if (/API.*(disabled|not enabled)|has not been used/i.test(message)) return 'API_DISABLED';
  if (/PERMISSION_DENIED|403|not have permission|insufficient authentication/i.test(message)) {
    return 'PERMISSION_DENIED';
  }
  if (/billing|billing.*disabled/i.test(message)) return 'BILLING_REQUIRED';
  if (/PDF_PAGE_COUNT_REQUIRED/.test(message)) return 'PDF_PAGE_COUNT_REQUIRED';
  if (/invalid.*(pdf|image)|unable to parse/i.test(message)) return 'INVALID_DOCUMENT';
  return error ? 'OCR_REQUEST_FAILED' : null;
}

/**
 * Smoke test for one isolated Drive file. The script property
 * RINDE_FACIL_OCR_SMOKE_FILE_ID selects the file; PDF pages are optional CSV
 * in RINDE_FACIL_OCR_SMOKE_PAGES. It logs only counts/status, never OCR text,
 * filename, RUT, totals, or Drive identifiers, and never writes to a Sheet.
 */
function runCloudVisionSmokeTest() {
  const fileId = scriptProperty_('RINDE_FACIL_OCR_SMOKE_FILE_ID');
  if (!fileId) throw new Error('Configure RINDE_FACIL_OCR_SMOKE_FILE_ID para la prueba aislada.');
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const metadata = {};
  if (isCloudVisionFileMime_(blob.getContentType())) {
    const pageSetting = scriptProperty_('RINDE_FACIL_OCR_SMOKE_PAGES');
    metadata.pages = pageSetting ? pageSetting.split(',').map(value => Number(value.trim())) : [];
  }
  const result = callCloudVision_(blob, metadata);
  const summary = {
    status: result.status,
    ocr_engine: result.ocr_engine,
    duration_ms: result.duration_ms,
    text_characters: String(result.raw_text || '').length,
    pages_requested: (result.pages_requested || []).length,
    pages_returned: result.pages_returned || result.page_count || 0,
    total_pages: result.total_pages || null,
    mean_word_confidence: result.confidence === undefined ? null : result.confidence,
    document_coverage: result.document_coverage || 'NOT_APPLICABLE',
    error_category: cloudVisionErrorCategory_(result.error)
  };
  Logger.log('[CLOUD_VISION_SMOKE] ' + JSON.stringify(summary));
  return summary;
}

function parseDocumentAiPayload_(payload, metadata = {}) {
  const document = payload && payload.document || {};
  const rawText = String(document.text || '').trim();
  const qualityScores = [];
  (document.pages || []).forEach(page => {
    const score = page.imageQualityScores && page.imageQualityScores.qualityScore;
    if (typeof score === 'number') qualityScores.push(score);
  });
  const meanQuality = qualityScores.length
    ? qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
    : null;
  return {
    status: rawText ? 'SUCCESS' : 'ERROR', raw_text: rawText,
    ocr_engine: 'document_ai', cloud_model: 'processor',
    file_id: metadata.file_id || null, file_name: metadata.file_name || null,
    file_hash_sha256: metadata.file_hash_sha256 || null,
    duration_ms: metadata.duration_ms || 0, confidence: meanQuality,
    ocr_quality: {
      status: 'REVIEW_REQUIRED', visual_verification_required: true,
      visual_verification_status: 'PENDING',
      confidence_basis: 'document_ai_quality_plus_human_review',
      mean_image_quality: meanQuality, text_detected: Boolean(rawText),
      reasons: rawText ? ['HUMAN_VISUAL_ATTESTATION_REQUIRED'] : ['OCR_TEXT_UNAVAILABLE']
    }, error: rawText ? null : 'Document AI no devolvió texto.'
  };
}

function callDocumentAi_(blob, metadata = {}) {
  const processor = scriptProperty_(CLOUD_OCR_CONFIG.processorProperty);
  if (!processor) return cloudOcrNotConfigured_('document_ai',
    'Falta la propiedad RINDE_FACIL_DOCUMENT_AI_PROCESSOR.', metadata);
  if (typeof UrlFetchApp === 'undefined' || typeof ScriptApp === 'undefined') {
    return cloudOcrNotConfigured_('document_ai',
      'UrlFetchApp/ScriptApp no están disponibles en Apps Script.', metadata);
  }
  const started = Date.now();
  try {
    const endpoint = CLOUD_OCR_CONFIG.documentAiEndpoint + processor + ':process';
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ rawDocument: {
        content: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType()
      }}), headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    const result = parseDocumentAiPayload_(JSON.parse(response.getContentText() || '{}'),
      Object.assign({}, metadata, { duration_ms: Date.now() - started }));
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      result.status = 'ERROR';
      result.error = result.error || 'Document AI HTTP ' + response.getResponseCode();
    }
    return result;
  } catch (error) {
    return {
      status: 'ERROR', raw_text: '', ocr_engine: 'document_ai',
      file_id: metadata.file_id || null, file_name: metadata.file_name || null,
      file_hash_sha256: metadata.file_hash_sha256 || null,
      duration_ms: Date.now() - started, error: error.message || String(error)
    };
  }
}

function processDocumentWithConfiguredOcr(fileId, systemMetadata = {}) {
  const sourceFile = DriveApp.getFileById(fileId);
  const blob = sourceFile.getBlob();
  const fileName = sourceFile.getName();
  const fileHash = computeFileSha256(blob);
  const metadata = Object.assign({}, systemMetadata, {
    file_id: fileId, file_name: fileName, file_hash_sha256: fileHash
  });
  const provider = configuredOcrProvider_();
  let ocrResult;
  if (provider === 'cloud_vision') ocrResult = callCloudVision_(blob, metadata);
  else if (provider === 'document_ai') ocrResult = callDocumentAi_(blob, metadata);
  else if (provider === 'hybrid') {
    const primary = callCloudVision_(blob, metadata);
    const secondary = extractTextFromDriveFileId(fileId, systemMetadata);
    ocrResult = Object.assign({}, primary, {
      ocr_engine: 'hybrid_cloud_vision_drive_v3',
      cross_validation: {
        secondary_engine: secondary.ocr_engine, secondary_status: secondary.status,
        text_disagreement: Boolean(primary.raw_text && secondary.raw_text &&
          primary.raw_text !== secondary.raw_text), secondary_error: secondary.error || null
      }
    });
    if (primary.status !== 'SUCCESS' && secondary.status === 'SUCCESS') {
      ocrResult = Object.assign({}, secondary, {
        ocr_engine: 'hybrid_cloud_vision_drive_v3', fallback_used: 'drive_v3'
      });
    }
  } else {
    return processDocumentWithDriveOcr(fileId, systemMetadata);
  }
  const isCloudFile = isCloudVisionFileMime_(blob.getContentType());
  if (isCloudFile && String(ocrResult.ocr_engine || '').indexOf('cloud_vision') >= 0 &&
      ocrResult.document_coverage !== 'COMPLETE') {
    return {
      ocr_engine: ocrResult.ocr_engine || provider, parser_status: 'FAILED',
      extraction_status: 'FAILED', ocr_quality: ocrResult.ocr_quality || {
        status: 'REVIEW_REQUIRED', visual_verification_required: true,
        visual_verification_status: 'PENDING', confidence_basis: 'incomplete_document_coverage',
        reasons: ['HUMAN_VISUAL_ATTESTATION_REQUIRED']
      }, ocr_error: 'Cloud Vision no confirmó cobertura completa del documento; se detuvo antes de extraer campos.',
      file_hash_sha256: fileHash, ocr_provenance: ocrResult
    };
  }
  if (ocrResult.status !== 'SUCCESS' || !ocrResult.raw_text) {
    return {
      ocr_engine: ocrResult.ocr_engine || provider, parser_status: 'FAILED',
      extraction_status: 'FAILED', ocr_quality: ocrResult.ocr_quality || {
        status: 'REVIEW_REQUIRED', visual_verification_required: true,
        visual_verification_status: 'PENDING', confidence_basis: 'ocr_unavailable',
        reasons: ['OCR_TEXT_UNAVAILABLE']
      }, ocr_error: ocrResult.error || 'No se obtuvo texto del OCR cloud.',
      file_hash_sha256: fileHash, ocr_provenance: ocrResult
    };
  }
  const parseFn = typeof parseReceipt === 'function' ? parseReceipt : null;
  if (!parseFn) throw new Error('Función parseReceipt no encontrada en el contexto.');
  const extraction = parseFn(ocrResult.raw_text, ocrResult.ocr_engine);
  return Object.assign({}, extraction, {
    ocr_engine: ocrResult.ocr_engine, file_id: fileId, file_name: fileName,
    file_hash_sha256: fileHash, ocr_duration_ms: ocrResult.duration_ms,
    ocr_raw_text: ocrResult.raw_text,
    ocr_quality: ocrResult.ocr_quality || {
      status: 'REVIEW_REQUIRED', visual_verification_required: true,
      visual_verification_status: 'PENDING', confidence_basis: 'cloud_ocr_plus_human_review',
      reasons: ['HUMAN_VISUAL_ATTESTATION_REQUIRED']
    }, ocr_provenance: ocrResult, extraction_status: 'HUMAN_REVIEW'
  });
}
