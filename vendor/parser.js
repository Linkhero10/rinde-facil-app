/* Copiado sin cambios de prototipo_mvp/src/prototyper/parser.js (SMI, piloto Rinde fácil). SHA-256 del original: 5811B6FD461B81E8A89010F1645955C9721C28A8F92D8DEEA793AF3A24A25702.
   Es el analizador de comprobantes chilenos (RUT, folio, fecha, neto/IVA/total) ya probado con 30/30 campos en el conjunto de desarrollo. */
/**
 * Motor de Extracción y Parsing Determinista (Parser Engine) - Google Apps Script / JS v0.2
 * Kit Comunitario de Pre-Rendición y Trazabilidad CORFO
 * Convenio CORFO-SQM Salar de Atacama | SMI Chile | Metodología FARO V4
 *
 * Implementa:
 * 1. Algoritmo Módulo 11 canónico con ponderadores [2, 3, 4, 5, 6, 7] para validación y normalización de RUT chileno.
 * 2. Extractor de Folio / N° de Comprobante.
 * 3. Normalizador de Fechas a ISO 8601 (YYYY-MM-DD) admitiendo formatos chilenos (ISO, DD/MM/YYYY, DD-MM-YYYY, DD de Mes de YYYY).
 * 4. Extractor de Montos con clasificación tributaria ('tax_breakdown': EXPLICIT, NOT_EXPLICIT, EXEMPT)
 *    y procedencia homogénea (raw, normalized, source, confidence, human_override).
 * 5. Evaluación aritmética y asignación ortogonal de 'extraction_status' (OK, HUMAN_REVIEW, FAILED).
 */

// Mapeo de meses en español a representación de dos dígitos
const MESES_ESPANOL = {
  'enero': '01', 'ene': '01',
  'febrero': '02', 'feb': '02',
  'marzo': '03', 'mar': '03',
  'abril': '04', 'abr': '04',
  'mayo': '05', 'may': '05',
  'junio': '06', 'jun': '06',
  'julio': '07', 'jul': '07',
  'agosto': '08', 'ago': '08',
  'septiembre': '09', 'setiembre': '09', 'sep': '09', 'set': '09',
  'octubre': '10', 'oct': '10',
  'noviembre': '11', 'nov': '11',
  'diciembre': '12', 'dic': '12'
};

// ==============================================================================
// 1. MÓDULO 11 CANÓNICO Y RUT CHILENO
// ==============================================================================

/**
 * Calcula el Dígito Verificador (DV) usando el algoritmo canónico Módulo 11
 * con ponderadores cíclicos [2, 3, 4, 5, 6, 7].
 * @param {string|number} rutBody - Cuerpo numérico del RUT.
 * @return {string} Dígito verificador ('0'-'9' o 'K').
 */
function computeDv(rutBody) {
  const cleanBody = String(rutBody).replace(/[^\d]/g, '');
  if (!cleanBody) return '';

  const multipliers = [2, 3, 4, 5, 6, 7];
  let total = 0;
  const reversed = cleanBody.split('').reverse();

  for (let i = 0; i < reversed.length; i++) {
    total += parseInt(reversed[i], 10) * multipliers[i % multipliers.length];
  }

  const remainder = total % 11;
  const diff = 11 - remainder;

  if (diff === 11) return '0';
  if (diff === 10) return 'K';
  return String(diff);
}

/**
 * Valida y normaliza un RUT chileno.
 * @param {string} rutStr - Cadena original de RUT.
 * @return {{dvValid: boolean, normalized: ?string, cleanRaw: ?string}}
 */
function validateAndNormalizeRut(rutStr) {
  if (!rutStr) {
    return { dvValid: false, normalized: null, cleanRaw: null };
  }

  const cleaned = rutStr.replace(/[\s\.]/g, '').toUpperCase();
  let body = '';
  let dv = '';

  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length !== 2) {
      return { dvValid: false, normalized: null, cleanRaw: cleaned };
    }
    body = parts[0];
    dv = parts[1];
  } else {
    if (cleaned.length < 2) {
      return { dvValid: false, normalized: null, cleanRaw: cleaned };
    }
    body = cleaned.slice(0, -1);
    dv = cleaned.slice(-1);
  }

  if (!/^\d{7,8}$/.test(body)) {
    return { dvValid: false, normalized: null, cleanRaw: cleaned };
  }

  const expectedDv = computeDv(body);
  const isValid = (dv === expectedDv);
  const normalized = body + '-' + expectedDv;

  return {
    dvValid: isValid,
    normalized: isValid ? normalized : body + '-' + dv,
    cleanRaw: body + '-' + dv
  };
}

/**
 * Extrae el RUT del emisor del comprobante, descartando explícitamente RUTs receptores.
 * @param {string} text - Texto OCR.
 * @return {Object} Objeto de procedencia de 'rut_emisor'.
 */
