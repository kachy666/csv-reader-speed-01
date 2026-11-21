// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader's answer {columns, rows, errors} for every input
// {text, header}: same records, same broken-row policy, same error records in
// the same order. Written from the reference's stated policy (the kit's
// baseline/csv-reader/vendor/csv-reader/index.js), not by copying it: the
// reference walks one character at a time, this one scans with indexOf/slice
// and splits whole plain records at once.
//
// Policy, as the reference states it:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's short_row or
//     long_row when it ends: line the 1-based line its record starts on, counting
//     every LF, CRLF and lone CR inside quotes, and row its record's index in
//     rows, null for the header.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the
// next. One run(input) call reads its text once, left to right.
//
// Speed: every search is bounded by the line or field it works on, never by the
// rest of the text (an indexOf('\r') over a whole LF file would scan to the next
// stray CR, thousands of characters away, on every field). A record's line end
// is found once per record and shared by its fields; an unquoted field is read
// with one slice that serves as both its CR check and its value.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;
  let recordLine = 1;
  let recordRow = null;
  let lineEnd = len;
  let uqEnded = END;
  let uqAdded = 0;
  function readUnquoted(value) {
    uqAdded = 0;
    if (pos > lineEnd) {
      const n = text.indexOf('\n', pos);
      lineEnd = n === -1 ? len : n;
    }
    for (;;) {
      const comma = text.indexOf(',', pos);
      let end = lineEnd;
      let isComma = false;
      if (comma !== -1 && comma < lineEnd) { end = comma; isComma = true; }
      // One slice serves as the CR check and the value: a CR in it is either the CRLF at the line
      // end (the field's last character, followed by the LF at lineEnd) or a stray CR to drop.
      const seg = text.slice(pos, end);
      const crAt = seg.indexOf('\r');
      if (crAt !== -1) {
        if (crAt === seg.length - 1 && end === lineEnd && lineEnd < len) {
          if (crAt > 0) { value += seg.slice(0, -1); uqAdded += crAt; }
          pos = end + 1; line += 1; uqEnded = LINE_BREAK; return value;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (crAt > 0) { value += seg.slice(0, crAt); uqAdded += crAt; }
        pos += crAt + 1;
        continue;
      }
      if (seg.length > 0) { value += seg; uqAdded += seg.length; }
      if (isComma) { pos = end + 1; uqEnded = COMMA; }
      else if (end < len) { pos = end + 1; line += 1; uqEnded = LINE_BREAK; }
      else { pos = len; uqEnded = END; }
      return value;
    }
  }
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = text.indexOf('"', pos + 1);
    let hasDouble = false;
    let closed = -1;
    while (p !== -1) {
      if (text.charCodeAt(p + 1) === 34) { hasDouble = true; p = text.indexOf('"', p + 2); continue; }
      closed = p; break;
    }
    if (closed === -1) {
      pos = open + 1; line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    let value = text.slice(open + 1, closed);
    if (value.indexOf('\r') !== -1) value = value.replace(/\r\n?/g, '\n');
    if (hasDouble) value = value.replaceAll('""', '"');
    let i = value.indexOf('\n');
    while (i !== -1) { line += 1; i = value.indexOf('\n', i + 1); }
    const q = closed + 1;
    if (q >= len) { pos = len; uqEnded = END; return value; }
    const c = text.charCodeAt(q);
    if (c === 44) { pos = q + 1; uqEnded = COMMA; return value; }
    if (c === 10) { pos = q + 1; line += 1; uqEnded = LINE_BREAK; return value; }
    if (c === 13 && text.charCodeAt(q + 1) === 10) { pos = q + 2; line += 1; uqEnded = LINE_BREAK; return value; }
    pos = q;
    const junk = readUnquoted(value);
    if (uqAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; return; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  while (true) {
    while (pos < len) {
      if (text.charCodeAt(pos) === 10) { pos += 1; line += 1; }
      else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= len) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const nl = text.indexOf('\n', pos);
    if (nl !== -1) {
      const lineText = text.slice(pos, nl);
      if (lineText.indexOf('"') === -1) {
        const crAt = lineText.indexOf('\r');
        if (crAt === -1) { finishRecord(lineText.split(',')); pos = nl + 1; line += 1; continue; }
        if (crAt === lineText.length - 1) { finishRecord(lineText.slice(0, -1).split(',')); pos = nl + 1; line += 1; continue; }
      }
      lineEnd = nl;
    } else {
      const rest = text.slice(pos);
      if (rest.indexOf('"') === -1 && rest.indexOf('\r') === -1) { finishRecord(rest.split(',')); pos = len; break; }
      lineEnd = len;
    }
    const fields = [];
    let quoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) { quoted = true; fields.push(readQuoted()); }
      else { quoted = false; fields.push(readUnquoted('')); }
      ended = uqEnded;
    } while (ended === COMMA);
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