function extractRutEmisor(text) {
  const lines = text.split(/\r?\n/);
  let rutCandidate = null;

  // Prioridad 1: Línea con etiqueta RUT que no sea de Receptor
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('RECEPTOR') || upper.includes('SENOR') || upper.includes('SEÑOR')) {
      continue;
    }

    const match = line.match(/(?:R\.?U\.?T\.?[:\s]*)([\d]{1,2}(?:\.[\d]{3}){2}-[\dkK]|[\d]{7,8}-[\dkK]|[\d]{7,8}[\dkK])/i);
    if (match) {
      rutCandidate = match[1];
      break;
    }
  }

  // Prioridad 2: Buscar cualquier RUT en el texto descartando prefijos de receptor
  if (!rutCandidate) {
    const regex = /\b([\d]{1,2}(?:\.[\d]{3}){2}-[\dkK]|[\d]{7,8}-[\dkK])\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const idx = match.index;
      const prefix = text.substring(Math.max(0, idx - 30), idx).toUpperCase();
      if (!prefix.includes('RECEPTOR')) {
        rutCandidate = match[1];
        break;
      }
    }
  }

  if (!rutCandidate) {
    return {
      raw: null,
      normalized: null,
      dv_valid: false,
      source: 'DEFAULT',
      confidence: null,
      human_override: false
    };
  }

  const res = validateAndNormalizeRut(rutCandidate);

  return {
    raw: res.cleanRaw,
    normalized: res.normalized,
    dv_valid: res.dvValid,
    source: 'OCR',
    confidence: res.dvValid ? 0.99 : 0.50,
    human_override: false
  };
}

// ==============================================================================
// 2. EXTRACTOR DE FOLIO
// ==============================================================================

/**
 * Extrae el folio / número de comprobante.
 * @param {string} text - Texto OCR.
 * @return {Object} Objeto de procedencia de 'folio'.
 */
function rutMatchFromLine(line) {
  const match = line.match(/[\d]{1,2}(?:\.[\d]{3}){2}-[\dkK]|[\d]{7,8}-[\dkK]|[\d]{7,8}[\dkK]/i);
  return match ? match[0] : null;
}

function emptyPartyRut() {
  return {
    raw: null,
    normalized: null,
    dv_valid: false,
    source: 'DEFAULT',
    confidence: null,
    human_override: false
  };
}

function classifyPersonType(name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  const legalMarkers = [
    /\bS\.?\s*A\.?\b/, /\bS\.?\s*P\.?\s*A\.?\b/, /\bLTDA\.?\b/,
    /\bE\.?I\.?R\.?L\.?\b/, /\bSOCIEDAD\b/, /\bEMPRESA\b/,
    /\bMUNICIPALIDAD\b/, /\bCORPORACI[ÓO]N\b/, /\bFUNDACI[ÓO]N\b/,
    /\bSUPERMERCADO\b/
  ];
  return legalMarkers.some((marker) => marker.test(upper)) ? 'PERSONA_JURIDICA' : 'PERSONA_NATURAL';
}

function extractEmisor(text, rutData) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rutIndex = lines.findIndex((line) => /\bR\.?U\.?T\.?\b/i.test(line) && !/RECEPTOR|CLIENTE|ADQUIRENTE/i.test(line));
  const before = rutIndex >= 0 ? lines.slice(Math.max(0, rutIndex - 3), rutIndex) : [];
  const after = rutIndex >= 0 ? lines.slice(rutIndex + 1, rutIndex + 4) : [];
  const candidates = before.concat(after);
  const isLabel = (candidate) => /RUT|GIRO|DIRECCI[ÓO]N|CASA MATRIZ|SUCURSAL|FECHA|FOLIO/i.test(candidate);
  const legalName = candidates.find((candidate) => classifyPersonType(candidate) === 'PERSONA_JURIDICA' && !isLabel(candidate)) || null;
  const fallbackName = before.length ? before[before.length - 1] : null;
  const commercialName = before.find((candidate) => candidate !== legalName && !isLabel(candidate)) || null;

  return {
    nombre_legal: legalName || fallbackName,
    nombre_comercial: commercialName === legalName ? null : commercialName,
    tipo_persona: classifyPersonType(legalName || fallbackName),
    rut: rutData,
    source: (legalName || rutData.raw) ? 'OCR' : 'DEFAULT',
    confidence: legalName ? 0.92 : null,
    human_override: false
  };
}

function extractRutReceptor(text) {
  for (const line of text.split(/\r?\n/)) {
    const upper = line.toUpperCase();
    if (!/RUT/.test(upper) || !/RECEPTOR|CLIENTE|ADQUIRENTE/.test(upper)) continue;
    const candidate = rutMatchFromLine(line);
    if (!candidate) continue;
    const res = validateAndNormalizeRut(candidate);
    return {
      raw: res.cleanRaw,
      normalized: res.normalized,
      dv_valid: res.dvValid,
      source: 'OCR',
      confidence: res.dvValid ? 0.99 : 0.50,
      human_override: false
    };
  }
  return emptyPartyRut();
}

function extractPartes(text, emisor) {
  const receptorRut = extractRutReceptor(text);
  const identified = receptorRut.raw !== null;
  return {
    emisor: {
      rol: 'EMISOR',
      tipo_persona: emisor.tipo_persona,
      nombre: emisor.nombre_legal,
      rut: emisor.rut
    },
    adquirente: {
      rol: 'ADQUIRENTE',
      identificado: identified,
      tipo_persona: identified ? 'PERSONA_NATURAL' : null,
      nombre: null,
      rut: identified ? receptorRut : null,
      source: identified ? 'OCR' : 'NOT_PRESENT',
      confidence: identified ? receptorRut.confidence : null,
      human_override: false
    }
  };
}

function extractFolio(text) {
  const patterns = [
    /(?:FACTURA|BOLETA|COMPROBANTE|GUIA|DOCUMENTO|NOTA)\s+(?:DE\s+HONORARIOS\s+)?(?:ELECTR[ÓO]NICA\s*)?(?:N[°º:\.\s]*|[:#-]\s*)?0*([1-9]\d*)/i,
    /(?:FACTURA|BOLETA|COMPROBANTE|GUIA|DOCUMENTO|NOTA)\s+(?:DE\s+HONORARIOS\s+)?(?:ELECTRONICA\s+)?[Nn][°º:\.\s]*\s*0*([1-9]\d*)/i,
    /HONORARIOS\s+(?:ELECTRONICA\s+)?[Nn][°º:\.\s]*\s*0*([1-9]\d*)/i,
    /FOLIO\s*(?:N[°º]|NO|N)?\s*[:\.\s]*0*([1-9]\d*)/i,
    /\b[Nn][°º:]\s*0*([1-9]\d*)\b/i
  ];

  let folioInt = null;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      folioInt = parseInt(match[1], 10);
      break;
    }
  }

  if (folioInt === null) {
    return {
      raw: null,
      normalized: null,
      source: 'DEFAULT',
      confidence: null,
      human_override: false
    };
  }

  return {
    raw: String(folioInt),
    normalized: folioInt,
    source: 'OCR',
    confidence: 0.98,
    human_override: false
  };
}

// ==============================================================================
// 3. NORMALIZADOR DE FECHAS A ISO 8601 (YYYY-MM-DD)
// ==============================================================================

/**
 * Normaliza formatos de fecha comunes en Chile a ISO 8601 (YYYY-MM-DD).
 * @param {string} dateStr - Cadena original de fecha.
 * @return {?string} Fecha en formato 'YYYY-MM-DD' o null si inválida.
 */
function normalizeDateToIso(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  // 1. ISO: YYYY-MM-DD
  const isoMatch = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const y = isoMatch[1], m = parseInt(isoMatch[2], 10), d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
  }

  // 2. Formato textual: DD de [Mes] de[l] YYYY
  const textDateMatch = cleaned.match(/\b(\d{1,2})\s+(?:de\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]+)(?:\s+de|\s+del)?\s+(\d{4})\b/i);
  if (textDateMatch) {
    const d = parseInt(textDateMatch[1], 10);
    const mesTxt = textDateMatch[2].toLowerCase();
    const y = textDateMatch[3];
    if (MESES_ESPANOL[mesTxt]) {
      const m = MESES_ESPANOL[mesTxt];
      if (d >= 1 && d <= 31) {
        return y + '-' + m + '-' + String(d).padStart(2, '0');
      }
    }
  }

  // 3. Formato numérico DD/MM/YYYY o DD-MM-YYYY
  const slashMatch = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (slashMatch) {
    const d = parseInt(slashMatch[1], 10);
    const m = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
  }

  // 4. Formato DD-Mes-YYYY (ej. '10-Ago-2026')
  const shortTextMatch = cleaned.match(/\b(\d{1,2})[-/]([a-zA-Z]{3,})[-/](\d{4})\b/);
  if (shortTextMatch) {
    const d = parseInt(shortTextMatch[1], 10);
    const mesTxt = shortTextMatch[2].toLowerCase();
    const y = shortTextMatch[3];
    if (MESES_ESPANOL[mesTxt]) {
      const m = MESES_ESPANOL[mesTxt];
      if (d >= 1 && d <= 31) {
        return y + '-' + m + '-' + String(d).padStart(2, '0');
      }
    }
  }

  return null;
}

/**
 * Extrae la fecha de emisión del comprobante.
 * @param {string} text - Texto OCR.
 * @return {Object} Objeto de procedencia de 'fecha_emision'.
 */
function extractFechaEmision(text) {
  let rawDateFound = null;
  let isoDate = null;

  const patterns = [
    /(?:FECHA\s+EMISION|FECHA\s+DE\s+EMISION|FECHA\s+EMISIÓN|FECHA)\s*[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    /(?:FECHA\s+EMISION|FECHA\s+DE\s+EMISION|FECHA\s+EMISIÓN|FECHA)\s*[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4})/i,
    /(?:FECHA\s+EMISION|FECHA\s+DE\s+EMISION|FECHA\s+EMISIÓN|FECHA)\s*[:\s]*([0-9]{1,2}\s+de\s+[a-záéíóúA-ZÁÉÍÓÚ]+\s+(?:de\s+|del\s+)?[0-9]{4})/i,
    /(?:FECHA\s+EMISION|FECHA\s+DE\s+EMISION|FECHA\s+EMISIÓN|FECHA)\s*[:\s]*([0-9]{1,2}[-/][a-zA-Z]{3,}[-/][0-9]{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      rawDateFound = match[1].trim();
      isoDate = normalizeDateToIso(rawDateFound);
      if (isoDate) break;
    }
  }

  if (!isoDate) {
    const standalonePatterns = [
      /\b([0-9]{4}-[0-9]{2}-[0-9]{2})\b/,
      /\b([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4})\b/,
      /\b([0-9]{1,2}\s+de\s+[a-záéíóúA-ZÁÉÍÓÚ]+\s+(?:de\s+|del\s+)?[0-9]{4})\b/i
    ];
    for (const sp of standalonePatterns) {
      const match = text.match(sp);
      if (match) {
        const cand = match[1].trim();
        const iso = normalizeDateToIso(cand);
        if (iso) {
          rawDateFound = cand;
          isoDate = iso;
          break;
        }
      }
    }
  }

  if (!isoDate) {
    return {
      raw: null,
      iso_8601: null,
      normalized: null,
      source: 'DEFAULT',
      confidence: null,
      human_override: false
    };
  }

  return {
    raw: rawDateFound,
    iso_8601: isoDate,
    normalized: isoDate,
    source: 'OCR',
    confidence: 0.99,
    human_override: false
  };
}

// ==============================================================================
// 4. EXTRACTOR DE MONTOS Y DESGLOSE TRIBUTARIO
// ==============================================================================

/**
 * Parsea una cadena monetaria chilena a entero.
 * @param {string} amountStr - Cadena como '$12.500.000'.
 * @return {?number}
 */
function parseCurrencyAmount(amountStr) {
  if (!amountStr) return null;
  const cleaned = amountStr.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return parseInt(cleaned, 10);
}

/**
 * Formatea un número entero como monto chileno estándar '$12.500.000'.
 * @param {number} amount - Monto entero.
 * @return {string}
 */
function formatClpRaw(amount) {
  const parts = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$' + parts;
}

function amountOnLine(line) {
  const match = String(line || '').match(/^\s*(\$?\s*[\d][\d\.,]*)\s*$/);
  return match ? match[1].trim() : null;
}

function amountNearLabel(text, labelPattern, { preferPrevious = false } = {}) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim());
  const amountPattern = /(\$?\s*[\d][\d\.,]*)/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(labelPattern);
    if (!match) continue;

    const tail = line.slice(match[0].length);
    const sameLineMatches = tail.matchAll(new RegExp(amountPattern.source, 'g'));
    for (const sameLine of sameLineMatches) {
      const suffix = tail.slice(sameLine.index + sameLine[0].length).trimStart();
      if (suffix.startsWith('%')) continue;
      return sameLine[1].trim();
    }

    const neighbours = preferPrevious
      ? [index - 1, index + 1]
      : [index + 1, index - 1];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || neighbour >= lines.length) continue;
      const amount = amountOnLine(lines[neighbour]);
      if (amount) return amount;
    }
  }
  return null;
}

function currencyAmountsIn(text) {
  return (String(text || '').match(/\$\s*[\d][\d\.,]*/g) || [])
    .map(parseCurrencyAmount)
    .filter((value) => value !== null);
}

function largestCurrencyAmount(text) {
  const amounts = currencyAmountsIn(text);
  return amounts.length ? Math.max(...amounts) : null;
}

function largestCurrencyAmountBelow(text, ceiling) {
  const amounts = currencyAmountsIn(text).filter((value) => value < ceiling);
  return amounts.length ? Math.max(...amounts) : null;
}

function findCurrencyPairForTotal(text, total) {
  const amounts = currencyAmountsIn(text);
  for (let left = 0; left < amounts.length; left += 1) {
    for (let right = left + 1; right < amounts.length; right += 1) {
      if (Math.abs((amounts[left] + amounts[right]) - total) <= 1) {
        return [amounts[left], amounts[right]];
      }
    }
  }
  return null;
}

/**
 * Clasifica el tratamiento tributario y extrae montos con desglose y consistencia aritmética.
 * @param {string} text - Texto OCR.
 * @return {Object} Objeto 'montos'.
 */
function extractMontos(text) {
  const upper = text.toUpperCase();

  // Caso 1: EXEMPT (Boletas de honorarios / Exentas)
  const isHonorarios = (
    upper.includes('HONORARIOS') ||
    upper.includes('RETENCION LEGAL') ||
    upper.includes('TOTAL LIQUIDO') ||
    upper.includes('EXENTA')
  );

  if (isHonorarios) {
    const grossCandidate = amountNearLabel(text, /(?:VALOR\s+TOTAL|HONORARIOS\s+TOTALES|SUBTOTAL)\s*:?\s*/i);
    const grossVal = grossCandidate ? parseCurrencyAmount(grossCandidate) : null;
    const liquidCandidate = amountNearLabel(text, /TOTAL\s+L[ÍI]QUIDO(?:\s+A\s+PAGAR)?\s*:?\s*/i);
    let totalVal = liquidCandidate ? parseCurrencyAmount(liquidCandidate) : null;
    // Drive OCR puede devolver "0.000" o perder los primeros dígitos de la
    // línea líquida. Recuperamos el descuento desde su sección y calculamos
    // solo cuando la aritmética observada lo permite.
    if (totalVal === 0) totalVal = null;
    const retentionStart = upper.search(/RETENCI[ÓO]N/);
    const liquidStart = upper.search(/TOTAL\s+L[ÍI]QUIDO/);
    const retentionSection = retentionStart >= 0
      ? text.slice(retentionStart, liquidStart > retentionStart ? liquidStart : text.length)
      : '';
    const retentionAmounts = currencyAmountsIn(retentionSection);
    const retentionVal = retentionAmounts.length ? retentionAmounts[retentionAmounts.length - 1] : null;
    const baseVal = grossVal !== null ? grossVal : (totalVal !== null ? totalVal : null);
    if (totalVal === null && baseVal !== null && retentionVal !== null) {
      totalVal = baseVal - retentionVal;
    }
    if (totalVal === null && baseVal !== null) totalVal = baseVal;

    if (baseVal !== null && totalVal !== null) {
      const rawBase = formatClpRaw(baseVal);
      const arithmeticConsistent = retentionVal === null
        ? true
        : Math.abs((baseVal - retentionVal) - totalVal) <= 1;
      return {
        tax_breakdown: 'EXEMPT',
        monto_neto: {
          raw: rawBase,
          normalized: baseVal,
          source: 'OCR',
          confidence: 0.98,
          human_override: false
        },
        monto_iva: {
          raw: '$0',
          normalized: 0,
          source: 'OCR',
          confidence: 0.98,
          human_override: false
        },
        monto_total: {
          // En EXEMPT el contrato define monto_total como el honorario bruto;
          // el líquido pagado queda comprobable mediante la retención y la
          // consistencia aritmética, sin cambiar la semántica histórica.
          raw: rawBase,
          normalized: baseVal,
          source: 'OCR',
          confidence: 0.99,
          human_override: false
        },
        arithmetic_consistent: arithmeticConsistent
      };
    }
  }

  // Caso 2: EXPLICIT (Facturas con desglose explícito)
  const hasNeto = /\bNETO\b/.test(upper);
  const totalCandidate = amountNearLabel(
    text,
    /^\s*TOTAL(?=\s|:|$)(?:\s+A\s+PAGAR)?\s*:?\s*/i
  );
  const netoCandidate = amountNearLabel(text, /\bNETO\b/i);
  const ivaCandidate = amountNearLabel(text, /\bIVA\b/i);
  let totalVal = totalCandidate ? parseCurrencyAmount(totalCandidate) : null;
  if (totalVal === null || totalVal === 0) totalVal = largestCurrencyAmount(text);
  let netoVal = netoCandidate ? parseCurrencyAmount(netoCandidate) : null;
  let ivaVal = ivaCandidate ? parseCurrencyAmount(ivaCandidate) : null;

  if (hasNeto && netoVal !== null && totalVal !== null) {
      let netoSource = 'OCR';
      let ivaSource = 'OCR';
      if (ivaVal === null) {
        ivaVal = totalVal - netoVal;
        ivaSource = 'CALCULATED';
      }

      let consistent = Math.abs((netoVal + ivaVal) - totalVal) <= 1;
      if (ivaCandidate === null) {
        const pair = findCurrencyPairForTotal(text, totalVal);
        if (pair) {
          netoVal = Math.max(...pair);
          ivaVal = Math.min(...pair);
          netoSource = 'OCR_RECONCILED';
          ivaSource = 'OCR_RECONCILED';
          consistent = true;
        }
      }
      if (!consistent) {
        const alternateNeto = largestCurrencyAmountBelow(text, totalVal);
        if (alternateNeto !== null && alternateNeto !== netoVal) {
          const alternateIva = totalVal - alternateNeto;
          if (alternateIva >= 0) {
            netoVal = alternateNeto;
            ivaVal = alternateIva;
            netoSource = 'OCR_RECONCILED';
            ivaSource = 'CALCULATED';
            consistent = true;
          }
        }
      }

      return {
        tax_breakdown: 'EXPLICIT',
        monto_neto: {
          raw: formatClpRaw(netoVal),
          normalized: netoVal,
          source: netoSource,
          confidence: 0.98,
          human_override: false
        },
        monto_iva: {
          raw: formatClpRaw(ivaVal),
          normalized: ivaVal,
          source: ivaSource,
          confidence: 0.98,
          human_override: false
        },
        monto_total: {
          raw: formatClpRaw(totalVal),
          normalized: totalVal,
          source: 'OCR',
          confidence: 0.99,
          human_override: false
        },
        arithmetic_consistent: consistent
      };
    }

  // Caso 3: NOT_EXPLICIT (Boletas de compraventa sin desglose)
  const notExplicitTotalCandidate = amountNearLabel(
    text,
    /^\s*TOTAL(?=\s|:|$)(?:\s+A\s+PAGAR)?\s*:?\s*/i
  );
  let notExplicitTotalVal = notExplicitTotalCandidate
    ? parseCurrencyAmount(notExplicitTotalCandidate)
    : null;
  if (notExplicitTotalVal === null || notExplicitTotalVal === 0) {
    // OCR de documentos térmicos suele separar la etiqueta TOTAL de la
    // columna de importes. En ese caso el total observado es el mayor monto
    // explícitamente monetario, no el último token (que puede ser una marca de
    // agua como "$10").
    notExplicitTotalVal = largestCurrencyAmount(text);
  }

  if (notExplicitTotalVal !== null) {
    return {
      tax_breakdown: 'NOT_EXPLICIT',
      monto_neto: {
        raw: null,
        normalized: null,
        source: 'DEFAULT',
        confidence: null,
        human_override: false
      },
      monto_iva: {
        raw: null,
        normalized: null,
        source: 'DEFAULT',
        confidence: null,
        human_override: false
      },
      monto_total: {
        raw: formatClpRaw(notExplicitTotalVal),
        normalized: notExplicitTotalVal,
        source: 'OCR',
        confidence: 0.99,
        human_override: false
      },
      arithmetic_consistent: true
    };
  }

  return {
    tax_breakdown: 'NOT_EXPLICIT',
    monto_neto: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    monto_iva: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    monto_total: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    arithmetic_consistent: false
  };
}

// ==============================================================================
// 5. PIPELINE PRINCIPAL DE EXTRACCIÓN
// ==============================================================================

/**
 * Parsea el texto extraído por OCR y produce el objeto 'extraction_data'.
 * @param {string} rawOcrText - Texto crudo del OCR.
 * @param {string} [ocrEngine='drive_v3'] - Motor OCR utilizado.
 * @return {Object} Sub-objeto 'extraction_data' formal conforme a ExpenseRecord v0.2.
 */
function ocrQuality(visualVerification, parserStatus, extraReasons = []) {
  const reasons = Array.isArray(extraReasons) ? extraReasons.slice() : [];
  if (!visualVerification) reasons.unshift('RAW_OCR_REQUIRES_VISUAL_VERIFICATION');
  if (parserStatus !== 'OK') reasons.push(`PARSER_STATUS_${parserStatus}`);
  return {
    status: visualVerification && parserStatus === 'OK' ? 'VERIFIED' : 'REVIEW_REQUIRED',
    visual_verification_required: !visualVerification,
    visual_verification_status: visualVerification ? 'VERIFIED' : 'PENDING',
    confidence_basis: visualVerification ? 'human_visual_review' : 'syntactic_parser_only',
    reasons
  };
}

function parseReceipt(rawOcrText, ocrEngine = 'drive_v3', options = {}) {
  const visualVerification = options === true || Boolean(options && options.visual_verification === true);
  if (!rawOcrText || !rawOcrText.trim()) {
    return {
      ocr_engine: ocrEngine,
      extraction_status: 'FAILED',
      parser_status: 'FAILED',
      ocr_quality: ocrQuality(visualVerification, 'FAILED', ['OCR_TEXT_EMPTY']),
      rut_emisor: { raw: null, normalized: null, dv_valid: false, source: 'DEFAULT', confidence: null, human_override: false },
      folio: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
      fecha_emision: { raw: null, iso_8601: null, source: 'DEFAULT', confidence: null, human_override: false },
      montos: {
        tax_breakdown: 'NOT_EXPLICIT',
        monto_neto: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
        monto_iva: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
        monto_total: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
        arithmetic_consistent: false
      },
      emisor: {
        nombre_legal: null,
        nombre_comercial: null,
        tipo_persona: null,
        rut: emptyPartyRut(),
        source: 'DEFAULT',
        confidence: null,
        human_override: false
      },
      partes: {
        emisor: { rol: 'EMISOR', tipo_persona: null, nombre: null, rut: emptyPartyRut() },
        adquirente: {
          rol: 'ADQUIRENTE',
          identificado: false,
          tipo_persona: null,
          nombre: null,
          rut: null,
          source: 'NOT_PRESENT',
          confidence: null,
          human_override: false
        }
      }
    };
  }

  const rutData = extractRutEmisor(rawOcrText);
  const emisorData = extractEmisor(rawOcrText, rutData);
  const partesData = extractPartes(rawOcrText, emisorData);
  const folioData = extractFolio(rawOcrText);
  const fechaData = extractFechaEmision(rawOcrText);
  const montosData = extractMontos(rawOcrText);

  const criticalMissing = (
    rutData.normalized === null ||
    folioData.normalized === null ||
    fechaData.iso_8601 === null ||
    montosData.monto_total.normalized === null
  );

  let parserStatus = 'OK';
  if (criticalMissing && rutData.raw === null && folioData.raw === null) {
    parserStatus = 'FAILED';
  } else if (!rutData.dv_valid || !montosData.arithmetic_consistent || criticalMissing) {
    parserStatus = 'HUMAN_REVIEW';
  }

  let extractionStatus = parserStatus;

  // A syntactically valid OCR value can still be visually wrong.  Keep the
  // raw extraction auditable, but require an explicit visual attestation.
  if (extractionStatus === 'OK' && !visualVerification) {
    extractionStatus = 'HUMAN_REVIEW';
  }

  return {
    ocr_engine: ocrEngine,
    parser_status: parserStatus,
    extraction_status: extractionStatus,
    ocr_quality: ocrQuality(visualVerification, parserStatus),
    rut_emisor: rutData,
    emisor: emisorData,
    partes: partesData,
    folio: folioData,
    fecha_emision: fechaData,
    montos: montosData
  };
}

// Exportación para entornos Node.js / Jest (mantiene compatibilidad pura con Google Apps Script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeDv,
    validateAndNormalizeRut,
    extractRutEmisor,
    extractEmisor,
    extractRutReceptor,
    extractPartes,
    extractFolio,
    normalizeDateToIso,
    extractFechaEmision,
    parseCurrencyAmount,
    formatClpRaw,
    extractMontos,
    parseReceipt
  };
}

// Compatibilidad de transporte Apps Script: esta implementación queda al final
// para que el bundle remoto pueda recibir el mismo cierre funcional en un parche
// pequeño, sin volver a transferir todo el archivo y arriesgar las regex.
function currencyAmountsInV2(text) {
  return (String(text || '').match(/\$\s*[\d][\d\.,]*/g) || [])
    .map(parseCurrencyAmount)
    .filter((value) => value !== null);
}

function largestCurrencyAmountV2(text) {
  const amounts = currencyAmountsInV2(text);
  return amounts.length ? Math.max(...amounts) : null;
}

function largestCurrencyAmountBelowV2(text, ceiling) {
  const amounts = currencyAmountsInV2(text).filter((value) => value < ceiling);
  return amounts.length ? Math.max(...amounts) : null;
}

function findCurrencyPairForTotalV2(text, total) {
  const amounts = currencyAmountsInV2(text);
  for (let left = 0; left < amounts.length; left += 1) {
    for (let right = left + 1; right < amounts.length; right += 1) {
      if (Math.abs((amounts[left] + amounts[right]) - total) <= 1) {
        return [amounts[left], amounts[right]];
      }
    }
  }
  return null;
}

function extractMontosV2(text) {
  const upper = String(text || '').toUpperCase();
  const isHonorarios = upper.includes('HONORARIOS') || upper.includes('RETENCION LEGAL') || upper.includes('TOTAL LIQUIDO') || upper.includes('EXENTA');

  if (isHonorarios) {
    const grossCandidate = amountNearLabel(text, /(?:VALOR\s+TOTAL|HONORARIOS\s+TOTALES|SUBTOTAL)\s*:?\s*/i);
    const grossVal = grossCandidate ? parseCurrencyAmount(grossCandidate) : null;
    const liquidCandidate = amountNearLabel(text, /TOTAL\s+L[ÍI]QUIDO(?:\s+A\s+PAGAR)?\s*:?\s*/i);
    let liquidVal = liquidCandidate ? parseCurrencyAmount(liquidCandidate) : null;
    if (liquidVal === 0) liquidVal = null;
    const retentionStart = upper.search(/RETENCI[ÓO]N/);
    const liquidStart = upper.search(/TOTAL\s+L[ÍI]QUIDO/);
    const retentionSection = retentionStart >= 0 ? text.slice(retentionStart, liquidStart > retentionStart ? liquidStart : text.length) : '';
    const retentionAmounts = currencyAmountsInV2(retentionSection);
    const retentionVal = retentionAmounts.length ? retentionAmounts[retentionAmounts.length - 1] : null;
    const baseVal = grossVal !== null ? grossVal : liquidVal;
    if (liquidVal === null && baseVal !== null && retentionVal !== null) liquidVal = baseVal - retentionVal;
    if (liquidVal === null && baseVal !== null) liquidVal = baseVal;
    if (baseVal !== null && liquidVal !== null) {
      const rawBase = formatClpRaw(baseVal);
      return {
        tax_breakdown: 'EXEMPT',
        monto_neto: { raw: rawBase, normalized: baseVal, source: 'OCR', confidence: 0.98, human_override: false },
        monto_iva: { raw: '$0', normalized: 0, source: 'OCR', confidence: 0.98, human_override: false },
        monto_total: { raw: rawBase, normalized: baseVal, source: 'OCR', confidence: 0.99, human_override: false },
        arithmetic_consistent: retentionVal === null || Math.abs((baseVal - retentionVal) - liquidVal) <= 1
      };
    }
  }

  const hasNeto = /\bNETO\b/.test(upper);
  const totalCandidate = amountNearLabel(text, /^\s*TOTAL(?=\s|:|$)(?:\s+A\s+PAGAR)?\s*:?\s*/i);
  const netoCandidate = amountNearLabel(text, /\bNETO\b/i);
  const ivaCandidate = amountNearLabel(text, /\bIVA\b/i);
  let totalVal = totalCandidate ? parseCurrencyAmount(totalCandidate) : null;
  if (totalVal === null || totalVal === 0) totalVal = largestCurrencyAmountV2(text);
  let netoVal = netoCandidate ? parseCurrencyAmount(netoCandidate) : null;
  let ivaVal = ivaCandidate ? parseCurrencyAmount(ivaCandidate) : null;
  if (hasNeto && netoVal !== null && totalVal !== null) {
    let netoSource = 'OCR';
    let ivaSource = 'OCR';
    if (ivaVal === null) { ivaVal = totalVal - netoVal; ivaSource = 'CALCULATED'; }
    let consistent = Math.abs((netoVal + ivaVal) - totalVal) <= 1;
    if (ivaCandidate === null) {
      const pair = findCurrencyPairForTotalV2(text, totalVal);
      if (pair) {
        netoVal = Math.max(...pair);
        ivaVal = Math.min(...pair);
        netoSource = 'OCR_RECONCILED';
        ivaSource = 'OCR_RECONCILED';
        consistent = true;
      }
    }
    if (!consistent) {
      const alternateNeto = largestCurrencyAmountBelowV2(text, totalVal);
      if (alternateNeto !== null && alternateNeto !== netoVal) {
        const alternateIva = totalVal - alternateNeto;
        if (alternateIva >= 0) {
          netoVal = alternateNeto;
          ivaVal = alternateIva;
          netoSource = 'OCR_RECONCILED';
          ivaSource = 'CALCULATED';
          consistent = true;
        }
      }
    }
    return {
      tax_breakdown: 'EXPLICIT',
      monto_neto: { raw: formatClpRaw(netoVal), normalized: netoVal, source: netoSource, confidence: 0.98, human_override: false },
      monto_iva: { raw: formatClpRaw(ivaVal), normalized: ivaVal, source: ivaSource, confidence: 0.98, human_override: false },
      monto_total: { raw: formatClpRaw(totalVal), normalized: totalVal, source: 'OCR', confidence: 0.99, human_override: false },
      arithmetic_consistent: consistent
    };
  }

  const notExplicitTotal = largestCurrencyAmountV2(text);
  if (notExplicitTotal !== null) {
    return {
      tax_breakdown: 'NOT_EXPLICIT',
      monto_neto: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
      monto_iva: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
      monto_total: { raw: formatClpRaw(notExplicitTotal), normalized: notExplicitTotal, source: 'OCR', confidence: 0.99, human_override: false },
      arithmetic_consistent: true
    };
  }
  return {
    tax_breakdown: 'NOT_EXPLICIT',
    monto_neto: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    monto_iva: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    monto_total: { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false },
    arithmetic_consistent: false
  };
}

function extractMontos(text) {
  return extractMontosV2(text);
}

// Cierre de compatibilidad: corrige dos patrones que aparecen en OCR visual
// real sin reescribir el bundle remoto completo.
function extractFolio(text) {
  const source = String(text || '');
  const patterns = [
    /(?:FACTURA|BOLETA|COMPROBANTE|GUIA|DOCUMENTO|NOTA)\s+(?:DE\s+HONORARIOS\s+)?(?:ELECTR[ÓO]NICA\s*)?(?:N[°º:\.\s]*|[:#-]\s*)?0*([1-9]\d*)/i,
    /(?:FACTURA|BOLETA|COMPROBANTE|GUIA|DOCUMENTO|NOTA)\s+(?:DE\s+HONORARIOS\s+)?(?:ELECTRONICA\s+)?[Nn][°º:\.\s]*\s*0*([1-9]\d*)/i,
    /HONORARIOS\s+(?:ELECTRONICA\s+)?[Nn][°º:\.\s]*\s*0*([1-9]\d*)/i,
    /FOLIO\s*(?:N[°º]|NO|N)?\s*[:\.\s]*0*([1-9]\d*)/i
  ];
  const match = patterns.map((pattern) => source.match(pattern)).find(Boolean);
  if (!match) return { raw: null, normalized: null, source: 'DEFAULT', confidence: null, human_override: false };
  const folio = parseInt(match[1], 10);
  return { raw: String(folio), normalized: folio, source: 'OCR', confidence: 0.98, human_override: false };
}

function extractMontos(text) {
  const parsed = extractMontosV2(text);
  if (parsed.tax_breakdown !== 'EXPLICIT' || parsed.monto_total.normalized === null) return parsed;
  const amounts = currencyAmountsInV2(text);
  const total = parsed.monto_total.normalized;
  for (let left = 0; left < amounts.length; left += 1) {
    for (let right = left + 1; right < amounts.length; right += 1) {
      if (Math.abs((amounts[left] + amounts[right]) - total) <= 1) {
        const neto = Math.max(amounts[left], amounts[right]);
        const iva = Math.min(amounts[left], amounts[right]);
        if (parsed.monto_neto.normalized !== neto || parsed.monto_iva.normalized !== iva || parsed.monto_iva.source === 'CALCULATED') {
          return {
            tax_breakdown: 'EXPLICIT',
            monto_neto: { raw: formatClpRaw(neto), normalized: neto, source: 'OCR_RECONCILED', confidence: 0.98, human_override: false },
            monto_iva: { raw: formatClpRaw(iva), normalized: iva, source: 'OCR_RECONCILED', confidence: 0.98, human_override: false },
            monto_total: parsed.monto_total,
            arithmetic_consistent: true
          };
        }
      }
    }
  }
  return parsed;
}
